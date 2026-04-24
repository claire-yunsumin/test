# 문서 인덱스

이 폴더는 현재 구현된 SelvasIn4 HWE 데모 앱의 코드 기준 문서입니다. 원격은 `git pull` 기준 최신 상태이며, 문서는 `apps/web`, `apps/api`, `packages/shared` 구현을 기준으로 정리합니다.

## 먼저 읽기

- `ARCHITECTURE.md`: 모노레포 구조, 프론트/백/공유 패키지 경계, 현재 한계
- `FRONTEND.md`: 화면 구성, 태스크 뷰 탭, 상세 우측 패널, 공통 UI 컴포넌트
- `BACKEND.md`: Express API, 인메모리 스토어, 권한/검증/이벤트 처리
- `API_SPEC.md`: 현재 등록된 API 엔드포인트와 요청/응답 규칙

## 데이터 생애주기

- `TASK_LIFECYCLE.md`: 태스크 생성, 형상화/정형화, 수정, 전이, 삭제
- `TIMELINE_LIFECYCLE.md`: 타임라인 이벤트 생성과 상세 우측 탭 표현
- `INBOX_LIFECYCLE.md`: Inbox 생성, 분류, 읽음/확인/리마인드 처리
- `DECISION_GRAPH_LIFECYCLE.md`: 태스크 뷰의 그래프 탭과 `/graph` 투영 방식
- `AUTH_VISIBILITY_LIFECYCLE.md`: 데모 인증, 역할, 리소스 가시성, 멘션/노트 참조 검증

## 정책과 운영

- `APPROVAL_POLICY_SPEC.md`: 승인정책, 승인 라인, 전이 연동
- `BUCKET_GUIDE.md`: 버킷 생성/정렬/그룹 운영 방식
- `ACTION_FLOWS.md`: Hook 루프, 스레드/노트/타임라인/그래프 흐름

## 비즈니스 룰

- `business-rules/BUSINESS_RULES.md`: 제품 운영 기준
- `business-rules/SYSTEM_SPEC.md`: 비즈니스 룰을 시스템 요구사항으로 매핑
- `business-rules/system-spec/RELEASE_1_SPEC.md`: 인증/CRUD/가시성
- `business-rules/system-spec/RELEASE_2_SPEC.md`: 협업/멘션/Inbox/전이
- `business-rules/system-spec/RELEASE_3_SPEC.md`: unit/folder/list/bucket/workflow
- `business-rules/system-spec/RELEASE_4_SPEC.md`: 분석/알림/관리/운영 안정화

## 현재 구현 핵심

- 인증은 `X-Demo-User-Id` 헤더 기반입니다.
- 역할은 `MEMBER < OWNER < ADMIN < SUPER_ADMIN` 순서입니다.
- 태스크는 `unitId`, `folderId`, `listId`, `bucketId`, `parentId`를 가집니다.
- Work Graph는 `FREEFORM` 형상화와 `TEMPLATED` 정형화를 구분합니다.
- Template은 `formDefinition`, `inspectionCriteria`, `workflow`, `workflowSchema`를 가집니다.
- 스레드는 입력 중 `@` 또는 `#` 커맨드 검색으로 멘션/노트 참조를 선택합니다.
- 태스크 상세 우측 영역은 `스레드`와 `타임라인` 탭으로 전환됩니다.
- 태스크 메뉴의 뷰는 `리스트`, `보드`, `백로그`, `결정 그래프`로 통합되어 있습니다.
- Analytics는 `engagement` 이벤트와 현재 콘텐츠 상태를 기반으로 계산합니다.
