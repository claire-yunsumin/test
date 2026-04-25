# 승인정책 스펙

## 목적

승인 요청이나 결정 전이 시 어떤 승인자/합의자/최종결정권자를 사용할지 정의합니다. 현재 구현은 정책 저장, 유효성 검증, ApprovalRequest/ApprovalDecision 기록, Inbox 수신자 계산까지 포함합니다.

## ApprovalPolicy

- `id`
- `name`
- `unitId?`: null이면 전역 정책, 값이 있으면 특정 unit 정책
- `description?`
- `enabled`
- `mode`: `SINGLE | PARALLEL | CONSENSUS`
- `approverType`: `ROLE | MEMBER`
- `approverRole?`: 역할 기반 승인자
- `approverIds?`: 멤버 기반 승인자
- `minApprovals`
- `approvalLines?`
- `finalApproverId?`
- `createdAt`
- `updatedAt`

## ApprovalLine

- `id`
- `type`: `CONSENSUS | APPROVAL`
- `participantIds`
- `minApprovals`

## ApprovalRequest / ApprovalDecision

`PENDING_APPROVAL`은 workflow status 문자열 포함 여부로 추측하지 않고, 열린 `ApprovalRequest(status=PENDING)` 존재 여부로 판단합니다.

`ApprovalRequest`:

- `id`
- `taskId`
- `fromStatusId`
- `targetStatusId`
- `policySnapshot`
- `status`: `PENDING | APPROVED | REJECTED | SUPPLEMENT_REQUESTED`
- `requestedBy`
- `requestedAt`
- `reason`
- `referencedNoteIds`

`ApprovalDecision`:

- `id`
- `approvalRequestId`
- `approverId`
- `decision`: `APPROVE | REJECT | SUPPLEMENT_REQUEST`
- `reason`
- `referencedNoteIds`
- `decidedAt`

하나의 task에 열린 ApprovalRequest가 있으면 새 승인 요청은 `409 APPROVAL_ALREADY_PENDING`으로 거절합니다.

## API

- `GET /api/admin/approval-policies`
- `POST /api/admin/approval-policies`
- `PATCH /api/admin/approval-policies/:policyId`
- `POST /api/tasks/:taskId/approval-requests`
- `POST /api/approval-requests/:approvalRequestId/decisions`

정책 생성/수정은 `ADMIN` 이상 권한이 필요합니다.

## 전이 연동

신규 승인 플로우는 `POST /api/tasks/:taskId/approval-requests`와 `POST /api/approval-requests/:approvalRequestId/decisions`로 분리됩니다. Legacy `/api/tasks/:taskId/transition`은 기존 클라이언트 호환을 위해 유지됩니다.

동작:

1. 정책이 enabled인지 확인합니다.
2. 요청자 또는 전이 승인자가 해당 policy의 승인자 집합에 포함되는지 확인합니다.
3. task의 `approvalPolicyId`와 `approvalPolicySnapshot`을 갱신합니다.
4. `ApprovalRequest.policySnapshot`에 요청 시점 정책을 고정합니다.
5. Timeline payload에 request/decision id와 snapshot 참조를 남깁니다.
6. 승인 요청 성격의 전이에서는 policy 기반 수신자에게 Inbox를 생성합니다.

현재 전이 API는 policy의 `unitId`와 task의 `unitId` 일치 여부를 별도로 검증하지 않습니다. Unit 기본 승인정책 설정 시에는 policy scope를 검증합니다.

## 승인자 계산 우선순위

1. `approvalLines` 참여자와 `finalApproverId`
2. `approverType=MEMBER`의 `approverIds`
3. `approverType=ROLE`의 `approverRole`
4. fallback: `OWNER`, `ADMIN`, `SUPER_ADMIN`

## 현재 한계

- `ApprovalDecision`은 저장되지만, `minApprovals`를 만족할 때까지 부분 승인 수를 누적한 뒤 자동 close하는 multi-step approval run은 아직 단순화되어 있습니다.
- 현재 `APPROVE` 결정은 요청을 즉시 승인 완료 처리합니다. 다중 승인 누적/정족수 완료는 차기 approval engine 고도화 대상입니다.

## Inbox 승인 처리 플로우

승인 요청을 받은 사용자는 Inbox 수신함에서 바로 결정을 처리할 수 있습니다.

### 수신함(승인자) 동작

1. `APPROVAL_REQUESTED` 항목에서 `결정 입력` 버튼을 선택합니다.
2. 모달 액션 라벨은 정책 모드에 따라 표기됩니다.
   - `mode=CONSENSUS`인 경우 `APPROVE` 액션 라벨은 `승인`이 아니라 `합의`로 표시합니다.
   - 그 외 모드(`SINGLE`, `PARALLEL`)는 기존처럼 `승인` 라벨을 사용합니다.
3. 사용자는 `합의/승인/보완 요청/반려` 중 가능한 액션을 고르고 리뷰 코멘트를 입력합니다.
4. 전송 시 열린 요청은 `POST /api/approval-requests/:approvalRequestId/decisions`로 처리되며, 코멘트(`reason`)가 결정 근거로 저장됩니다.
5. 처리된 항목은 읽음/처리완료 상태로 반영됩니다.

### 라벨/의미 매핑 원칙

- UI 라벨은 정책 맥락을 따르되, API 전송 값(`decisionType`)은 변경하지 않습니다.
- 즉 `합의` 버튼을 눌러도 서버에는 `decisionType=APPROVE`로 전송됩니다.
- 이 원칙으로 정책 친화적 문구와 기존 이벤트/통계 호환성을 함께 유지합니다.

### 수신함(요청자) 반영

- 승인자의 결정 결과는 요청자의 Inbox 수신함에 새 항목으로 전달됩니다.
- 알림 메시지에는 전이 결과와 리뷰 코멘트가 함께 포함됩니다.

### 발신함(승인자) 추적

- 승인자는 자신이 보낸 결정 이벤트를 발신함에서 확인할 수 있습니다.
- 발신함에서 수신자의 열람 여부(`수신자 열람`)와 처리 상태(`수신자 처리완료`)를 추적할 수 있습니다.

### 서버 기록 원칙

- 결정 결과는 타임라인 이벤트(`APPROVAL_REQUESTED` / `APPROVAL_APPROVED` / `APPROVAL_REJECTED` / `APPROVAL_SUPPLEMENT_REQUESTED`)로 남깁니다.
- Inbox 이벤트는 `sourceUserId`(결정 수행자)와 `userId`(수신자)를 함께 기록해 수신/발신함 양방향 조회를 가능하게 합니다.

## 템플릿 조건 기반 승인정책 적용 순서

템플릿 전이 조건에 승인 게이트가 포함된 경우, 아래 순서로 정책이 해석되어 실제 결재 플로우에 반영됩니다.

1. **전이 조건 해석**
   - 대상 전이의 `onExit.approvalGate.enabled=true` 여부를 확인합니다.
   - `approvalGate.policyId`가 지정되었으면 해당 정책을 우선 참조합니다.

2. **정책 선택/검증**
   - `approvalGate.policyId`가 없으면 태스크의 `approvalPolicyId`를 사용합니다.
   - 선택된 정책은 `enabled` 및 접근 가능 승인자 조건을 검증합니다.
   - 템플릿 교체 시에는 워크플로우/정책 정합성 재검증을 수행합니다.

3. **결재 유형/결재 라인 계산**
   - 정책의 `mode`(`SINGLE | PARALLEL | CONSENSUS`)를 기준으로 결재 성격을 결정합니다.
   - 정책의 `approvalLines`, `finalApproverId`, `approverType`/`approverIds`/`approverRole` 우선순위로 참여자/수신자를 계산합니다.
   - `CONSENSUS` 정책인 경우 UI의 `APPROVE` 라벨은 `합의`로 표기됩니다.

4. **실행/기록 반영**
   - 승인 요청은 `POST /api/tasks/:taskId/approval-requests`, 사용자 판단(합의/승인/보완요청/반려)은 `POST /api/approval-requests/:approvalRequestId/decisions`로 처리됩니다.
   - UI 라벨이 `합의`여도 API 전송값은 호환성을 위해 `decisionType=APPROVE`를 유지합니다.
   - 결과는 타임라인 이벤트와 Inbox 수신/발신함에 함께 기록되어 추적됩니다.
