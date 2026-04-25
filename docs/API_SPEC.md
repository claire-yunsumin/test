# API 스펙

Base URL은 `http://localhost:4000`입니다. 모든 API는 `/health`를 제외하고 `X-Demo-User-Id` 헤더를 사용합니다.

## 공통 규칙

- 인증 헤더: `X-Demo-User-Id: u-pm`
- 본문 타입: `application/json`
- 실패 응답: `{ error, requestId }`
- Zod 검증 실패: `VALIDATION_ERROR`와 `issues`
- 대표 에러: `UNAUTHORIZED`, `FORBIDDEN`, `*_NOT_FOUND`, `INVALID_*`, `FOLDER_LIST_MISMATCH`

## Health / Bootstrap

- `GET /health`
- `GET /api/bootstrap`
- `GET /api/me`

`/api/bootstrap`은 현재 사용자에게 보이는 tasks, attachments, notes, comments, timeline, inbox, settings, templates, approval policies, analytics를 한 번에 반환합니다.

## Workspace

- `GET /api/units`
- `POST /api/units`
- `PATCH /api/units/:unitId`
- `DELETE /api/units/:unitId`
- `PATCH /api/units/:unitId/members/:memberId`
- `DELETE /api/units/:unitId/members/:memberId`

Unit 삭제는 하위 folder/list/task/unitMember가 없어야 가능합니다.

## Folder / List

- `GET /api/folders?unitId=...`
- `POST /api/folders`
- `GET /api/lists?unitId=...`
- `POST /api/lists`
- `PATCH /api/lists/:listId`

List는 `unitId`, `folderId`, `defaultPhase`를 가질 수 있습니다.

## Task

- `GET /api/hierarchy?search=&type=&state=&assignee=`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:taskId`
- `PATCH /api/tasks/:taskId`
- `DELETE /api/tasks/:taskId`
- `POST /api/tasks/:taskId/transition`

생성 body 주요 필드:

```json
{
  "title": "새 태스크",
  "parentId": null,
  "templateId": null,
  "templateType": "TASK",
  "structureState": "FREEFORM",
  "currentState": "DRAFT",
  "workflowPhase": "BACKLOG",
  "workflowStatusId": "open",
  "approvalPolicyId": null,
  "unitId": "unit-growth",
  "folderId": "folder-growth-planning",
  "listId": "list-growth-objective"
}
```

수정 body 주요 필드:

```json
{
  "title": "수정 제목",
  "description": "설명",
  "priority": "HIGH",
  "currentState": "IN_PROGRESS",
  "workflowStatusId": "in_progress",
  "workflowPhase": "ACTIVE",
  "phaseOverride": null,
  "parentId": "task-parent",
  "templateId": "tpl-task",
  "assigneeIds": ["u-pm"],
  "watcherIds": ["u-lead"],
  "dueDate": "2026-05-10",
  "formValues": { "deliverable": "결과물" }
}
```

전이 body:

```json
{
  "toState": "DONE",
  "toStatusId": "done",
  "decisionType": "APPROVE",
  "reason": "승인 근거",
  "referencedNoteIds": ["note-1"],
  "approvalPolicyId": "ap-growth-consensus"
}
```

## Attachment

- `GET /api/tasks/:taskId/attachments`
- `POST /api/tasks/:taskId/attachments/file`
- `POST /api/tasks/:taskId/attachments/link`
- `DELETE /api/tasks/:taskId/attachments/:attachmentId`

File attachment은 데모용 `contentDataUrl`을 받을 수 있습니다. Link attachment은 `url`, `provider`를 받을 수 있습니다.

## Note / Comment

- `POST /api/tasks/:taskId/notes`
- `PATCH /api/notes/:noteId`
- `DELETE /api/notes/:noteId`
- `POST /api/tasks/:taskId/comments`
- `PATCH /api/comments/:commentId`
- `DELETE /api/comments/:commentId`

Comment body:

```json
{
  "content": "@김매니저 #분석 요약 확인",
  "referencedNoteIds": ["note-analysis"],
  "mentions": [
    { "type": "MEMBER", "targetId": "u-marketing", "label": "김매니저" },
    { "type": "NOTE", "targetId": "note-analysis", "label": "분석 요약" }
  ]
}
```

멘션 타입:

- `MEMBER`
- `TASK`
- `FORM_FIELD` (`fieldKey` 필요)
- `NOTE`

## Inbox / Notifications

- `GET /api/inbox?componentType=DECISION|DISCUSSION|AWARENESS|RESULT`
- `PATCH /api/inbox/:itemId/read`
- `PATCH /api/inbox/:itemId/ack`
- `POST /api/inbox/:itemId/remind`
- `PATCH /api/inbox/read-all`
- `GET /api/settings/notifications`
- `PATCH /api/settings/notifications`
- `GET /api/push/subscriptions`
- `POST /api/push/subscriptions`
- `DELETE /api/push/subscriptions`

Inbox는 `readAt`, `ackAt`, `remindCount`를 관리합니다.

## Template / Workflow

- `GET /api/templates`
- `GET /api/workflow/statuses`
- `PATCH /api/workflow/statuses`
- `POST /api/templates`
- `PATCH /api/templates/:templateId`
- `PATCH /api/templates/:templateId/workflow`
- `DELETE /api/templates/:templateId`

Template은 `formDefinition`, `inspectionCriteria`, `workflow`, `workflowSchema`를 가집니다.

## Admin

- `GET /api/admin/approval-policies`
- `POST /api/admin/approval-policies`
- `PATCH /api/admin/approval-policies/:policyId`
- `GET /api/admin/members`
- `POST /api/admin/invitations`
- `PATCH /api/admin/members/:memberId`
- `DELETE /api/admin/members/:memberId`

역할 값은 `MEMBER`, `OWNER`, `ADMIN`, `SUPER_ADMIN`입니다.

## Analytics

- `GET /api/analytics/retention`

반환 지표는 weekly return, notes/thread balance, non-dev contribution, note reference, voluntary visits, decision events, shaped/templated nodes, form fields, mentions, cross-functional thread rate, feedback revision rate를 포함합니다.
