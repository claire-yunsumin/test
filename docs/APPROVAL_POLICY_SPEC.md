# 승인정책 스펙

## 목적

승인 요청이나 결정 전이 시 어떤 승인자/합의자/최종결정권자를 사용할지 정의합니다. 현재 구현은 정책 저장, 유효성 검증, 전이 시 Inbox 수신자 계산까지 포함합니다.

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

## API

- `GET /api/admin/approval-policies`
- `POST /api/admin/approval-policies`
- `PATCH /api/admin/approval-policies/:policyId`

정책 생성/수정은 `ADMIN` 이상 권한이 필요합니다.

## 전이 연동

`POST /api/tasks/:taskId/transition`은 `approvalPolicyId`를 받을 수 있습니다.

동작:

1. 정책이 enabled인지 확인합니다.
2. 요청자 또는 전이 승인자가 해당 policy의 승인자 집합에 포함되는지 확인합니다.
3. task의 `approvalPolicyId`를 갱신합니다.
4. 전이 payload에 policy 정보를 남깁니다.
5. 승인 요청 성격의 전이에서는 policy 기반 수신자에게 Inbox를 생성합니다.

현재 전이 API는 policy의 `unitId`와 task의 `unitId` 일치 여부를 별도로 검증하지 않습니다. Unit 기본 승인정책 설정 시에는 policy scope를 검증합니다.

## 승인자 계산 우선순위

1. `approvalLines` 참여자와 `finalApproverId`
2. `approverType=MEMBER`의 `approverIds`
3. `approverType=ROLE`의 `approverRole`
4. fallback: `OWNER`, `ADMIN`, `SUPER_ADMIN`

## 현재 한계

- `minApprovals`는 수신자 계산과 정책 표현에 반영되지만, 다중 승인 완료 상태를 누적 저장하는 별도 approval run 모델은 아직 없습니다.
- 향후 `ApprovalRun`, `ApprovalDecision` 테이블/스토어가 필요합니다.
