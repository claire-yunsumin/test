# 백엔드 이해 가이드

## 한 줄 요약

현재 백엔드는 `Express + Zod + 인메모리 데이터` 기반입니다. 인증, 역할, 리소스 가시성, 입력 검증, 이벤트 기록은 서버에서 강제합니다.

## 파일 구조

```text
apps/api/src/
  server.ts           라우트 등록, 앱 팩토리, 전이/CRUD 처리
  domain/store.ts     data, serializeTask, addTimeline, addInbox, addEngagement, calculateAnalytics
  http/access.ts      authenticate, requireRole, visibleTaskIdsFor, validateNoteRefs, validateMentions
  http/security.ts    보안 헤더, CORS, rate limit
  http/validation.ts  text, optionalText
  security.test.ts    보안/인가/검증/CRUD 회귀 테스트
```

## 요청 처리 흐름

1. `authenticate`가 `X-Demo-User-Id`로 사용자를 식별합니다.
2. `requireRole` 또는 `getVisibleTask`가 역할과 가시성을 검증합니다.
3. Zod schema가 body/query 입력을 검증합니다.
4. 라우트가 `data`를 변경하고 필요한 이벤트를 생성합니다.
5. `serializeTask`가 Template, activity, owner/assignee/watcher를 포함한 뷰 모델을 반환합니다.

## 역할 모델

역할 순서:

```text
MEMBER < OWNER < ADMIN < SUPER_ADMIN
```

- `MEMBER`: 태스크 생성과 댓글/노트 같은 협업 행동을 수행합니다. 보이는 태스크라도 필드 수정은 task owner, assignee, unit owner, admin 계열로 제한됩니다.
- `OWNER`: 전역 역할 계층상 MEMBER보다 높은 역할이며, 실제 유닛 운영 권한은 `UnitMember.role=OWNER`로 판단합니다.
- `ADMIN`: 전체 태스크 가시성과 관리 API 접근 권한을 가집니다.
- `SUPER_ADMIN`: ADMIN 이상 권한이며 IT 인프라 담당자 역할로 사용됩니다.

## 가시성 모델

- `ADMIN`과 `SUPER_ADMIN`은 모든 태스크를 볼 수 있습니다.
- 일반 사용자는 `ownerId`, `assigneeIds`, `watcherIds`에 포함된 태스크와 그 parent chain을 볼 수 있습니다.
- 노트 참조와 멘션 검증은 visible task 집합을 기준으로 합니다.
- parent chain 순회는 cycle 방어를 포함합니다.

## 주요 도메인

- Workspace: `Unit`, `Folder`, `TaskList`
- Work Graph: `Task.parentId`, `structureState`, `templateId`
- Task runtime snapshots: `templateSnapshot`, `workflowSnapshot`, `formSnapshot`, `approvalPolicySnapshot`
- 실행 분류: `workflowPhase`, `phaseOverride`, `workflowStatusId`
- 협업: `Note`(title/content/tags), `ThreadComment`, `Mention`
- 기록: `TimelineEvent`, `InboxItem`, `EngagementEvent`
- 정책: `Template`, `ApprovalPolicy`, `ApprovalRequest`, `ApprovalDecision`, `NotificationSettings`, `WebPushSubscription`

## 이벤트 처리

- `addTimeline`: 생성, 수정, 구조 변경, 전이, 노트 변경 등을 기록합니다.
- `addInbox`: 결정/논의/인지/결과 알림을 만듭니다.
- `addEngagement`: 노드 생성, Template 적용, Form 저장, 댓글/멘션, 방문 등 분석용 행동을 기록합니다.
- `calculateAnalytics`: 현재 이벤트와 콘텐츠 상태를 기준으로 리텐션/협업 지표를 계산합니다.
- 템플릿 교체 시 상태는 `mapWorkflowStatusForTemplate()`(카테고리 -> default -> legacy fallback)로 매핑하며, 최종 실패 시 `WORKFLOW_STATUS_MAPPING_REQUIRED`를 반환합니다.
- 템플릿 교체 후 승인정책은 `validatePolicyAfterTemplateChange()`로 재검증하고 `policyReviewRequired`/`policyReviewReason`에 반영합니다.
- 승인 요청은 `ApprovalRequest`로 분리하며, 열린 요청이 있으면 `APPROVAL_ALREADY_PENDING`(409)으로 중복 생성을 차단합니다.
- `GET /api/tasks/:taskId`는 `workflowRuntime`, `activeApprovalRequest`, `availableActions`, `permissions`를 내려 프론트가 상태 문자열을 추측하지 않도록 합니다.

## 테스트 전략

`apps/api/src/security.test.ts`가 아래를 보호합니다.

- 보안 헤더, CORS, 미등록 사용자 차단
- IDOR와 역할 경계
- watcher는 태스크를 볼 수 있어도 필드 수정이 차단되는지 검증
- parent 변경이 Work Graph cycle을 만들면 차단되는지 검증
- 상세 응답의 children이 visible scope로 필터링되는지 검증
- admin의 inbox read-all이 본인 inbox만 바꾸는지 검증
- 노트 참조와 멘션 검증
- FREEFORM 노드 생성과 parent 연결
- Template 적용과 Form field 보강(기존값 보존 + 누락분 채움)
- Task snapshot 고정, ApprovalRequest/ApprovalDecision 분리, 중복 승인요청 409 차단
- 레거시 FILE/`__task_files` 필드 제거 및 저장 시 재유입 방지
- 노트 생성/수정에서 태그(`tags`) 저장과 조회 반영
- retention analytics 계산
- unit/folder/list 관련 CRUD 스모크 경로

## 확장 포인트

- `server.ts` 라우트 분리
- 인메모리 store를 DB repository로 교체
- `X-Demo-User-Id`를 실제 인증으로 교체
- ApprovalPolicy의 다중 승인 정족수 누적/부분 승인 close 조건 고도화

## 운영 DB 전환 메모

현재 구현은 인메모리 데모 검증을 위해 Task에 embedded snapshot을 보관합니다. 운영 DB, 특히 Spring Boot + MyBatis 전환 시에는 Task row에 큰 JSON을 반복 저장하기보다 immutable version table을 두고 `templateVersionId`, `workflowVersionId`, `formSchemaVersionId`, `approvalPolicyVersionId`를 참조하는 VersionRef 방식을 권장합니다.

승인 요청 중복 방어는 application check만으로 충분하지 않습니다. 운영 DB에서는 `task_id where status = 'PENDING'` unique partial index 또는 task row `SELECT ... FOR UPDATE`를 함께 적용해야 합니다.

승인 결정 처리(`ApprovalDecision` 생성, `ApprovalRequest` close, `Task` status 전이, Timeline 기록, Inbox/outbox 기록)는 하나의 transaction boundary 안에 있어야 합니다. 외부 알림 발송은 transactional outbox에 적재한 뒤 commit 이후 worker가 처리합니다.
