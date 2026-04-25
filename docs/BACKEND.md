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

- `MEMBER`: 기본 생성/수정 권한. 단, Form 편집은 owner/assignee 또는 admin 계열로 제한됩니다.
- `OWNER`: 유닛 오너 맥락에서 멤버십 관리 등 일부 관리 작업을 수행합니다.
- `ADMIN`: 전체 태스크 가시성과 관리 API 접근 권한을 가집니다.
- `SUPER_ADMIN`: ADMIN 이상 권한이며 IT 인프라 담당자 역할로 사용됩니다.

## 가시성 모델

- `ADMIN`과 `SUPER_ADMIN`은 모든 태스크를 볼 수 있습니다.
- 일반 사용자는 `ownerId`, `assigneeIds`, `watcherIds`에 포함된 태스크와 그 parent chain을 볼 수 있습니다.
- 노트 참조와 멘션 검증은 visible task 집합을 기준으로 합니다.

## 주요 도메인

- Workspace: `Unit`, `Folder`, `TaskList`
- Work Graph: `Task.parentId`, `structureState`, `templateId`
- 실행 분류: `workflowPhase`, `phaseOverride`, `workflowStatusId`
- 협업: `Note`, `ThreadComment`, `Mention`
- 기록: `TimelineEvent`, `InboxItem`, `EngagementEvent`
- 정책: `Template`, `ApprovalPolicy`, `NotificationSettings`, `WebPushSubscription`

## 이벤트 처리

- `addTimeline`: 생성, 수정, 구조 변경, 전이, 노트 변경 등을 기록합니다.
- `addInbox`: 결정/논의/인지/결과 알림을 만듭니다.
- `addEngagement`: 노드 생성, Template 적용, Form 저장, 댓글/멘션, 방문 등 분석용 행동을 기록합니다.
- `calculateAnalytics`: 현재 이벤트와 콘텐츠 상태를 기준으로 리텐션/협업 지표를 계산합니다.

## 테스트 전략

`apps/api/src/security.test.ts`가 아래를 보호합니다.

- 보안 헤더, CORS, 미등록 사용자 차단
- IDOR와 역할 경계
- 노트 참조와 멘션 검증
- FREEFORM 노드 생성과 parent 연결
- Template 적용과 Form field 초기화
- retention analytics 계산
- unit/folder/list/bucket 관련 CRUD 스모크 경로

## 확장 포인트

- `server.ts` 라우트 분리
- 인메모리 store를 DB repository로 교체
- `X-Demo-User-Id`를 실제 인증으로 교체
- workflowSchema 기반 전이와 ApprovalPolicy의 단계별 승인 상태 저장 확장
