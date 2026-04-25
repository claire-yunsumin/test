# System Spec

이 문서는 `BUSINESS_RULES.md`가 실제 시스템 요구사항으로 내려오는 방식을 정리합니다. 최신 구현 기준은 `apps/api`, `apps/web`, `packages/shared`의 타입과 라우트입니다.

## Release 문서

- `DOMAIN_GLOSSARY.md`: 핵심 도메인 용어 정의
- `system-spec/RELEASE_1_SPEC.md`: 인증, 권한, 기본 CRUD, 가시성
- `system-spec/RELEASE_2_SPEC.md`: 협업, 멘션, 타임라인, Inbox
- `system-spec/RELEASE_3_SPEC.md`: Work Graph, 뷰, 템플릿
- `system-spec/RELEASE_4_SPEC.md`: 승인 정책, 알림, 분석, 운영 관리

## 1. 인증/인가

입력은 데모 헤더 `X-Demo-User-Id`입니다.

시스템 요구사항:

- `/health`를 제외한 API는 사용자 컨텍스트를 확인합니다.
- 사용자 식별 실패 시 `401 UNAUTHORIZED`를 반환합니다.
- 역할 미달 시 `403 FORBIDDEN`을 반환합니다.
- 역할 비교는 `MEMBER < OWNER < ADMIN < SUPER_ADMIN` 순서를 사용합니다.

영향 영역:

- API 전역 미들웨어
- 관리자 화면과 설정 화면
- 프론트 권한 부족 안내

## 2. 리소스 가시성

시스템 요구사항:

- 요청 사용자의 `visibleTaskIds`를 계산합니다.
- 관리자 역할은 전체 태스크를 볼 수 있습니다.
- 일반 사용자는 owner/assignee/watcher 관계와 parent chain을 볼 수 있습니다.
- 가시 범위 밖 태스크 접근은 `403 FORBIDDEN`입니다.
- 보이는 태스크라도 watcher 또는 parent chain만으로 접근한 사용자는 태스크 필드를 수정할 수 없습니다.
- 태스크 필드 수정은 관리자, task owner, task assignee, 해당 unit owner로 제한합니다.
- Form/description 수정은 관리자, task owner, task assignee로 제한합니다.

영향 영역:

- 태스크 상세
- 노트/댓글 조회와 작성
- 멘션 검증
- Inbox/타임라인 노출

## 3. unit/folder/list 무결성

시스템 요구사항:

- `unitId`, `folderId`, `listId`는 실제 존재해야 합니다.
- `folderId`와 `listId`는 같은 단위/컨텍스트에 속해야 합니다.
- 불일치 요청은 저장 전에 `400 FOLDER_LIST_MISMATCH`로 차단합니다.

영향 영역:

- 태스크 생성/수정
- 리스트 이동
- 워크스페이스 탐색 필터

## 4. Work Graph와 템플릿

시스템 요구사항:

- `templateId`와 `templateType`은 nullable입니다.
- 태스크는 `FREEFORM`과 `TEMPLATED` 상태를 모두 지원합니다.
- 템플릿 적용 시 `formValues`를 `formDefinition` 배열의 field key 기준으로 초기화합니다.
- Form Output 저장은 템플릿 필드 정의와 호환되어야 합니다.
- parent 변경은 Work Graph cycle을 만들 수 없습니다.

영향 영역:

- `/api/tasks`
- `/api/templates`
- 태스크 상세 Form Output
- 결정 그래프 뷰

## 5. 협업과 멘션

시스템 요구사항:

- 댓글 작성/수정 시 `referencedNoteIds`를 검증합니다.
- 댓글 작성/수정 시 `mentions`를 검증합니다.
- `FORM_FIELD` 멘션은 대상 태스크와 필드 키 존재를 확인합니다.
- 유효하지 않은 참조는 `INVALID_NOTE_REFERENCE` 또는 `INVALID_MENTION`으로 실패합니다.

영향 영역:

- 우측 스레드 탭
- 커맨드형 `@`/`#` composer
- 알림 라우팅

## 6. 상태 전이와 결정

시스템 요구사항:

- 전이 요청은 `reason`을 필수로 받습니다.
- `TaskState`는 `DRAFT`, `IN_PROGRESS`, `DONE`, `CANCELED`입니다.
- 승인 대기 등 세부 단계는 `WorkflowStatusCategory`로 표현합니다.
- 전이 결과는 타임라인 이벤트와 Inbox 항목을 생성합니다.

영향 영역:

- `/api/tasks/:taskId/transition`
- 우측 타임라인 탭
- 승인/반려/보완 UX

## 7. 뷰와 그룹

시스템 요구사항:

- 태스크 화면은 리스트, 보드, 백로그, 결정 그래프 뷰를 제공합니다.
- 기존 계층 화면과 결정 그래프는 별도 1차 메뉴가 아니라 태스크 뷰 탭으로 제공합니다.
- 뷰의 그룹은 상태/담당자/폴더/리스트 기준으로 동작합니다.

영향 영역:

- `/tasks?view=list|board|backlog|graph`
- 결정 그래프 표시 레이어

## 8. 알림과 Inbox

시스템 요구사항:

- Inbox 항목은 읽음, 확인, 리마인드, 전체 읽음 처리를 지원합니다.
- 전체 읽음 처리(`read-all`)는 관리자여도 현재 사용자 본인의 Inbox만 변경합니다.
- 알림 설정은 채널과 컴포넌트별 토글을 저장합니다.
- Push subscription은 등록/해제를 지원합니다.

영향 영역:

- `/api/inbox`
- `/api/settings/notifications`
- `/api/push/subscriptions`

## 9. 분석

시스템 요구사항:

- `/api/analytics/retention`은 현재 데이터와 engagement event를 기반으로 계산합니다.
- Objective 1/KR 1.1 지표를 분석 화면에서 노출합니다.
- 고정 더미값이 아니라 이벤트 로그 기반 값을 우선합니다.

영향 영역:

- 관리자 분석 화면
- unmet needs/retention 판정 카드
- 릴리즈 회귀 테스트

## 10. 에러와 테스트

공통 에러 응답은 `error`와 `requestId`를 포함합니다. Zod 검증 실패는 `VALIDATION_ERROR`와 `issues`를 반환합니다.

필수 회귀:

- 인증 실패/권한 부족
- 가시성 밖 리소스 접근
- folder/list 무결성
- 노트 참조/멘션 검증
- 템플릿 적용
- 전이/Inbox 라우팅
- 분석 지표 계산
