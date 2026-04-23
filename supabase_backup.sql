


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."apply_task_event_projection"("p_task_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  t record;
  last_ev record;
begin
  -- 1) tasks 기본 정보
  select id, org_id, template_version_id, current_state, form_data
  into t
  from tasks
  where id = p_task_id;

  if not found then
    return;
  end if;

  -- 2) 가장 최신 이벤트
  select *
  into last_ev
  from task_events
  where task_id = p_task_id
  order by created_at desc
  limit 1;

  -- 3) task_read_models upsert
  insert into task_read_models (
    task_id,
    org_id,
    template_version_id,
    title,
    current_state,
    last_event_at,
    updated_at
  )
  values (
    t.id,
    t.org_id,
    t.template_version_id,
    coalesce(t.form_data->>'title', null),
    t.current_state,
    coalesce(last_ev.created_at, now()),
    now()
  )
  on conflict (task_id) do update set
    org_id = excluded.org_id,
    template_version_id = excluded.template_version_id,
    title = excluded.title,
    current_state = excluded.current_state,
    last_event_at = excluded.last_event_at,
    updated_at = now();

  -- 4) task_header_summary upsert
  insert into task_header_summary (
    task_id,
    current_state,
    last_transition,
    last_event_at,
    updated_at
  )
  values (
    t.id,
    t.current_state,
    case
      when last_ev.event_type = 'STATE_TRANSITION'
      then last_ev.payload_json
      else null
    end,
    coalesce(last_ev.created_at, now()),
    now()
  )
  on conflict (task_id) do update set
    current_state = excluded.current_state,
    last_transition = excluded.last_transition,
    last_event_at = excluded.last_event_at,
    updated_at = now();

end;
$$;


ALTER FUNCTION "public"."apply_task_event_projection"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_task"("p_approval_id" "uuid", "p_actor_id" "uuid" DEFAULT NULL::"uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_task_id uuid;
  v_from_state text;
  v_to_state text;
  v_approval_status text;
  v_task_state text;
  v_existing jsonb;
begin
  -- (옵션) 멱등성: 같은 키면 같은 응답 반환
  if p_idempotency_key is not null then
    select response into v_existing
    from public.idempotency_keys
    where key = p_idempotency_key
    for update;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- 1) approval row lock
  select task_id, status, target_state
    into v_task_id, v_approval_status, v_to_state
  from public.approval_requests
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'APPROVAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_approval_status <> 'PENDING' then
    raise exception 'APPROVAL_ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  -- 2) task row lock
  select current_state
    into v_task_state
  from public.tasks
  where id = v_task_id
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_task_state <> 'PENDING_APPROVAL' then
    raise exception 'TASK_NOT_PENDING_APPROVAL' using errcode = 'P0001';
  end if;

  v_from_state := v_task_state;

  -- 3) 승인 반영
  update public.approval_requests
    set status = 'APPROVED',
        approved_at = now(),
        approved_by = p_actor_id
  where id = p_approval_id;

  -- 4) task 상태 변경
  update public.tasks
    set current_state = v_to_state,
        updated_at = now()
  where id = v_task_id;

  -- 5) 이벤트 기록
  insert into public.task_events(task_id, event_type, payload, created_at)
  values (
    v_task_id,
    'APPROVAL_APPROVED',
    jsonb_build_object(
      'approval_id', p_approval_id,
      'from_state', v_from_state,
      'to_state', v_to_state,
      'actor_id', p_actor_id
    ),
    now()
  );

  -- 6) (옵션) projection 갱신: 지금 구조에 맞게 택1
  -- A) read model을 이벤트 기반으로 따로 돌린다 -> 여기선 생략
  -- B) 여기서 upsert 한다 -> 아래 예시 (테이블/컬럼명은 너 프로젝트에 맞게)
  -- insert into public.task_read_model(task_id, current_state, approval_stat, blocking_reason, last_event_type, updated_at)
  -- values (v_task_id, v_to_state, 'APPROVED', null, 'APPROVAL_APPROVED', now())
  -- on conflict (task_id) do update
  -- set current_state = excluded.current_state,
  --     approval_stat = excluded.approval_stat,
  --     blocking_reason = excluded.blocking_reason,
  --     last_event_type = excluded.last_event_type,
  --     updated_at = excluded.updated_at;

  -- 7) 멱등성 저장
  if p_idempotency_key is not null then
    insert into public.idempotency_keys(key, response, created_at)
    values (
      p_idempotency_key,
      jsonb_build_object(
        'status', 'APPROVED',
        'task_id', v_task_id,
        'task_state', v_to_state,
        'approval_id', p_approval_id
      ),
      now()
    )
    on conflict (key) do nothing;
  end if;

  return jsonb_build_object(
    'status', 'APPROVED',
    'task_id', v_task_id,
    'task_state', v_to_state,
    'approval_id', p_approval_id
  );
end;
$$;


ALTER FUNCTION "public"."approve_task"("p_approval_id" "uuid", "p_actor_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_task_atomic"("p_approval_id" "uuid", "p_user_id" "uuid") RETURNS TABLE("result_status" "text")
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_req RECORD;
  v_task RECORD;
  v_target_state text;
BEGIN

  -- 1️⃣ approval row lock
  SELECT *
  INTO v_req
  FROM approval_requests
  WHERE id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND';
  END IF;

  -- 2️⃣ task row lock
  SELECT *
  INTO v_task
  FROM tasks
  WHERE id = v_req.task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  -- 3️⃣ 상태 검증
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED';
  END IF;

  IF v_task.current_state <> 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  -- 4️⃣ target state 확보
  v_target_state := v_req.meta->>'to_state';

  IF v_target_state IS NULL THEN
    RAISE EXCEPTION 'INVALID_APPROVAL_META';
  END IF;

  -- 5️⃣ approval 확정
  UPDATE approval_requests
  SET status = 'APPROVED',
      decided_by = p_user_id,
      decided_at = now()
  WHERE id = p_approval_id;

  -- 6️⃣ task 상태 확정
  UPDATE tasks
  SET current_state = v_target_state
  WHERE id = v_req.task_id;

  -- 7️⃣ event 기록
  INSERT INTO task_events (
    id,
    task_id,
    event_type,
    actor_id,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_req.task_id,
    'APPROVAL_COMPLETED',
    p_user_id,
    now()
  );

  -- [가이드 6단계 추가] 리프레시 호출
  -- v_req.task_id를 사용하여 변경된 태스크의 읽기 모델을 갱신합니다.
  PERFORM refresh_task_read_models(v_req.task_id);

  result_status := v_target_state;
  RETURN NEXT;
END;$$;


ALTER FUNCTION "public"."approve_task_atomic"("p_approval_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_task_atomic"("p_org_id" "uuid", "p_template_version_id" "uuid", "p_title" "text", "p_created_by" "uuid") RETURNS TABLE("task_id" "uuid", "current_state" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_task_id uuid;
BEGIN
  -- 1️⃣ Task 생성 (title 반드시 포함)
  INSERT INTO tasks (
    id,
    org_id,
    template_version_id,
    title,
    current_state,
    created_at,
    created_by
  )
  VALUES (
    gen_random_uuid(),
    p_org_id,
    p_template_version_id,
    p_title,
    'DRAFT',
    now(),
    p_created_by
  )
  RETURNING id INTO v_task_id;

  -- 2️⃣ 이벤트 기록
  INSERT INTO task_events (
    id,
    task_id,
    event_type,
    payload_json,
    actor_id,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_task_id,
    'TASK_CREATED',
    jsonb_build_object(
      'title', p_title,
      'result_status', 'DRAFT'
    ),
    p_created_by,
    now()
  );

  -- 3️⃣ projection refresh
  PERFORM refresh_task_read_models(v_task_id);

  task_id := v_task_id;
  current_state := 'DRAFT';
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."create_task_atomic"("p_org_id" "uuid", "p_template_version_id" "uuid", "p_title" "text", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select auth.uid();
$$;


ALTER FUNCTION "public"."current_user_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_member"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_role"("p_org_id" "uuid", "p_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = auth.uid() and m.role = p_role
  );
$$;


ALTER FUNCTION "public"."is_org_role"("p_org_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_task_read_models"("p_task_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$begin
  insert into task_read_models (
    task_id,
    org_id,
    template_version_id,
    title,
    current_state,
    created_at,
    last_event_at,
    updated_at
  )
  select
    t.id,
    t.org_id,
    t.template_version_id,
    coalesce(t.title, ''),
    t.current_state,
    t.created_at,
    (
      select max(e.created_at)
      from task_events e
      where e.task_id = t.id
    ),
    now()
  from tasks t
  where t.id = p_task_id
  on conflict (task_id)
  do update
  set
    org_id = excluded.org_id,
    template_version_id = excluded.template_version_id,
    title = excluded.title,
    current_state = excluded.current_state,
    created_at = excluded.created_at,
    last_event_at = excluded.last_event_at,
    updated_at = excluded.updated_at;
end;$$;


ALTER FUNCTION "public"."refresh_task_read_models"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_transition_with_approval"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS TABLE("result_status" "text", "approval_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_task RECORD;
  v_rule RECORD;
  v_policy RECORD;
  v_new_approval_id uuid;
BEGIN

  -- 1️⃣ Task 조회 (행 잠금)
  SELECT *
  INTO v_task
  FROM tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  -- 2️⃣ 이미 승인 대기면 차단
  IF v_task.current_state = 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'TASK_PENDING_APPROVAL';
  END IF;

  -- 3️⃣ transition rule 조회
  SELECT tr.*
  INTO v_rule
  FROM transition_rules tr
  JOIN template_versions tv
    ON tv.id = v_task.template_version_id
  WHERE tr.template_id = tv.template_id
    AND tr.from_status = v_task.current_state
    AND tr.to_status = p_to_state;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  -- 4️⃣ 승인 필요 없는 경우 → 바로 상태 변경
  IF v_rule.requires_approval = false THEN

    UPDATE tasks
    SET current_state = p_to_state
    WHERE id = p_task_id;

    result_status := p_to_state;
    approval_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 5️⃣ 정책 조회
  SELECT *
  INTO v_policy
  FROM approval_policies
  WHERE org_id = v_task.org_id
    AND key = (v_rule.guard_config->>'policy_key')
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_ACTIVE_POLICY';
  END IF;

  -- 6️⃣ 기존 PENDING approval 있는지 체크 (멱등성)
  SELECT id
  INTO v_new_approval_id
  FROM approval_requests
  WHERE task_id = p_task_id
    AND status = 'PENDING'
  LIMIT 1;

  IF FOUND THEN
    result_status := 'PENDING_APPROVAL';
    approval_id := v_new_approval_id;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 7️⃣ approval 생성
  INSERT INTO approval_requests (
    id,
    task_id,
    policy_id,
    step_index,
    status,
    meta,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    p_task_id,
    v_policy.id,
    0,
    'PENDING',
    jsonb_build_object(
      'from_state', v_task.current_state,
      'to_state', p_to_state
    ),
    now()
  )
  RETURNING id INTO v_new_approval_id;

  -- 8️⃣ task 상태 변경
  UPDATE tasks
  SET current_state = 'PENDING_APPROVAL'
  WHERE id = p_task_id;

  result_status := 'PENDING_APPROVAL';
  approval_id := v_new_approval_id;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."request_transition_with_approval"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_task"("p_task_id" "uuid", "p_to_state" "text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_task record;
  v_version record;
  v_allowed boolean;
  v_updated record;
begin
  -- 1) task row lock
  select * into v_task
  from tasks
  where id = p_task_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'Task not found');
  end if;

  -- 2) 멱등 처리: 이미 같은 상태면 성공으로 반환(선택)
  if v_task.current_state = p_to_state then
    return jsonb_build_object('ok', true, 'status', 200, 'data', row_to_json(v_task)::jsonb, 'idempotent', true);
  end if;

  -- 3) workflow 조회
  select workflow_json into v_version
  from template_versions
  where id = v_task.template_version_id;

  if not found then
    return jsonb_build_object('ok', false, 'status', 500, 'error', 'Template version not found');
  end if;

  -- 4) transition 허용 체크
  select exists (
    select 1
    from jsonb_array_elements(v_version.workflow_json->'transitions') as t
    where (t->>'from') = v_task.current_state
      and (t->>'to') = p_to_state
  ) into v_allowed;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid transition');
  end if;

  -- 5) 상태 업데이트
  update tasks
  set current_state = p_to_state
  where id = p_task_id
  returning * into v_updated;

  -- 6) audit event (멱등 키 있으면 유니크로 중복 방지)
  insert into task_events(task_id, event_type, payload_json, idempotency_key)
  values (
    p_task_id,
    'transition',
    jsonb_build_object('from_state', v_task.current_state, 'to_state', p_to_state),
    p_idempotency_key
  )
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('ok', true, 'status', 200, 'data', row_to_json(v_updated)::jsonb);
end;
$$;


ALTER FUNCTION "public"."transition_task"("p_task_id" "uuid", "p_to_state" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_task_atomic"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS TABLE("result_status" "text", "approval_id" "uuid")
    LANGUAGE "plpgsql"
    AS $$declare
  v_task record;
  v_rule record;
  v_policy record;
  v_approval_id uuid;
  v_from_state text;
  v_template_id uuid;
  v_payload jsonb;
  v_existing_event record;
begin
  -- 0) 멱등: idempotency_key로 이미 처리된 요청이면 같은 결과 리턴
  if p_idempotency_key is not null then
    select e.payload_json
      into v_existing_event
    from task_events e
    where e.task_id = p_task_id
      and e.idempotency_key = p_idempotency_key
    order by e.created_at desc
    limit 1;

    if found then
      result_status := coalesce(v_existing_event.payload_json->>'result_status', 'OK');
      approval_id := nullif(v_existing_event.payload_json->>'approval_id', '')::uuid;
      return next;
      return;
    end if;
  end if;

  -- 1) Task row lock
  select *
    into v_task
  from tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;

  v_from_state := v_task.current_state;

  -- 2) 이미 승인대기면 무조건 reject (너희 규정)
  if v_task.current_state = 'PENDING_APPROVAL' then
    raise exception 'TASK_PENDING_APPROVAL';
  end if;

  if p_to_state is null or length(trim(p_to_state)) = 0 then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- template_id 확보 (template_versions 통해서)
  select tv.template_id
    into v_template_id
  from template_versions tv
  where tv.id = v_task.template_version_id;

  if v_template_id is null then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- 3) transition rule 조회
  select tr.*
    into v_rule
  from transition_rules tr
  where tr.template_id = v_template_id
    and tr.from_status = v_from_state
    and tr.to_status = p_to_state;

  if not found then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- 4) 승인 필요 없는 경우: 즉시 상태 전이 + 이벤트 + 프로젝션
  if v_rule.requires_approval = false then
    update tasks
      set current_state = p_to_state
    where id = p_task_id;

    v_payload := jsonb_build_object(
      'from_state', v_from_state,
      'to_state', p_to_state,
      'result_status', p_to_state
    );

    insert into task_events (
      id, task_id, event_type, payload_json, actor_id, created_at, idempotency_key, type
    ) values (
      gen_random_uuid(), p_task_id, 'STATE_TRANSITION', v_payload, p_user_id, now(), p_idempotency_key, null
    );


    -- [가이드 6단계 추가] 리프레시 호출
    perform refresh_task_read_models(p_task_id);

    result_status := p_to_state;
    approval_id := null;
    return next;
    return;
  end if;

  -- 5) 승인 필요한 경우: 정책 조회 (최신 active 1개)
  select ap.*
    into v_policy
  from approval_policies ap
  where ap.org_id = v_task.org_id
    and ap.key = (v_rule.guard_config->>'policy_key')
    and ap.is_active = true
  order by ap.version desc
  limit 1;

  if not found then
    raise exception 'NO_ACTIVE_POLICY';
  end if;

  -- 6) (규정) 기존 PENDING approval이 있으면 무조건 reject
  select ar.id
    into v_approval_id
  from approval_requests ar
  where ar.task_id = p_task_id
    and ar.status = 'PENDING'
  limit 1;

  if found then
    raise exception 'APPROVAL_ALREADY_PENDING';
  end if;

  -- 7) approval 생성 (동시성: unique partial index 위반 시 409로 매핑)
  begin
    insert into approval_requests (
      id, task_id, policy_id, step_index, status, meta, created_at
    ) values (
      gen_random_uuid(),
      p_task_id,
      v_policy.id,
      0,
      'PENDING',
      jsonb_build_object('from_state', v_from_state, 'to_state', p_to_state),
      now()
    )
    returning id into v_approval_id;
  exception
    when unique_violation then
      raise exception 'APPROVAL_ALREADY_PENDING';
  end;

  -- 8) task 상태를 PENDING_APPROVAL로 전환
  update tasks
    set current_state = 'PENDING_APPROVAL'
  where id = p_task_id;

  -- 9) 이벤트 + 프로젝션
  v_payload := jsonb_build_object(
    'from_state', v_from_state,
    'to_state', p_to_state,
    'approval_id', v_approval_id,
    'result_status', 'PENDING_APPROVAL'
  );

  insert into task_events (
    id, task_id, event_type, payload_json, actor_id, created_at, idempotency_key, type
  ) values (
    gen_random_uuid(), p_task_id, 'APPROVAL_REQUESTED', v_payload, p_user_id, now(), p_idempotency_key, null
  );


  -- [가이드 6단계 추가] 리프레시 호출
  perform refresh_task_read_models(p_task_id);

  result_status := 'PENDING_APPROVAL';
  approval_id := v_approval_id;
  return next;
end;$$;


ALTER FUNCTION "public"."transition_task_atomic"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."action_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."action_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "version" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."approval_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "policy_id" "uuid" NOT NULL,
    "step_index" integer DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "version" integer NOT NULL,
    "name" "text" NOT NULL,
    "schema" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ui_schema" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."idempotency_keys" (
    "key" "text" NOT NULL,
    "response" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."idempotency_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."orgs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "state" "text",
    "type" "text",
    "config" "jsonb"
);


ALTER TABLE "public"."policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload_json" "jsonb",
    "actor_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "idempotency_key" "text",
    "type" "text"
);


ALTER TABLE "public"."task_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_header_summary" (
    "task_id" "uuid" NOT NULL,
    "current_state" "text" NOT NULL,
    "last_transition" "jsonb",
    "last_event_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_header_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid",
    "user_id" "uuid",
    "action" "text",
    "meta" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_read_models" (
    "task_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "template_version_id" "uuid",
    "title" "text",
    "current_state" "text" NOT NULL,
    "last_event_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."task_read_models" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "created_by" "uuid",
    "current_state" "text",
    "form_data" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "org_id" "uuid",
    "template_version_id" "uuid",
    "title" "text"
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "version" integer NOT NULL,
    "form_schema_json" "jsonb" NOT NULL,
    "workflow_json" "jsonb" NOT NULL,
    "policy_json" "jsonb",
    "published_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."template_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "description" "text",
    "category" "text",
    "created_by" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "org_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text"
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transition_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "from_status" "text" NOT NULL,
    "to_status" "text" NOT NULL,
    "requires_approval" boolean DEFAULT false,
    "allowed_roles" "text"[] DEFAULT '{}'::"text"[],
    "guard_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transition_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid",
    "states" "jsonb",
    "transitions" "jsonb"
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."action_queue"
    ADD CONSTRAINT "action_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_policies"
    ADD CONSTRAINT "approval_policies_org_id_key_version_key" UNIQUE ("org_id", "key", "version");



ALTER TABLE ONLY "public"."approval_policies"
    ADD CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_org_id_key_version_key" UNIQUE ("org_id", "key", "version");



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_user_id_key" UNIQUE ("org_id", "user_id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."policies"
    ADD CONSTRAINT "policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_events"
    ADD CONSTRAINT "task_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_header_summary"
    ADD CONSTRAINT "task_header_summary_pkey" PRIMARY KEY ("task_id");



ALTER TABLE ONLY "public"."task_logs"
    ADD CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_read_models"
    ADD CONSTRAINT "task_read_models_pkey" PRIMARY KEY ("task_id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_versions"
    ADD CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_versions"
    ADD CONSTRAINT "template_versions_template_id_version_key" UNIQUE ("template_id", "version");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transition_rules"
    ADD CONSTRAINT "transition_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_memberships_org" ON "public"."memberships" USING "btree" ("org_id");



CREATE INDEX "idx_memberships_user" ON "public"."memberships" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_task_events_idempotency" ON "public"."task_events" USING "btree" ("task_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_task_events_task_id" ON "public"."task_events" USING "btree" ("task_id");



CREATE UNIQUE INDEX "task_events_idempotency_key_unique" ON "public"."task_events" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "task_events_idempotency_key_uq" ON "public"."task_events" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "task_read_models_created_at_idx" ON "public"."task_read_models" USING "btree" ("created_at" DESC);



CREATE INDEX "task_read_models_last_event_at_idx" ON "public"."task_read_models" USING "btree" ("last_event_at" DESC);



CREATE INDEX "task_read_models_org_id_idx" ON "public"."task_read_models" USING "btree" ("org_id");



CREATE UNIQUE INDEX "ux_approval_one_pending_per_task" ON "public"."approval_requests" USING "btree" ("task_id") WHERE ("status" = 'PENDING'::"text");



CREATE UNIQUE INDEX "ux_task_events_idempotency_key" ON "public"."task_events" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_memberships_updated_at" BEFORE UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_orgs_updated_at" BEFORE UPDATE ON "public"."orgs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."action_queue"
    ADD CONSTRAINT "action_queue_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."action_queue"
    ADD CONSTRAINT "action_queue_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_policies"
    ADD CONSTRAINT "approval_policies_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."approval_policies"("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forms"
    ADD CONSTRAINT "forms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_events"
    ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_header_summary"
    ADD CONSTRAINT "task_header_summary_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_read_models"
    ADD CONSTRAINT "task_read_models_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id");



ALTER TABLE ONLY "public"."template_versions"
    ADD CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transition_rules"
    ADD CONSTRAINT "transition_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transition_rules"
    ADD CONSTRAINT "transition_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id");



CREATE POLICY "allow authenticated select task_read_models" ON "public"."task_read_models" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "org_scope_read" ON "public"."task_read_models" FOR SELECT USING (("org_id" IN ( SELECT "memberships"."org_id"
   FROM "public"."memberships"
  WHERE ("memberships"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."task_read_models" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."apply_task_event_projection"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_task_event_projection"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_task_event_projection"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_task"("p_approval_id" "uuid", "p_actor_id" "uuid", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_task"("p_approval_id" "uuid", "p_actor_id" "uuid", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_task"("p_approval_id" "uuid", "p_actor_id" "uuid", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_task_atomic"("p_approval_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_task_atomic"("p_approval_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_task_atomic"("p_approval_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_task_atomic"("p_org_id" "uuid", "p_template_version_id" "uuid", "p_title" "text", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_task_atomic"("p_org_id" "uuid", "p_template_version_id" "uuid", "p_title" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_task_atomic"("p_org_id" "uuid", "p_template_version_id" "uuid", "p_title" "text", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_role"("p_org_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_role"("p_org_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_role"("p_org_id" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_task_read_models"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_task_read_models"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_task_read_models"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_transition_with_approval"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_transition_with_approval"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_transition_with_approval"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transition_task"("p_task_id" "uuid", "p_to_state" "text", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transition_task"("p_task_id" "uuid", "p_to_state" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_task"("p_task_id" "uuid", "p_to_state" "text", "p_idempotency_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."transition_task_atomic"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transition_task_atomic"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_task_atomic"("p_task_id" "uuid", "p_to_state" "text", "p_user_id" "uuid", "p_idempotency_key" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."action_queue" TO "anon";
GRANT ALL ON TABLE "public"."action_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."action_queue" TO "service_role";



GRANT ALL ON TABLE "public"."approval_policies" TO "anon";
GRANT ALL ON TABLE "public"."approval_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_policies" TO "service_role";



GRANT ALL ON TABLE "public"."approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."forms" TO "anon";
GRANT ALL ON TABLE "public"."forms" TO "authenticated";
GRANT ALL ON TABLE "public"."forms" TO "service_role";



GRANT ALL ON TABLE "public"."idempotency_keys" TO "anon";
GRANT ALL ON TABLE "public"."idempotency_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."idempotency_keys" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."orgs" TO "anon";
GRANT ALL ON TABLE "public"."orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."orgs" TO "service_role";



GRANT ALL ON TABLE "public"."policies" TO "anon";
GRANT ALL ON TABLE "public"."policies" TO "authenticated";
GRANT ALL ON TABLE "public"."policies" TO "service_role";



GRANT ALL ON TABLE "public"."task_events" TO "anon";
GRANT ALL ON TABLE "public"."task_events" TO "authenticated";
GRANT ALL ON TABLE "public"."task_events" TO "service_role";



GRANT ALL ON TABLE "public"."task_header_summary" TO "anon";
GRANT ALL ON TABLE "public"."task_header_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."task_header_summary" TO "service_role";



GRANT ALL ON TABLE "public"."task_logs" TO "anon";
GRANT ALL ON TABLE "public"."task_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."task_logs" TO "service_role";



GRANT ALL ON TABLE "public"."task_read_models" TO "anon";
GRANT ALL ON TABLE "public"."task_read_models" TO "authenticated";
GRANT ALL ON TABLE "public"."task_read_models" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."template_versions" TO "anon";
GRANT ALL ON TABLE "public"."template_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."template_versions" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."transition_rules" TO "anon";
GRANT ALL ON TABLE "public"."transition_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."transition_rules" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































