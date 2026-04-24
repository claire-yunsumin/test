# API 스펙 이해 문서

이 문서는 "빠르게 이해" 목적의 요약 스펙입니다.  
기본 Base URL은 `http://localhost:4000`입니다.

## 공통 규칙

- 인증 헤더: `X-Demo-User-Id: u-admin` (예: `u-viewer`, `u-pm`)
- 본문 타입: `application/json`
- 실패 응답 공통 필드: `error`, `requestId`
- 대표 에러 코드:
  - `400`: `VALIDATION_ERROR`, `INVALID_*`, `FOLDER_LIST_MISMATCH`
  - `401`: `UNAUTHORIZED`
  - `403`: `FORBIDDEN`, `ORIGIN_NOT_ALLOWED`
  - `404`: `*_NOT_FOUND`
  - `500`: `INTERNAL_ERROR`

## API 호출 용어 정리

실무에서 헷갈리기 쉬운 호출 용어를 먼저 맞추면, API 문서를 훨씬 빠르게 읽을 수 있습니다.

- `Endpoint`
  - 서버 기능의 주소입니다. 예: `GET /api/tasks`
- `Method`
  - 요청 동작 종류입니다(`GET`, `POST`, `PATCH`, `DELETE`).
- `Path Parameter`
  - URL 경로에 직접 들어가는 값입니다. 예: `/api/tasks/:taskId`의 `taskId`
- `Query Parameter`
  - URL 뒤 `?key=value` 형태의 필터 값입니다. 예: `/api/inbox?componentType=DECISION`
- `Request Header`
  - 요청 메타데이터입니다. 현재는 `X-Demo-User-Id`가 핵심입니다.
- `Request Body`
  - 생성/수정 시 보내는 JSON 데이터입니다.
- `Response Body`
  - 서버가 반환하는 JSON 데이터입니다.
- `Status Code`
  - 요청 결과를 숫자로 표현한 값입니다(예: `200`, `400`, `403`).
- `Validation`
  - 입력값 형식/필수값 검증입니다. 실패 시 보통 `VALIDATION_ERROR`
- `Authorization`
  - 권한 검증입니다. 역할 미달이면 `FORBIDDEN`
- `Resource Visibility`
  - "이 사용자가 이 리소스를 볼 수 있는가" 검증입니다.
- `Idempotent`
  - 같은 요청을 여러 번 보내도 결과가 같아야 하는 성질입니다.
  - 일반적으로 조회(`GET`)는 멱등, 생성(`POST`)은 비멱등으로 봅니다.
- `Error Code`
  - 에러 원인을 식별하는 문자열입니다. 예: `INVALID_NOTE_REFERENCE`
- `requestId`
  - 서버 요청 추적 ID입니다. 장애/로그 분석 시 같은 요청을 찾을 때 사용합니다.

### HTTP Method 상세 의미

- `GET` (조회)
  - 서버 데이터를 "읽기" 위한 호출입니다.
  - 서버 상태를 바꾸지 않는 것이 원칙입니다.
  - 같은 요청을 여러 번 보내도 결과 성격이 같아야 합니다(멱등).
  - 예: `GET /api/tasks`, `GET /api/me`

- `POST` (생성/행위 실행)
  - 새 리소스를 만들거나, 특정 행위를 실행할 때 사용합니다.
  - 같은 요청을 반복하면 결과가 달라질 수 있습니다(비멱등).
    - 예: 같은 생성 요청을 두 번 보내면 2개가 생성될 수 있음
  - 예: `POST /api/tasks`, `POST /api/tasks/:taskId/transition`

- `PATCH` (부분 수정)
  - 리소스의 일부 필드만 변경할 때 사용합니다.
  - 보낸 필드만 바뀌고, 보내지 않은 필드는 유지되는 패턴이 일반적입니다.
  - 설계에 따라 멱등하게 만들 수 있지만, 이벤트/시간 갱신 로직이 있으면 완전 멱등이 아닐 수 있습니다.
  - 예: `PATCH /api/tasks/:taskId`, `PATCH /api/notes/:noteId`

- `DELETE` (삭제)
  - 리소스를 삭제할 때 사용합니다.
  - 일반적으로 같은 대상을 여러 번 삭제해도 "삭제 상태"는 같아서 멱등으로 취급합니다.
  - 다만 구현에 따라 2번째 호출에서 `404`가 날 수 있으니 API 규약을 확인해야 합니다.
  - 예: `DELETE /api/tasks/:taskId`

### 실무에서 자주 하는 오해 정리

- "수정은 무조건 POST?" -> 아닙니다. 보통 수정은 `PATCH`(또는 `PUT`)를 씁니다.
- "GET에 body 넣어도 되나?" -> 권장하지 않습니다. 필터는 query parameter를 사용하세요.
- "POST는 항상 생성?" -> 아닙니다. 생성 외에 전이/실행 액션에도 사용합니다.
- "멱등이면 안전?" -> 네트워크 재시도 관점에서 더 안전하지만, 권한/검증 실패 가능성은 별개입니다.

### HTTP Method 전체 비교표

| 구분 | GET | POST | PUT | PATCH | DELETE |
|---|---|---|---|---|---|
| 주 용도 | 조회 | 생성, 액션 실행 | 리소스 전체 교체 | 리소스 일부 수정 | 리소스 삭제 |
| 요청 의미 | "읽어오기" | "새로 만들기/실행하기" | "이 상태로 통째로 바꾸기" | "이 필드만 바꾸기" | "이 대상을 삭제하기" |
| 서버 상태 변경 | 없음(원칙) | 있음 | 있음 | 있음 | 있음 |
| 멱등성 | 멱등 | 보통 비멱등 | 보통 멱등 | 구현에 따라 다름 | 일반적으로 멱등 취급 |
| body 사용 | 보통 없음 | 주로 사용 | 주로 사용 | 주로 사용 | 보통 없음(설계에 따라 사용 가능) |
| 누락 필드 처리 | 해당 없음 | 생성 로직 기준 | 누락 시 제거/초기화될 수 있음 | 누락 필드는 유지되는 패턴이 일반적 | 해당 없음 |
| 현재 프로젝트 사용 | 많이 사용(조회 API 전반) | 많이 사용(생성/전이) | 거의 미사용 | 많이 사용(부분 수정) | 사용 중(삭제 API) |
| 실수 포인트 | 조회에 변경 로직 넣는 실수 | 재시도로 중복 생성 | 전체 교체 의도 없이 호출 | 부분 수정인데 전체 검증으로 실패 | 2회 호출 시 404 처리 정책 혼동 |

짧게 기억하면:

- 읽기 -> `GET`
- 생성/행위 실행 -> `POST`
- 전체 교체 -> `PUT`
- 일부 수정 -> `PATCH`
- 삭제 -> `DELETE`

---

## 1) 헬스/부트스트랩

- `GET /health`  
  서버 상태 확인

- `GET /api/bootstrap`  
  현재 사용자 기준으로 필터된 초기 데이터 묶음 반환

- `GET /api/me`  
  현재 사용자 정보

---

## 2) 워크스페이스 컨텍스트(유닛/폴더/리스트)

- `GET /api/units`
- `POST /api/units`
  - body: `{ name, purpose? }`

- `GET /api/folders?unitId=...`
- `POST /api/folders`
  - body: `{ unitId, name }`

- `GET /api/lists?unitId=...`
- `POST /api/lists`
  - body: `{ unitId, folderId?, name }`

---

## 3) 태스크

- `GET /api/hierarchy`
  - query: `search`, `type`, `state`, `assignee`

- `GET /api/tasks`
- `POST /api/tasks`
  - body 예시:
  - `{ title, parentId?, templateId?, templateType?, structureState?, unitId?, folderId?, listId? }`
  - 규칙: `folderId`와 `listId` 조합이 맞지 않으면 `FOLDER_LIST_MISMATCH`

- `GET /api/tasks/:taskId`
- `PATCH /api/tasks/:taskId`
  - body 예시:
  - `{ title?, description?, priority?, currentState?, parentId?, templateId?, assigneeIds?, watcherIds?, dueDate?, formValues?, unitId?, folderId?, listId? }`
  - 규칙: 생성과 동일하게 folder/list 무결성 검증

- `DELETE /api/tasks/:taskId`

- `POST /api/tasks/:taskId/transition`
  - body: `{ toState, decisionType, reason, referencedNoteIds? }`

---

## 4) 노트/댓글(스레드)

- `POST /api/tasks/:taskId/notes`
  - body: `{ title, content }`
- `PATCH /api/notes/:noteId`
- `DELETE /api/notes/:noteId`

- `POST /api/tasks/:taskId/comments`
  - body: `{ content, referencedNoteIds?, mentions? }`
- `PATCH /api/comments/:commentId`
- `DELETE /api/comments/:commentId`

### 멘션 타입

- `MEMBER`
- `TASK`
- `FORM_FIELD` (`fieldKey` 필요)
- `NOTE`

### 참조/멘션 검증 규칙

- 사용자에게 보이는 범위의 태스크/노트만 참조 가능
- 보이지 않는 리소스를 멘션/참조하면 `INVALID_MENTION` 또는 `INVALID_NOTE_REFERENCE`

---

## 5) 알림함(Inbox)

- `GET /api/inbox?componentType=DECISION|DISCUSSION|AWARENESS|RESULT`
- `PATCH /api/inbox/:itemId/read`  
  읽음 토글

---

## 6) 템플릿

- `GET /api/templates`
- `POST /api/templates`
- `PATCH /api/templates/:templateId`
- `DELETE /api/templates/:templateId`
  - 사용 중이면 완전 삭제 대신 비활성화 처리될 수 있음

---

## 7) 관리자

- `GET /api/admin/members`
- `POST /api/admin/invitations`
  - body: `{ email, role }`
- `PATCH /api/admin/members/:memberId`
  - body: `{ role }`
- `DELETE /api/admin/members/:memberId`

---

## 8) 분석

- `GET /api/analytics/retention`  
  리텐션/협업 지표 반환

---

## 빠른 호출 예시

```bash
curl -X GET "http://localhost:4000/api/tasks" \
  -H "X-Demo-User-Id: u-admin" \
  -H "Content-Type: application/json"
```

```bash
curl -X PATCH "http://localhost:4000/api/tasks/task-vision" \
  -H "X-Demo-User-Id: u-admin" \
  -H "Content-Type: application/json" \
  -d '{"title":"수정된 제목"}'
```
