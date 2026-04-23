# Task OS Core Engine – P0 Graduation Declaration

**Scope:** Task State Machine + Approval Engine + Event Logging + Projection

---

## HTTP Status 규칙 (확정)

| 케이스 | HTTP | error code |
|--------|------|------------|
| 인증 안 됨 | 401 | Unauthorized |
| 조직 불일치 | 403 | Forbidden |
| 존재하지 않는 Task | 404 | TASK_NOT_FOUND |
| 상태 충돌 | 409 | INVALID_TRANSITION |
| 승인 대기 중 | 409 | TASK_PENDING_APPROVAL |
| 승인 재호출 | 409 | APPROVAL_ALREADY_PROCESSED |
| 필수값 누락 | 400 | to_state is required |

---

## 멱등성 계약 (Idempotency)

- **Idempotency-Key 동일 + 동일 요청** → 동일 응답
- **Idempotency-Key 동일 + 다른 요청** → 409

---

## P0 완결 항목

### 1. 상태 머신 완결

- 유효 전이만 허용
- INVALID_TRANSITION → 409
- DONE 중복 호출 → 409
- PENDING → DONE 직접 전이 차단

### 2. Approval Engine 완결

- 승인 요청 생성 정상
- 승인 완료 시 Task DONE 확정
- 승인 재호출 → 409
- Duplicate Pending Approval 없음

### 3. 멱등성 보장

- Idempotency-Key 기반 중복 방어
- Event Store 중복 생성 없음

### 4. Read Model 정합성

- `tasks.current_state` = `task_read_models.current_state`
- `task_logs.latest.created_at` = `read_model.last_event_at`
- 상태 불일치 0건

### 5. 에러 계약 통일

- 상태 충돌류 → 409
- 인증/권한 → 401/403
- 존재하지 않음 → 404

---

## 결론

Task OS Core Engine은 **상태 일관성**, **승인 흐름**, **멱등성**, **정합성** 기준을 모두 충족함.

**P0 = Engine Complete.**
