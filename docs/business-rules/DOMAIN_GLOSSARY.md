# Domain Glossary

이 문서는 SelvasIn4 HWE 데모 앱에서 사용하는 핵심 도메인 용어를 정의합니다. 기준은 현재 `packages/shared` 타입, `apps/api` 라우트, `apps/web` 화면 구조입니다.

## 사용자와 권한

### Member

시스템 사용자입니다. 전역 역할(`role`)과 소속 표시용 `unit`을 가집니다.

### Role

전역 권한 등급입니다.

```text
MEMBER < OWNER < ADMIN < SUPER_ADMIN
```

- `MEMBER`: 본인이 관련된 작업을 조회하고 협업합니다.
- `OWNER`: 소유한 작업 단위나 Unit owner 맥락에서 일부 운영 작업을 수행합니다.
- `ADMIN`: 전체 태스크 가시성, 관리자 API, 운영 설정에 접근합니다.
- `SUPER_ADMIN`: ADMIN 이상 권한을 가진 최상위 운영자입니다.

### Unit Member

특정 Unit에 대한 멤버십입니다. 전역 Role과 별개로 `OWNER`, `MEMBER` 역할을 가집니다.

### Visibility

사용자가 볼 수 있는 리소스 범위입니다. 관리자는 전체 태스크를 볼 수 있고, 일반 사용자는 owner/assignee/watcher 관계와 parent chain 기준으로 볼 수 있습니다.

### Editability

사용자가 보이는 리소스를 실제로 수정할 수 있는지의 범위입니다. 태스크 필드 수정은 관리자, task owner, task assignee, 해당 unit owner에게 허용됩니다. watcher 또는 parent chain으로만 보이는 사용자는 read-only입니다.

## Workspace 구조

### Unit

업무 단위의 최상위 컨텍스트입니다. 목적(`purpose`), 기본 승인정책, 알림 설정 메타데이터를 가질 수 있습니다.

### Folder

Unit 안에서 List를 묶는 문맥입니다. 태스크의 `folderId`는 해당 Unit에 속해야 합니다.

### List

태스크가 실제로 배치되는 작업 목록입니다. `unitId`, 선택적 `folderId`, 선택적 기본 workflow phase를 가집니다.

UI의 Explorer에서 List는 팀즈의 "채널"과 비슷한 **자리**를 차지하지만, 제품 용어는 List이며 `#` 접두어는 사용하지 않습니다(`#`는 스레드에서 노트 참조 커맨드로 예약).

### Workspace Integrity

`unitId`, `folderId`, `listId` 조합이 실제 존재하고 같은 컨텍스트에 속해야 한다는 무결성 규칙입니다. 실패 시 `FOLDER_LIST_MISMATCH`로 차단합니다.

## Work Graph와 태스크

### Work Graph

태스크를 노드로 보고 `parentId`로 계층을 연결한 작업 구조입니다. 자유 형상화와 템플릿 정형화를 모두 지원합니다.

### Task

Work Graph의 기본 노드입니다. `unitId`, `folderId`, `listId`, `parentId`, owner/assignee/watcher, 상태, Template, Form Output을 가질 수 있습니다.

### Parent Chain

특정 태스크에서 상위 태스크로 이어지는 `parentId` 경로입니다. 일반 사용자의 가시성 계산에도 포함됩니다.

Parent chain은 Work Graph cycle을 만들 수 없습니다. parent 변경 시 자기 자신 또는 descendant를 parent로 지정하는 요청은 차단됩니다.

### Structure State

태스크가 자유 형상화 상태인지 정형화 상태인지 나타냅니다.

- `FREEFORM`: Template 없이 먼저 만든 반정형 결정 대상
- `TEMPLATED`: Template이 적용되어 Form Output, 검수 기준, workflow가 활성화된 대상

### Task State

태스크의 기본 상태입니다.

- `DRAFT`
- `IN_PROGRESS`
- `DONE`
- `CANCELED`

### Workflow Phase

운영 단계입니다.

- `BACKLOG`
- `PLAN`
- `ACTIVE`
- `CLOSED`

### Workflow Status

Template 또는 전역 workflow에서 쓰는 세부 상태입니다. category는 `OPEN`, `IN_PROGRESS`, `PENDING_APPROVAL`, `DONE`, `CANCELED`를 사용합니다.

### Decision Type

결정 전이의 의미입니다.

- `APPROVE`: 승인
- `REJECT`: 반려
- `SUPPLEMENT`: 보완 요청
- `STATE_ONLY`: 결정 의미가 약한 상태 변경

## Template과 Form Output

### Template

태스크를 정형화하는 기준 데이터입니다. `formDefinition`, `inspectionCriteria`, legacy `workflow`, 선택적 `workflowSchema`를 가집니다.

### Template Type

Template과 태스크의 업무 수준을 구분합니다.

- `VISION`
- `AXIS`
- `OBJECTIVE`
- `KEYRESULT`
- `TASK`

### Form Definition

Template이 요구하는 입력 필드 목록입니다. 각 필드는 key, label, type, required, helpText, options를 가질 수 있습니다.

### Form Output

태스크에 저장된 Template 기반 산출물 값입니다. 코드에서는 `formValues`로 표현하며, Template 필드 key 기준으로 저장합니다.

### Inspection Criteria

Template이 요구하는 검수 기준입니다. 태스크 상세에서 Form Output과 함께 확인합니다.

### Workflow Schema

Template의 status 기반 workflow 정의입니다. statuses와 transitions를 가지며, 전이별 decisionType과 approval gate를 표현할 수 있습니다.

## 협업 데이터

### Note

태스크에 붙는 근거 문서입니다. 결정의 배경, 분석 결과, 파일/링크 맥락을 기록합니다.

### Thread Comment

태스크 상세 우측 스레드 탭의 댓글입니다. 본문, 노트 참조, 멘션을 가질 수 있습니다.

### Mention

댓글에서 특정 대상을 본문 토큰으로 참조하는 데이터입니다.

- `MEMBER`: 사용자 멘션
- `TASK`: 태스크 멘션
- `FORM_FIELD`: 특정 태스크의 Form field 멘션
- `NOTE`: 노트 참조

### Referenced Note

댓글 또는 전이 사유에서 `referencedNoteIds`로 연결된 노트입니다. 작성자가 볼 수 있는 태스크의 노트만 허용합니다.

### Attachment

태스크에 붙는 파일 또는 링크입니다. 현재 구현은 파일의 `contentDataUrl`과 링크의 `url`, `provider`를 지원합니다.

## 기록과 알림

### Timeline Event

태스크에서 발생한 생성, 상태 전이, 승인 요청, 노트 변경, 댓글, 멘션, 계층 변경, 완료/취소 이벤트의 감사 로그입니다.

### Inbox Item

사용자에게 다음 행동 신호를 전달하는 알림성 항목입니다. `readAt`, `ackAt`, `remindCount`를 가집니다.

### Inbox Component

Inbox 항목의 운영 분류입니다.

- `DECISION`: 승인/반려/보완 같은 결정 대기
- `DISCUSSION`: 댓글/멘션/노트 수정 같은 논의
- `AWARENESS`: 구조나 상태 변화 인지
- `RESULT`: 완료/취소 결과 확인

### Notification Settings

사용자별 알림 설정입니다. email, push, web push, digest, muted components, mention-only, SLA 시간을 포함합니다.

### Web Push Subscription

브라우저 push endpoint와 암호화 key를 저장한 사용자별 구독 정보입니다.

## 승인 정책

### Approval Policy

결정 전이 시 승인자, 합의자, 최종 승인자를 계산하는 운영 정책입니다. 전역 정책과 Unit별 정책을 지원합니다.

### Approval Mode

승인 방식입니다.

- `SINGLE`: 단일 승인
- `PARALLEL`: 병렬 승인
- `CONSENSUS`: 합의 기반 승인

### Approval Line

승인 정책 안의 단계입니다. 합의(`CONSENSUS`) 또는 승인(`APPROVAL`) 유형, 참여자, 최소 승인 수를 가집니다.

### Final Approver

승인 라인 이후 최종 결정권자로 지정된 멤버입니다.

## 분석

### Engagement Event

사용자의 주요 행동을 분석용으로 기록한 이벤트입니다. 노드 생성/수정, 부모 변경, Template 적용, Form 저장, 댓글/멘션, 노트 수정, 결정 전이, 자발적 방문을 포함합니다.

### Analytics

현재 콘텐츠 상태와 engagement event를 기반으로 계산한 지표 묶음입니다. 리텐션, 문서/스레드 균형, 멘션 수, 정형화 노드 수, 결정 이벤트 수 등을 포함합니다.

### Decision Graph

별도 저장소가 아니라 tasks, notes, comments, timeline, mentions, referencedNoteIds를 프론트에서 그래프 노드/엣지로 투영한 뷰입니다.

## 화면 용어

### Shell / Explorer

`layout/Shell`이 제공하는 좌측 영역입니다. GNB(알림함·태스크·설정 등)와 그 옆의 **워크스페이스 Explorer**로 구성되며, Unit → Folder → List 트리를 보여 줍니다. 팀즈의 팀/채널 화면은 정보 구조를 잡기 위한 **참고 IA**이고, 구현과 용어는 본 문서의 Unit/Folder/List를 따릅니다.

### Task View

`/tasks` 화면의 뷰 모드입니다.

- 리스트
- 보드
- 백로그
- 결정 그래프

### Task Right Panel

태스크 상세 우측 영역입니다. `스레드`와 `타임라인` 탭으로 전환됩니다.

### Command Composer

스레드 입력 중 `@` 또는 `#`를 입력해 멘션이나 노트 참조 대상을 검색하고 본문 토큰으로 삽입하는 UI입니다.
