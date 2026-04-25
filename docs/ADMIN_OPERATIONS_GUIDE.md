# 관리자 운영 가이드

## 목적

관리자 운영 가이드는 멤버, 초대, 권한, 위험 작업을 다룰 때 지켜야 할 서버 기준을 정리합니다. 현재 구현은 `ADMIN` 이상 권한의 관리자 API와 Unit owner의 제한적 초대 권한을 함께 지원합니다.

## 역할 기준

전역 역할 순서:

```text
MEMBER < OWNER < ADMIN < SUPER_ADMIN
```

- `MEMBER`: 본인이 관련된 작업과 협업 기능을 사용합니다.
- `OWNER`: Unit owner 맥락에서 일부 멤버십 작업을 수행할 수 있습니다.
- `ADMIN`: 관리자 API, 전체 태스크 가시성, 운영 설정에 접근합니다.
- `SUPER_ADMIN`: ADMIN 이상 권한을 가진 최상위 운영자입니다.

Unit membership 역할은 전역 역할과 별개로 `OWNER`, `MEMBER`를 사용합니다.

## 관리자 API

멤버와 초대:

- `GET /api/admin/members`
- `POST /api/admin/invitations`
- `PATCH /api/admin/members/:memberId`
- `DELETE /api/admin/members/:memberId`

정책과 운영 설정:

- `GET /api/admin/approval-policies`
- `POST /api/admin/approval-policies`
- `PATCH /api/admin/approval-policies/:policyId`
- `PATCH /api/workflow/statuses`
- `GET /api/analytics/retention`

위 API는 기본적으로 `ADMIN` 이상 권한을 요구합니다. 단, Unit 초대는 해당 Unit의 owner도 제한적으로 수행할 수 있습니다.

## 초대 정책

초대 요청 필드:

- `email`
- `role`
- `unitId?`
- `unitMemberRole?`

처리 규칙:

- `unitId`가 있으면 해당 Unit이 존재해야 합니다.
- 전역 초대는 `ADMIN` 이상만 수행할 수 있습니다.
- Unit 초대는 `ADMIN` 이상 또는 해당 Unit의 `OWNER`가 수행할 수 있습니다.
- Unit owner는 `ADMIN`, `SUPER_ADMIN` 역할을 초대할 수 없습니다.
- 이미 같은 email의 member가 있으면 새 member를 만들지 않고 기존 member를 사용합니다.
- Unit 초대 시 아직 Unit member가 아니면 `unitMemberRole` 또는 기본 `MEMBER`로 추가합니다.
- 응답은 demo invite URL을 반환합니다.

## 멤버 역할 변경 정책

API:

- `PATCH /api/admin/members/:memberId`

처리 규칙:

- `ADMIN` 이상만 전역 역할을 변경할 수 있습니다.
- 역할 값은 `MEMBER`, `OWNER`, `ADMIN`, `SUPER_ADMIN`만 허용합니다.
- 관리자가 자기 자신의 역할을 `MEMBER` 또는 `OWNER`로 낮추는 작업은 차단합니다.
- 자기 자신을 `ADMIN` 또는 `SUPER_ADMIN`으로 유지하는 변경은 허용됩니다.

자기 자신 강등 차단 오류:

```text
CANNOT_DEMOTE_SELF
```

## 멤버 삭제 정책

API:

- `DELETE /api/admin/members/:memberId`

처리 규칙:

- `ADMIN` 이상만 전역 멤버를 삭제할 수 있습니다.
- 관리자가 자기 자신을 삭제하는 작업은 차단합니다.
- 삭제된 멤버는 `members`에서 제거합니다.
- 삭제된 멤버는 모든 task의 `assigneeIds`, `watcherIds`에서 제거합니다.
- 삭제된 멤버에게 향한 Inbox 항목은 제거합니다.

자기 자신 삭제 차단 오류:

```text
CANNOT_REMOVE_SELF
```

## Unit 멤버십 운영

API:

- `PATCH /api/units/:unitId/members/:memberId`
- `DELETE /api/units/:unitId/members/:memberId`

처리 규칙:

- `ADMIN`, `SUPER_ADMIN`, 또는 해당 Unit의 `OWNER`가 수행할 수 있습니다.
- Unit member 역할은 `OWNER`, `MEMBER`만 허용합니다.
- Unit owner가 자기 자신의 owner membership을 삭제하는 작업은 차단합니다.

자기 자신 Unit owner 제거 차단 오류:

```text
CANNOT_REMOVE_SELF_OWNER
```

## 위험 작업 체크리스트

관리자 작업 전 확인할 것:

1. 작업자가 전역 관리자 권한인지, Unit owner 권한인지 구분합니다.
2. 자기 자신을 삭제하거나 관리자 권한 밖으로 강등하는 작업인지 확인합니다.
3. Unit owner를 제거할 때 해당 Unit의 운영 공백이 생기지 않는지 확인합니다.
4. 멤버 삭제 시 담당자, 참관자, Inbox 연결이 정리되는 것을 이해하고 실행합니다.
5. `SUPER_ADMIN` 부여는 운영 최상위 권한이 필요한 경우에만 사용합니다.

## 현재 한계

- 초대 수락 플로우는 demo invite URL 반환까지만 표현합니다.
- 멤버 삭제는 task owner 이전을 수행하지 않습니다.
- 멤버 삭제 이력을 별도 audit log로 저장하지 않습니다.
- 역할 변경에 대한 다중 승인이나 break-glass 절차는 아직 없습니다.

## 읽을 코드

- `packages/shared/src/index.ts`: `Member`, `Role`, `UnitMember`, `UnitMemberRole`
- `apps/api/src/http/access.ts`: `requireRole`, 역할 비교
- `apps/api/src/server.ts`: admin members, invitations, unit members API
- `apps/api/src/security.test.ts`: 관리자 자기 자신 삭제/초대 권한 회귀 테스트
- `apps/web/src/pages/settings/SettingsPages.tsx`: 관리자 화면과 설정 화면
