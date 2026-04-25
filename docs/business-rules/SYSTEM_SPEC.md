# System Spec

이 문서는 `BUSINESS_RULES.md`가 실제 시스템 요구사항으로 내려오는 방식을 정리합니다. 최신 구현 기준은 `apps/api`, `apps/web`, `packages/shared`의 타입과 라우트입니다.

## Release / Execution 문서

- `DOMAIN_GLOSSARY.md`: 핵심 도메인 용어 정의
- `system-spec/RELEASE_1_SPEC.md`: 인증, 권한, 기본 CRUD, 가시성
- `system-spec/RELEASE_2_SPEC.md`: 협업, 멘션, 타임라인, Inbox
- `system-spec/RELEASE_3_SPEC.md`: Work Graph, 뷰, 템플릿
- `system-spec/RELEASE_4_SPEC.md`: 승인 정책, 알림, 분석, 운영 관리
- `system-spec/EXECUTION_PLAN_O1_100.md`: O1 최종 달성을 위한 우선순위 실행 계획(Release와 별도)

운영 원칙:
- `RELEASE_*_SPEC.md`는 기준 요구사항을 관리하는 고정 문서입니다.
- `EXECUTION_PLAN_*.md`는 목표 달성을 위한 실행 계획 문서이며 완료 후 매칭 리포트에 반영하고 아카이브합니다.

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

추가 요구사항(태스크 CRUD 거버넌스):

- 태스크 CRUD는 권한/가시성 검증과 무결성 검증을 동시에 통과해야 합니다.
- 수정(Update) 요청은 관계 cycle, 참조 무결성, 워크플로우 정합성을 함께 검증해야 합니다.
- 상태 전이 기반 수정은 `reason` 필수와 이벤트 기록(타임라인/Inbox)을 강제해야 합니다.
- 삭제(Delete)는 영향 범위를 사전 고지하고, soft delete 우선 정책을 지원해야 합니다.
- 복구(restore) 경로가 있는 경우 복구 시점에 parent/권한/템플릿 정합성 재검증이 필요합니다.

## 4. Work Graph와 템플릿

시스템 요구사항:

- `templateId`와 `templateType`은 nullable입니다.
- 태스크는 `FREEFORM`과 `TEMPLATED` 상태를 모두 지원합니다.
- 템플릿은 lifecycle(`DRAFT/ACTIVE/DEPRECATED/ARCHIVED`) 상태를 가져야 합니다.
- 템플릿 적용 시 `formValues`는 기존 값을 보존하고 `formDefinition` 배열의 field key 누락분을 보강합니다.
- Form Output 저장은 템플릿 필드 정의와 호환되어야 합니다.
- 템플릿 생성/수정 시 목적(`purposeTag`)과 기대 결과(`successOutcome`)를 관리할 수 있어야 합니다.
- 템플릿 생성/수정/워크플로우 저장 시 fingerprint를 갱신하고 유사 후보를 계산할 수 있어야 합니다.
- 레거시 파일 필드(`__task_files`, `FILE` type)는 Form Output/Template 저장 시 제거되어야 하며 재유입되면 안 됩니다.
- 자유폼 Form Output 편집은 블록 단위 추가/편집 흐름을 지원해야 합니다.
- parent 변경은 Work Graph cycle을 만들 수 없습니다.
- 템플릿 센터는 lifecycle 필터/검색/정렬/페이지네이션을 지원해야 합니다.
- 태스크 상세 템플릿 셀렉터는 `DEPRECATED/ARCHIVED`를 기본 숨김하되 현재 연결 템플릿은 예외적으로 노출해야 합니다.

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
- 노트는 본문 마크다운 편집과 태그 라벨(`tags`)을 지원해야 합니다.
- 노트 공유 링크를 스레드 입력에 붙여넣을 때 `#노트` 참조로 변환될 수 있어야 합니다.

영향 영역:

- 우측 스레드 탭
- 커맨드형 `@`/`#` composer
- 알림 라우팅

## 6. 상태 전이와 결정

시스템 요구사항:

- 전이 요청은 `reason`을 필수로 받습니다.
- `TaskState`는 `DRAFT`, `IN_PROGRESS`, `DONE`, `CANCELED`입니다.
- 승인 대기 등 세부 단계는 `WorkflowStatusCategory`로 표현합니다.
- 템플릿 전이 조건의 `approvalGate`가 활성화된 경우, 정책 선택은 `approvalGate.policyId`를 우선하고 없으면 task의 `approvalPolicyId`를 사용합니다.
- 선택된 정책의 `mode`/`approvalLines`/`finalApproverId`에 따라 결재 유형과 결재 라인을 해석해야 합니다.
- `mode=CONSENSUS`에서는 UI의 `APPROVE` 라벨을 `합의`로 표시하되, API 전송값은 `decisionType=APPROVE`를 유지합니다.
- 전이 결과는 타임라인 이벤트와 Inbox 항목을 생성합니다.

영향 영역:

- `/api/tasks/:taskId/transition`
- 우측 타임라인 탭
- 승인/반려/보완 UX
- `docs/APPROVAL_POLICY_SPEC.md`의 Inbox 승인 처리 플로우 및 정책 적용 순서

## 7. 뷰와 그룹

시스템 요구사항:

- 태스크 화면은 리스트, 보드, 백로그, 결정 그래프 뷰를 제공합니다.
- 홈 화면은 전체 태스크 목록이 아니라 결정 대기, 내 활성 태스크, 오늘/임박 항목, 참관 업데이트를 첫 진입 큐로 제공합니다.
- 기존 계층 화면과 결정 그래프는 별도 1차 메뉴가 아니라 태스크 뷰 탭으로 제공합니다.
- 뷰의 그룹은 상태/담당자/폴더/리스트 기준으로 동작합니다.

영향 영역:

- `/tasks?view=list|board|backlog|graph`
- `/home`
- 결정 그래프 표시 레이어

## 8. 알림과 Inbox

시스템 요구사항:

- Inbox 항목은 읽음, 확인, 리마인드, 전체 읽음 처리를 지원합니다.
- Inbox 화면은 수신함/발신함 2열 구조입니다. 수신함은 컴포넌트 탭과 읽음 처리를, 발신함은 보낸 요청의 수신자 열람/SLA/리마인드 상태를 표시합니다.
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
