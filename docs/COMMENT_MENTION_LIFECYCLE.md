# 댓글/멘션 데이터 생애주기

## 한 문장 요약

댓글과 멘션은 태스크 상세의 논의 신호이며, `@`/`#` 커맨드로 선택한 사람, 태스크, Form 필드, 노트 참조를 서버 가시성 규칙으로 검증한 뒤 Inbox, Timeline, Analytics에 반영합니다.

## 1. 작성

진입점:

- 태스크 상세 우측 `스레드` 탭
- `POST /api/tasks/:taskId/comments`

Comment body:

```json
{
  "content": "@김매니저 #분석 요약 확인",
  "referencedNoteIds": ["note-analysis"],
  "mentions": [
    { "type": "MEMBER", "targetId": "u-marketing", "label": "김매니저" },
    { "type": "NOTE", "targetId": "note-analysis", "label": "분석 요약" }
  ]
}
```

작성 UX는 후보 칩을 상시 노출하지 않고, 입력 중 `@` 또는 `#` 커맨드 검색으로 대상을 선택합니다.

## 2. 검증

서버 검증:

- 댓글 대상 task가 작성자에게 보여야 합니다.
- `referencedNoteIds`는 visible task 범위 안의 note만 허용합니다.
- `MEMBER` 멘션은 존재하는 member만 허용합니다.
- `TASK` 멘션은 visible task만 허용합니다.
- `FORM_FIELD` 멘션은 visible task이면서 해당 `fieldKey`가 대상 task의 `formValues`에 있어야 합니다.
- `NOTE` 멘션은 visible task 범위 안의 note만 허용합니다.

검증 실패 시 저장하지 않고 `FORBIDDEN`, `INVALID_*`, `*_NOT_FOUND` 계열 오류를 반환합니다.

## 3. 수정과 삭제

API:

- `PATCH /api/comments/:commentId`
- `DELETE /api/comments/:commentId`

수정 시에도 새 `referencedNoteIds`와 `mentions`를 다시 검증합니다. 삭제는 스레드 표시에서 제거되지만, 이미 생성된 Timeline/Inbox/Engagement의 감사 성격 기록은 별도 정책 없이 소급 삭제하지 않는 방향을 기준으로 둡니다.

## 4. 파생 이벤트

댓글 저장 결과:

- `COMMENT` timeline event 생성
- 멘션이 있으면 `MENTION` 성격의 이벤트 생성
- 관련 수신자에게 `DISCUSSION` Inbox 생성
- `COMMENT_CREATED` engagement event 생성
- 멘션이 있으면 `MENTION_CREATED` engagement event 생성

수신자 계산은 멘션 대상과 task owner/assignee/watcher 맥락을 함께 고려하며, 보통 이벤트 발생자 본인은 제외합니다.

## 5. 조회와 표현

- `/api/tasks/:taskId`: 댓글, referenceable tasks, referenceable notes, permissions를 반환합니다.
- `/api/bootstrap`: visible task 범위의 comments를 반환합니다.
- 태스크 상세 우측 `스레드` 탭: 댓글 본문, 멘션, 노트 참조를 표시합니다.
- Inbox `DISCUSSION` 탭: 댓글/멘션 기반 다음 행동 신호를 표시합니다.
- Decision Graph: 댓글과 노트 참조를 그래프 관계 신호로 사용합니다.

## 흐름도

```mermaid
flowchart LR
  A[Composer 입력] --> B[@/# 커맨드 검색]
  B --> C[대상 선택]
  C --> D[mentions/referencedNoteIds 포함 요청]
  D --> E[가시성/필드 검증]
  E --> F[Comment 저장]
  F --> G[Timeline]
  F --> H[Inbox DISCUSSION]
  F --> I[Engagement]
  F --> J[Decision Graph 참조 신호]
```

## 읽을 코드

- `packages/shared/src/index.ts`: `ThreadComment`, `Mention`, `MentionType`
- `apps/api/src/http/access.ts`: `validateNoteRefs`, `validateMentions`, `visibleTaskIdsFor`
- `apps/api/src/server.ts`: comment CRUD와 파생 이벤트 생성
- `apps/web/src/App.tsx`: `TaskRightPanel`, 스레드 composer, 커맨드 검색 UI
