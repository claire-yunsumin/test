# 승인정책 스캐폴드

## 목적

승인 요청 시점에 어떤 정책(합의자/결재자/병렬결재)을 적용할지 사전 정의하고,  
전이 API에서 해당 정책을 옵션으로 연결할 수 있도록 하는 기본 스캐폴드입니다.

## 스키마 초안

`ApprovalPolicy`

- `id`: 정책 ID
- `name`: 정책 이름
- `description?`: 정책 설명
- `enabled`: 사용 여부
- `mode`: `SINGLE | PARALLEL | CONSENSUS`
- `approverType`: `ROLE | MEMBER`
- `approverRole?`: 역할 기반 승인자일 때 사용
- `approverIds?`: 멤버 기반 승인자 목록
- `minApprovals`: 최소 승인 수(병렬/합의 시 활용)
- `approvalLines?`: 결재라인 배열
  - `type`: `CONSENSUS | APPROVAL` (UI 셀렉트박스: 합의/승인)
  - `participantIds`: 라인 참여자(복수 선택)
  - `minApprovals`: 라인 최소 승인 수
- `finalApproverId?`: 최종결정권자(합의 라인과 동일 사용자 중복 지정 가능)
- `createdAt`, `updatedAt`

## API 초안

- `GET /api/admin/approval-policies`
- `POST /api/admin/approval-policies`
- `PATCH /api/admin/approval-policies/:policyId`

관리자 전용 API이며, 정책 생성/수정 시 승인자 유효성 검증을 수행합니다.
결재라인 참여자와 최종결정권자 모두 멤버 유효성 검증을 수행합니다.

## 전이 API 연결

`POST /api/tasks/:taskId/transition` body 옵션:

- `approvalPolicyId?`

동작:

1. `approvalPolicyId`가 주어지면 정책 유효성 확인
2. 태스크의 `approvalPolicyId`에 반영
3. 전이 이벤트 payload에 `approvalPolicyId`, `approvalMode` 기록
4. `PENDING_APPROVAL` 전이 시 정책 기반 승인자 집합으로 Inbox 라우팅

## 기본 해석 규칙

- 정책 미지정 시 기존 fallback(역할 기반 APPROVER/ADMIN)
- 정책 지정 시 해당 정책의 승인자 규칙 우선
- 향후 `minApprovals` 기반 다단계 승인 확장 예정
