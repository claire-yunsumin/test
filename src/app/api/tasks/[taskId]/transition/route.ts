import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const supabase = createRouteClient();

  // 1️⃣ Auth 체크
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const userId = user.id;
  const taskId = params.taskId;

  const body = await req.json().catch(() => null);
  const to_state = body?.to_state;
  const idempotencyKey = req.headers.get("Idempotency-Key");

  if (!to_state) {
    return NextResponse.json(
      { error: "to_state is required" },
      { status: 400 }
    );
  }

  // 2️⃣ 조직 멤버십 확인
  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .single();

  if (!membership) return forbidden();

  const userOrgId = membership.org_id;

  // 3️⃣ 태스크 존재 + 조직 소속 확인
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, org_id")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json(
      { error: "TASK_NOT_FOUND" },
      { status: 404 }
    );
  }

  if (task.org_id !== userOrgId) {
    return forbidden();
  }

  // 4️⃣ 실제 상태 전이 실행
  const { data, error } = await supabase.rpc("transition_task_atomic", {
    p_task_id: taskId,
    p_to_state: to_state,
    p_user_id: userId,
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error) {
    const message = error.message ?? "UNKNOWN_ERROR";

    // 🔥 상태 충돌류는 409로 통일
    const conflictErrors = [
      "INVALID_TRANSITION",
      "TASK_PENDING_APPROVAL",
      "TASK_ALREADY_DONE",
      "TASK_ALREADY_IN_PROGRESS",
      "IDEMPOTENCY_CONFLICT"
    ];

    if (conflictErrors.includes(message)) {
      return NextResponse.json(
        { error: message },
        { status: 409 }
      );
    }

    // 정책 없음은 설계 오류이므로 400 유지
    if (message === "NO_ACTIVE_POLICY") {
      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    // 그 외 예기치 못한 에러
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    status: row?.result_status,
    approval_id: row?.approval_id ?? null,
  });
}
