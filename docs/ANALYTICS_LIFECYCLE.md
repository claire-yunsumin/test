# Analytics 데이터 생애주기

## 한 문장 요약

Analytics는 사용자의 주요 행동을 `engagement` event로 기록하고, 현재 콘텐츠 상태와 함께 계산해 리텐션, 협업, 정형화, 피드백 지표로 보여줍니다.

## 1. 이벤트 생성

`EngagementEvent` 핵심 필드:

- `type`
- `actorId`
- `taskId`
- `targetId`
- `metadata`
- `createdAt`

현재 이벤트 타입:

- `NODE_CREATED`
- `NODE_UPDATED`
- `PARENT_CHANGED`
- `TEMPLATE_APPLIED`
- `FORM_SAVED`
- `COMMENT_CREATED`
- `MENTION_CREATED`
- `NOTE_UPDATED`
- `DECISION_TRANSITION`
- `VOLUNTARY_VISIT`

## 2. 발생 지점

대표 발생 지점:

- 태스크 생성: `NODE_CREATED`
- 태스크 수정: `NODE_UPDATED`
- parent 변경: `PARENT_CHANGED`
- Template 적용: `TEMPLATE_APPLIED`
- Form Output 저장: `FORM_SAVED`
- 댓글 작성: `COMMENT_CREATED`
- 멘션 포함 댓글 작성: `MENTION_CREATED`
- 노트 변경: `NOTE_UPDATED`
- 결정 전이: `DECISION_TRANSITION`
- 사용자의 자발적 재방문: `VOLUNTARY_VISIT`

이벤트 생성 규칙이 바뀌면 Timeline, Inbox, Analytics 문서를 함께 확인해야 합니다.

## 3. 지표 계산

API:

- `GET /api/analytics/retention`

계산 입력:

- `tasks`
- `notes`
- `comments`
- `timeline`
- `engagement`
- `templates`

반환 지표:

- `weeklyReturnRate`
- `notesThreadBalance`
- `nonDevContributionRate`
- `noteReferenceRate`
- `voluntaryVisitsPerWeek`
- `decisionEvents`
- `shapedNodeCount`
- `relationCount`
- `templatedNodeCount`
- `activeFormFieldCount`
- `mentionCount`
- `mentionThreadCount`
- `crossFunctionalThreadRate`
- `feedbackNodeRevisionRate`
- `voluntaryVisitCount`

## 4. 콘텐츠 상태와 이벤트의 역할

Analytics는 고정 더미값이 아니라 현재 콘텐츠 상태와 event log를 함께 봅니다.

- `tasks`: 전체 노드 수, parent 관계 수, templated 노드 수
- `templates`: 활성 Form field 수 계산 기준
- `notes/comments`: 문서화와 논의 균형, 노트 참조율, 멘션 수
- `timeline`: 결정 이벤트 수
- `engagement`: 재방문, 수정, Template 적용, Form 저장, 피드백 후 수정률

## 5. 화면 표현

- `/api/bootstrap`: 초기 데이터에 analytics를 포함합니다.
- `/api/analytics/retention`: 최신 지표를 반환합니다.
- 분석 화면은 Objective/KR 기반 운영 지표를 표시합니다.
- 지표는 제품 실험과 협업 루프가 실제로 작동하는지 확인하는 운영 신호로 사용합니다.

## 흐름도

```mermaid
flowchart LR
  A[사용자 행동] --> B[도메인 데이터 변경]
  B --> C[addEngagement]
  C --> D[data.engagement]
  B --> E[현재 콘텐츠 상태]
  D --> F[calculateAnalytics]
  E --> F
  F --> G[/api/bootstrap]
  F --> H[/api/analytics/retention]
  G --> I[분석 화면]
  H --> I
```

## 읽을 코드

- `packages/shared/src/index.ts`: `EngagementEvent`, `Analytics`, seed analytics 계산
- `apps/api/src/domain/store.ts`: `addEngagement`, `calculateAnalytics`
- `apps/api/src/server.ts`: engagement 생성 지점, analytics API
- `apps/web/src/pages/AnalyticsPage.tsx`: 분석 화면
