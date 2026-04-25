# 알림 정책 스펙

## 목적

알림 정책은 Inbox 이벤트를 사용자가 실제로 처리 가능한 신호로 유지하기 위한 운영 규칙입니다. 현재 구현은 사용자별 알림 설정, Inbox 읽음/확인/리마인드, Web Push subscription 등록/해제를 포함합니다.

## 적용 범위

- Inbox 컴포넌트: `DECISION`, `DISCUSSION`, `AWARENESS`, `RESULT`
- 사용자별 알림 채널 설정
- Inbox 읽음, 확인, 리마인드 처리
- Web Push subscription 등록과 해제
- Unit 단위 알림 설정 메타데이터

## NotificationSettings

사용자별 설정 필드:

- `userId`
- `emailEnabled`
- `pushEnabled`
- `webPushEnabled`
- `digestEnabled`
- `mutedComponents`
- `mentionOnlyForWatchers`
- `slaHours`

기본 설정이 없으면 서버는 요청 사용자 기준 fallback 설정을 반환합니다.

```text
emailEnabled=false
pushEnabled=true
webPushEnabled=false
digestEnabled=false
mutedComponents=[]
mentionOnlyForWatchers=false
slaHours=24
```

`slaHours`는 1시간 이상 168시간 이하로 제한합니다.

## API

알림 설정:

- `GET /api/settings/notifications`
- `PATCH /api/settings/notifications`

Push subscription:

- `GET /api/push/subscriptions`
- `POST /api/push/subscriptions`
- `DELETE /api/push/subscriptions`

Inbox 처리:

- `GET /api/inbox?componentType=DECISION|DISCUSSION|AWARENESS|RESULT`
- `PATCH /api/inbox/:itemId/read`
- `PATCH /api/inbox/:itemId/ack`
- `POST /api/inbox/:itemId/remind`
- `PATCH /api/inbox/read-all`

## Push Subscription 정책

등록 요청은 `endpoint`, `keys.p256dh`, `keys.auth`, 선택적 `userAgent`를 받습니다.

- 같은 사용자의 같은 `endpoint`가 이미 있으면 key와 userAgent를 갱신합니다.
- 새 endpoint면 subscription을 추가합니다.
- 삭제 요청에 `endpoint`가 있으면 해당 endpoint만 제거합니다.
- 삭제 요청에 `endpoint`가 없으면 현재 사용자의 모든 subscription을 제거합니다.
- 다른 사용자의 subscription은 조회하거나 제거하지 않습니다.

## Inbox 처리 정책

- `read`: 수신자가 항목을 읽은 시간인 `readAt`을 기록합니다.
- `ack`: 수신자가 처리 확인한 시간인 `ackAt`을 기록합니다.
- `remind`: 원 이벤트 발생자 또는 관리자만 수행할 수 있습니다.
- 수신자 본인은 자기 자신에게 일반 리마인드를 보낼 수 없습니다.
- `read-all`: 현재 사용자 기준으로 전체 또는 특정 컴포넌트를 읽음 처리합니다.
- `ADMIN`, `SUPER_ADMIN`은 개별 Inbox 조회/read/ack/remind에서 더 넓은 운영 접근 권한을 가질 수 있습니다.
- `read-all`은 예외적으로 `ADMIN`, `SUPER_ADMIN`이어도 현재 사용자 본인의 Inbox 항목만 변경합니다.

## 컴포넌트별 운영 의미

- `DECISION`: 승인 요청, 반려, 보완 같은 의사결정 대기 신호
- `DISCUSSION`: 댓글, 멘션, 노트 수정처럼 논의가 필요한 신호
- `AWARENESS`: 구조 변경, 상태 변화처럼 인지가 필요한 신호
- `RESULT`: 완료, 취소처럼 결과 확인이 필요한 신호

`mutedComponents`는 사용자가 알림 채널에서 줄이고 싶은 컴포넌트 유형을 저장합니다. 데이터 자체를 숨기는 권한 규칙은 아니며, Inbox 가시성은 인증/권한/가시성 정책을 따릅니다.

## 운영 원칙

1. Inbox는 업무 이벤트의 원장이고, 알림 채널은 전달 방식입니다.
2. 알림 mute는 서버 데이터 삭제나 가시성 변경으로 해석하지 않습니다.
3. 결정성 이벤트는 가능하면 `DECISION`으로 분류해 처리 우선순위를 높입니다.
4. 멘션 기반 알림은 사용자의 가시성 범위 안에서만 생성되어야 합니다.
5. Push subscription은 사용자 단위로 격리하고 endpoint 중복 등록을 갱신으로 처리합니다.

## 현재 한계

- 실제 외부 push 발송 worker는 없습니다.
- 이메일 발송과 digest 발송은 설정 저장까지만 표현합니다.
- `mentionOnlyForWatchers`는 정책 필드로 존재하지만, 모든 알림 라우팅에 세밀하게 적용되는 별도 worker는 아직 없습니다.

## 읽을 코드

- `packages/shared/src/index.ts`: `NotificationSettings`, `WebPushSubscription`, `InboxItem`
- `apps/api/src/server.ts`: notification settings, push subscription, inbox 처리 API
- `apps/api/src/domain/store.ts`: `addInbox`
- `apps/web/src/pages/InboxPage.tsx`: Inbox 화면
- `apps/web/src/pages/settings/SettingsPages.tsx`: 알림 설정 화면
