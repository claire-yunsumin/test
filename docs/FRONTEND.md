# 프론트엔드 이해 가이드

## 한 줄 요약

현재 프론트엔드는 `React + Vite` 단일 앱입니다. `App.tsx`는 `/api/bootstrap`과 라우트 분기, `Shell`이 GNB·Unit/Folder/List Explorer·본문 그리드를 담당하며, 첫 진입은 `/home` 대시보드가 받습니다. Unit/Folder/List Explorer는 태스크 작업대(`/tasks`, `/tasks/:id`, `/graph`)에서만 펼쳐집니다. 화면별 본문은 `pages/*`와 `features/tasks/*`가 조합하고, `components/ui.tsx`는 공통 UI 프리미티브를 제공합니다.

## 파일 구조

```text
apps/web/src/
  App.tsx                        bootstrap, URL `unit`/`list` 쿼리, Shell 하위에 페이지 위임
  main.tsx                       엔트리
  layout/Shell.tsx               GNB, Explorer(유닛·폴더·리스트), 전역 검색, 즐겨찾기
  components/ui.tsx              PageHeader, Badge, Tabs, Select, FilterShell, Centered 등
  components/WorkspaceSurfaceIcons.tsx  Explorer에서 리스트/유닛 범위 아이콘(#는 노트 커맨드용이므로 미사용)
  features/tasks/TaskViewTabs.tsx  태스크 뷰 모드(리스트/보드/백로그/그래프) 탭
  pages/HomePage.tsx             결정 대기·내 태스크·임박 항목 중심 홈 대시보드
  pages/TasksPage.tsx            태스크 작업대
  pages/TaskDetailPage.tsx       태스크 상세·우측 패널
  pages/InboxPage.tsx, DecisionGraphPage.tsx, AnalyticsPage.tsx, HierarchyPage.tsx
  pages/settings/SettingsPages.tsx  설정·관리 화면 묶음
  lib/api.ts                     request() fetch 래퍼, X-Demo-User-Id
  lib/router.ts                  currentRoute(), go()
  lib/viewTypes.ts               TaskDetail / TaskView 등 직렬화 뷰 타입
  lib/domain.ts                  라벨·표시용 헬퍼
  styles.css                     전역·셸·익스플로러·화면 스타일
```

## 화면 구성

- 홈: `/`와 `/home`은 유닛 필터와 무관하게 결정 대기, 내 활성 태스크, 오늘/임박 항목, 참관 업데이트를 우선 보여 줍니다.
- 태스크 뷰: `리스트`, `보드`, `백로그`, `결정 그래프`
- 태스크 상세: 시스템 필드, 노트/Form Output 본문, 우측 `논의/변경 기록` 탭
- 스레드 입력: `@` 커맨드로 사람/노드/Form 필드 검색, `#` 커맨드로 노트 검색
- 그래프 뷰: `/graph` 라우트이면서 태스크 뷰 탭에서도 접근. 우측 Inspector는 임박, 근거 없음, 논의 후 결정 없음 같은 액션 신호를 제공합니다.
- Inbox: 수신함/발신함 2열 구조입니다. 수신함은 더 넓은 영역에서 `DECISION`, `DISCUSSION`, `AWARENESS`, `RESULT` 탭과 읽음 처리를 제공하고, 발신함은 보낸 요청/알림의 열람·SLA·리마인드 상태를 추적합니다.
  - `APPROVAL_REQUESTED` 수신 항목은 `결정 입력`으로 빠른 결정 모달을 열 수 있고, 리뷰 코멘트와 함께 `승인/보완요청/반려`를 전송합니다.
  - `CONSENSUS` 정책에서는 `APPROVE` 액션 라벨을 `합의`로 표시합니다(전송값은 `APPROVE` 유지).
- 좌측 Explorer: 태스크 대메뉴에서만 펼쳐지는 **Unit → Folder → List** IA(팀즈 팀/채널은 구조 참고용). 리스트 행은 `#` 대신 전용 아이콘으로 표시해 스레드의 `#` 노트 커맨드와 구분합니다.
- 설정/관리: 프로필, 유닛, 전역 유닛, 접근제어, 멤버, 권한, 승인정책, 템플릿, 알림, 분석

## 태스크 뷰

`TaskViewMode`는 현재 아래 4개입니다.

- `list`: 고밀도 테이블, 빠른 필터, 정렬, 그룹, 다중 선택, parent 이동
- `board`: 상태별 보드
- `backlog`: 백로그와 스프린트 투입 흐름
- `graph`: Decision Graph로 이동하는 태스크 뷰 탭

뷰 상태는 URL query와 동기화됩니다.

- `view=board|backlog|graph`
- `sort=updated|due|priority`
- `group=state|assignee|folder|list`
- `state`, `type`, `q`, `qf`, `af`

## 태스크 상세

상세 화면은 `GET /api/tasks/:taskId` 응답으로 렌더링합니다.

- 좌측: 시스템 필드, 소유자, 우선순위, 기한, 담당자/참관자, 하위 항목/노트/스레드/파일 수
- 중앙: 노트, Form Output, 검수 기준
- 우측: `TaskRightPanel` (`TaskDetailPage.tsx`)
  - 상단 `관계/구조 맥락` 1-depth 미니맵(상/하위 노드 클릭 이동, head/tail 요약)
  - 미니맵 바로 아래 `의존성/영향 범위` 블록(`Depends on`, `Blocks`, `Affected`)과 관련 태스크 이동
  - `논의` 탭: 댓글, 멘션, 노트 참조, 커맨드형 composer
  - `변경 기록` 탭: 이벤트 로그, 세션 묶음, 전체 펼침/접기
- 하단: 결정 액션 바

우측 탭은 `rt=timeline` query로 상태가 유지됩니다. 현재 우측 패널은 sticky 고정보다 가시성 우선 원칙으로 동작하며, 관계/의존성/탭/콘텐츠가 위에서 아래로 모두 노출되는 레이아웃을 사용합니다.

### 리치 편집기/블록 편집

- `__task_description`은 마크다운 리치에디터(`DescriptionRichEditor`)를 사용합니다.
  - 툴바: bold/italic/code/heading/list/checklist/quote/link
  - 미리보기 렌더링 지원
  - 클립보드 이미지 붙여넣기 시 첨부 API 업로드 후 `attachment://` 참조 토큰 삽입
- Form Output 자유폼(템플릿 미적용)은 블록형 편집 UI를 사용합니다.
  - 하단 점선 `+ 블록 추가` 버튼
  - 컨텍스트 메뉴에서 블록 타입(TEXT/LONG_TEXT/CHECKLIST/QUOTE/NUMBER) 선택 후 카드형 블록 생성
  - 템플릿 기반 Form Output은 기존 고정 필드 편집 방식 유지

### 노트 UX

- 노트 생성/수정 본문은 태스크 설명과 동일한 리치에디터를 재사용합니다.
- 노트 태그 라벨을 생성/수정/조회에서 관리합니다.
- 접힌 노트 헤더는 제목 1줄 + 내용 요약 1줄 + 작성자/시간 + 태그 라벨을 표시합니다.
- 노트별 공유 아이콘(hover/focus 노출)으로 링크 복사가 가능하며, 복사된 노트 링크를 스레드 입력창에 붙여넣으면 `#노트` 참조로 자동 변환됩니다.

## 공통 UI 컴포넌트

- `Tabs`: 일반 탭과 segmented 탭
- `Select`: 기본, 필터용, 인라인용 선택 컨트롤
- `FilterShell`: 필터 입력 묶음, 메타 정보, 초기화 액션
- `Badge`: tone 기반 상태 표시
- `PageHeader`, `PanelHeader`, `PanelTitle`, `Meta`, `Centered`

새 화면을 만들 때는 먼저 `components/ui.tsx`의 컴포넌트를 재사용하고, 반복되는 패턴은 이 파일로 끌어올립니다.

## 데이터 로딩

- 앱 최초 로딩은 `/api/bootstrap`입니다.
- `/`는 클라이언트 라우터에서 `/home`으로 해석됩니다.
- 상세 진입은 `/api/tasks/:taskId`입니다.
- 변경 액션 후 `onReload`로 서버 상태를 다시 가져옵니다.
- `request()`는 `Content-Type`과 `X-Demo-User-Id`를 기본으로 보내고, 오류를 사용자 메시지로 변환합니다.

## 프론트 권한 원칙

- 프론트 권한 체크는 안내와 버튼 상태 제어용입니다.
- 실제 보안은 API가 강제합니다.
- Form Output 편집은 서버의 `permissions.canEditForm`을 따릅니다.
- 태스크 필드 편집과 첨부 변경은 서버의 `permissions.canEditTask`를 따릅니다.
- 태스크 상세는 `permissions.canEditTask=false`인 watcher/read-only 사용자에게 제목, 담당자/공유, 기한, 우선순위, 상태 컨트롤을 비활성화하고 읽기 전용 안내를 노출합니다.

## 유지보수 포인트

- `App.tsx`는 데이터 주입과 라우트 스위치 위주이며, 화면은 `pages/*`·`features/*`로 모듈화하는 중입니다.
- URL query와 React state가 같이 움직이는 뷰는 query 업데이트 로직을 같이 점검해야 합니다.
- 화면 탭을 추가할 때는 사이드바 메뉴와 중복되지 않게 "탭으로 볼 것"과 "전역 메뉴로 갈 것"을 구분합니다.
