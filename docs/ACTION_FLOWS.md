# SelvasIn4 HWE 액션 플로우

## Hook 루프

```mermaid
flowchart LR
  A[Investment: FREEFORM 노드 생성] --> B[정형화: Template 적용]
  B --> C[Action: Form/Note 작성]
  C --> D[Discussion: @/# 커맨드 스레드]
  D --> E[Trigger: Inbox]
  E --> F[Return: 상세 재방문]
  F --> G[Revision: 구조/Form/결정 수정]
  G --> A
```

핵심은 사용자가 만든 구조와 맥락이 다음 재방문 이유가 되는 것입니다.

## 형상화 -> 정형화 -> 멘션

```mermaid
flowchart TD
  A[FREEFORM Task 생성] --> B[parentId로 Work Graph 연결]
  B --> C[Template 적용]
  C --> D[Form Output + 검수 기준 활성화]
  D --> E[스레드에서 @노드/@필드/#노트 검색]
  E --> F[mention + referencedNoteIds 저장]
  F --> G[Inbox DISCUSSION 알림]
```

## 스레드 커맨드 플로우

```mermaid
flowchart LR
  A[Composer 입력] --> B{@ 또는 # 감지}
  B --> C[검색 메뉴 표시]
  C --> D[대상 선택]
  D --> E[본문 토큰 삽입]
  E --> F[mentions/referencedNoteIds 저장]
  F --> G[notifyMentions]
```

스레드 후보는 상시 칩으로 노출하지 않습니다. 채팅/문서 도구처럼 입력 중 커맨드 검색으로 호출합니다.

## 결정 전이 플로우

```mermaid
flowchart TD
  A[상세 결정 액션 클릭] --> B[DecisionModal]
  B --> C[reason + referencedNoteIds 입력]
  C --> D[POST /api/tasks/:taskId/transition]
  D --> E[workflowSchema 또는 legacy workflow 검증]
  E --> F[Task state/status/phase 갱신]
  F --> G[Timeline]
  F --> H[Inbox]
  F --> I[Engagement]
```

## 태스크 뷰 플로우

```mermaid
flowchart LR
  HOME[/home] --> A[/tasks]
  HOME --> J[결정 대기]
  HOME --> K[내 활성 태스크]
  HOME --> L[오늘/임박]
  A --> B[리스트]
  A --> C[보드]
  A --> D[백로그]
  A --> E[결정 그래프]
  B --> F[필터/정렬/그룹(폴더·리스트)]
  C --> G[상태별 이동]
  D --> H[스프린트 투입/WIP]
  E --> I[parent/note/decision edges]
```

## Inbox 라우팅

```mermaid
flowchart LR
  A[Domain event] --> B[componentForEvent]
  B --> C[DECISION]
  B --> D[DISCUSSION]
  B --> E[AWARENESS]
  B --> F[RESULT]
  C --> G[수신함 탭]
  D --> G
  E --> G
  F --> G
  A --> H[sourceUserId]
  H --> I[발신함 추적]
```
