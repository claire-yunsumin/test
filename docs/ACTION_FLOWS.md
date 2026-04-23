# SelvasIn4 HWE Action Flows

This document captures the PRD action-flow model as implementation-facing diagrams. The key product principle is that user actions must accumulate into a Decision Graph, not just produce isolated task outputs.

## 1. HWE Hook Loop

```mermaid
flowchart LR
  A[Investment: 결정 대상 구조화] --> B[Knowledge Shape: Task / Notes / Template]
  B --> C[Feedback: Thread / # Notes / Review]
  C --> D[Trigger: Inbox 알림]
  D --> E[Action: 재방문 / 수정 / 결정]
  E --> A
```

- Investment means structure, context, and methodology contributed by users.
- The loop is healthy only when alerts feel like meaningful participation signals.
- The accumulated asset is the Decision Graph.

## 2. Decision Action Flow

```mermaid
flowchart TD
  A[EDITOR: Request Review] --> B{isDecision?}
  B -- yes --> C[APPROVER receives DECISION inbox]
  B -- no --> D[State-only timeline event]
  C --> E[Decision modal: reason + referencedNotes]
  E --> F{Decision result}
  F -- APPROVE --> G[DONE]
  F -- REJECT --> H[CANCELED]
  F -- SUPPLEMENT --> I[IN_PROGRESS]
  G --> J[Timeline: decision_type / reason / referencedNotes]
  H --> J
  I --> J
  J --> K[Inbox routing to stakeholders]
```

Implementation constraints:

- Server validates role and resource visibility.
- `reason` is required for transitions.
- `referencedNoteIds` can point to notes on any task visible to the acting user.

## 3. Notes, Thread, And # Reference Flow

```mermaid
flowchart LR
  A[Notes: structured context] --> B[# reference]
  C[Thread: conversational signal] --> B
  B --> D[Reference relation stored]
  D --> E[Note is edited]
  E --> F[Find referencing authors]
  F --> G[NOTE_UPDATED inbox]
  G --> H[User returns to context]
```

This closes the Variable Reward loop: a user invests by referencing or editing context, and another user receives a meaningful update tied to a prior action.

## 4. Inbox Routing Flow

```mermaid
flowchart TD
  A[Domain event] --> B[componentForEvent]
  B --> C{componentType}
  C -- DECISION --> D[Approval / rejection work]
  C -- DISCUSSION --> E[Thread / Notes updates]
  C -- AWARENESS --> F[Hierarchy and state visibility]
  C -- RESULT --> G[Completion / cancellation result]
```

Implementation constraints:

- Backend owns event-to-component routing.
- Frontend tabs are views over server-classified inbox items.
- Shared enums prevent drift between API and UI.

## 5. Two-Week Integrated Flow

```mermaid
sequenceDiagram
  participant PM as 박PM
  participant M as 김매니저
  participant S as System
  participant L as 이팀장

  PM->>S: Objective/KR/Task 생성
  PM->>M: Thread에서 #Notes 호출
  S->>M: DISCUSSION trigger
  M->>S: Notes 수정
  S->>PM: NOTE_UPDATED trigger
  PM->>S: 수정 맥락 확인
  M->>S: Request Review
  S->>L: DECISION trigger
  L->>S: Approve / Supplement / Reject + reason
  S->>PM: RESULT / DISCUSSION trigger
  PM->>S: 다음 Task 생성
```

The pilot should watch where the transition from trigger to voluntary action fails.

## 6. Decision Graph Layers

```mermaid
flowchart TD
  A[Layer 1: Task hierarchy<br/>parentId + templateType] --> B[Layer 2: Context<br/>Notes + Thread]
  B --> C[Layer 3: Decisions<br/>Timeline decision_type + reason]
  C --> D[Layer 4: Cross references<br/># referencedNoteIds]
  D -. lock-in .-> A
```

Decision Graph is composed of:

- Nodes: Objective, KR, Task, and other template-typed units.
- Context: Notes and Thread attached to each node.
- Decisions: Timeline events with decision type, reason, and note references.
- Relations: `parentId`, `referencedNoteIds`, watchers, assignees, and approvers.

The UI route `/graph` visualizes the first four layers from current API data.
