# 문서 인덱스

이 폴더는 현재 구현된 SelvasIn4 HWE 데모 앱의 코드 기준 문서입니다. 문서는 `apps/web`, `apps/api`, `packages/shared` 구현을 기준으로 정리합니다.

## 문서 구성

```text
docs/
  README.md
  OKR_MVP1_MVP2.md
  OKR_MATCHING_REPORT.md
  ARCHITECTURE.md
  FRONTEND.md
  BACKEND.md
  API_SPEC.md
  TASK_LIFECYCLE.md
  TEMPLATE_LIFECYCLE.md
  WORKSPACE_LIFECYCLE.md
  COMMENT_MENTION_LIFECYCLE.md
  TIMELINE_LIFECYCLE.md
  INBOX_LIFECYCLE.md
  DECISION_GRAPH_LIFECYCLE.md
  AUTH_VISIBILITY_LIFECYCLE.md
  ANALYTICS_LIFECYCLE.md
  ACTION_FLOWS.md
  APPROVAL_POLICY_SPEC.md
  NOTIFICATION_POLICY_SPEC.md
  ADMIN_OPERATIONS_GUIDE.md
  business-rules/
    BUSINESS_RULES.md
    DOMAIN_GLOSSARY.md
    SYSTEM_SPEC.md
    system-spec/
      RELEASE_1_SPEC.md
      RELEASE_2_SPEC.md
      RELEASE_3_SPEC.md
      RELEASE_4_SPEC.md
```

## 먼저 읽기

- `ARCHITECTURE.md`: 모노레포 구조, 프론트/백엔드/공유 패키지 경계, 현재 한계와 진화 규칙
- `FRONTEND.md`: React/Vite 앱 구조, 태스크 뷰, 상세 우측 패널, 공통 UI 컴포넌트
- `BACKEND.md`: Express API, 인메모리 스토어, 인증/권한/가시성/검증/이벤트 처리
- `API_SPEC.md`: 현재 등록된 API 엔드포인트, 요청/응답 규칙, 대표 에러

## 생애주기 문서

- `TASK_LIFECYCLE.md`: 태스크 생성, 형상화/정형화, 배치, 협업, 전이, 삭제
- `TEMPLATE_LIFECYCLE.md`: Template 생성/수정, 태스크 적용, Form Output 초기화, workflow 전이
- `WORKSPACE_LIFECYCLE.md`: Unit, Folder, List, Task 배치와 무결성 검증
- `COMMENT_MENTION_LIFECYCLE.md`: 스레드 댓글, `@`/`#` 커맨드, 멘션/노트 참조 검증, 파생 이벤트
- `TIMELINE_LIFECYCLE.md`: 타임라인 이벤트 생성, 저장 구조, 상세 우측 탭 표현
- `INBOX_LIFECYCLE.md`: Inbox 생성, 분류, 수신자 계산, 읽음/확인/리마인드 처리
- `DECISION_GRAPH_LIFECYCLE.md`: 태스크/노트/스레드/타임라인 데이터를 그래프 뷰로 투영하는 방식
- `AUTH_VISIBILITY_LIFECYCLE.md`: 데모 인증, 역할 비교, 리소스 가시성, 멘션/노트 참조 검증
- `ANALYTICS_LIFECYCLE.md`: engagement event 생성, 지표 계산, 분석 화면 반영

## 운영과 정책 문서

- `ACTION_FLOWS.md`: Hook 루프, 형상화-정형화-멘션, 결정 전이, 태스크 뷰, Inbox 라우팅 흐름
- `APPROVAL_POLICY_SPEC.md`: 승인정책 모델, 승인 라인, 전이 연동, 승인자 계산 우선순위
- `NOTIFICATION_POLICY_SPEC.md`: 알림 설정, Push subscription, Inbox 읽음/확인/리마인드 운영 정책
- `ADMIN_OPERATIONS_GUIDE.md`: 멤버/초대/권한 변경, 자기 자신 삭제/강등 방지, 관리자 위험 작업 기준

## 비즈니스 룰 문서

- `OKR_MVP1_MVP2.md`: Objective 1/2, KR, Hook 루프 기준을 정리한 OKR 원문
- `OKR_MATCHING_REPORT.md`: OKR 대비 현재 시스템 구현 매칭 결과(달성/부분달성/미달성)
- `business-rules/BUSINESS_RULES.md`: 제품에서 반드시 지켜야 하는 운영 기준과 서버 검증 원칙
- `business-rules/DOMAIN_GLOSSARY.md`: Unit, Work Graph, Template, Inbox, Decision Graph 등 핵심 도메인 용어 정의
- `business-rules/SYSTEM_SPEC.md`: 비즈니스 룰을 시스템 요구사항과 영향 영역으로 매핑
- `business-rules/system-spec/RELEASE_1_SPEC.md`: 인증, 권한, 기본 CRUD, 가시성
- `business-rules/system-spec/RELEASE_2_SPEC.md`: 협업, 멘션, 타임라인, Inbox
- `business-rules/system-spec/RELEASE_3_SPEC.md`: Work Graph, 뷰, 템플릿
- `business-rules/system-spec/RELEASE_4_SPEC.md`: 승인 정책, 알림, 분석, 운영 관리

## 현재 구현 핵심

- 인증은 `X-Demo-User-Id` 헤더 기반입니다.
- 역할은 `MEMBER < OWNER < ADMIN < SUPER_ADMIN` 순서입니다.
- 첫 진입 화면은 `/home`이며, 결정/논의 Inbox, 내 활성 태스크, 임박 항목, 참관 업데이트를 요약합니다.
- 알림함(`/inbox`)은 수신함/발신함 2열 구조이며, 수신함 안에 `DECISION`, `DISCUSSION`, `AWARENESS`, `RESULT` 탭이 있습니다.
- 태스크는 `unitId`, `folderId`, `listId`, `parentId` 맥락을 가집니다.
- 좌측 `Shell`의 Explorer는 Unit·Folder·List를 트리로 보여 주며(팀/채널 UI는 **IA 참고**), List 행에 채널의 `#` 표기는 쓰지 않습니다(스레드의 `#` 노트 커맨드와 구분).
- Work Graph는 `FREEFORM` 형상화와 `TEMPLATED` 정형화를 구분합니다.
- Template은 `formDefinition`, `inspectionCriteria`, `workflow`, `workflowSchema`를 가집니다.
- 스레드는 입력 중 `@` 또는 `#` 커맨드 검색으로 멘션/노트 참조를 선택합니다.
- 태스크 상세 우측 영역은 `논의`와 `변경 기록` 탭으로 전환됩니다.
- 태스크 상세 우측 상단에는 현재 태스크 기준 1-depth `관계/구조 맥락` 미니맵이 표시되며, 상/하위 노드를 클릭해 이동할 수 있습니다.
- `__task_description`은 마크다운 리치에디터로 편집하며 클립보드 이미지 붙여넣기(`Ctrl/Cmd+V`) 시 첨부 업로드와 본문 참조 삽입을 지원합니다.
- 자유폼(Form Output) 편집은 노션 스타일 블록 추가 UI(점선 `+ 블록 추가` + 컨텍스트 메뉴)로 동작합니다.
- 노트는 리치에디터 본문과 태그 라벨(`제안`, `기준문서반영완료` 등)을 지원하며, 노트 링크 복사 후 스레드에 붙여넣으면 `#노트` 참조로 자동 변환됩니다.
- Decision Graph Inspector는 임박, 근거 없음, 논의 후 결정 없음 같은 액션 신호를 표시합니다.
- 태스크 뷰는 `리스트`, `보드`, `백로그`, `결정 그래프`로 구성됩니다.
- 태스크 필드 수정은 task owner, assignee, unit owner, admin 계열만 가능하며 watcher는 read-only입니다. 프론트 상세 화면도 이 권한을 따라 시스템 필드를 잠급니다.
- Analytics는 `engagement` 이벤트와 현재 콘텐츠 상태를 기반으로 계산합니다.
