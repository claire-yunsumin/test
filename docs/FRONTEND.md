# 프론트엔드 이해 가이드

## 한 줄 요약

현재 프론트엔드는 `React + Vite` 단일 앱입니다. `App.tsx`가 아직 주요 화면 조합을 담당하고, `components/ui.tsx`가 공통 UI 프리미티브를 제공합니다.

## 파일 구조

```text
apps/web/src/
  App.tsx             워크스페이스 셸, 라우팅, 화면, 주요 상호작용
  components/ui.tsx   PageHeader, Badge, Tabs, Select, FilterShell 등
  lib/api.ts          request() fetch 래퍼와 에러 메시지 변환
  lib/router.ts       currentRoute(), go()
  lib/viewTypes.ts    API 직렬화 결과용 TaskDetail/TaskView 타입
  styles.css          전체 UI 스타일과 반응형 규칙
```

## 화면 구성

- 태스크 뷰: `리스트`, `보드`, `백로그`, `결정 그래프`
- 태스크 상세: 시스템 필드, 노트/Form Output 본문, 우측 `스레드/타임라인` 탭
- 스레드 입력: `@` 커맨드로 사람/노드/Form 필드 검색, `#` 커맨드로 노트 검색
- 그래프 뷰: `/graph` 라우트이면서 태스크 뷰 탭에서도 접근
- Inbox: `DECISION`, `DISCUSSION`, `AWARENESS`, `RESULT` 탭
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
- `group=state|assignee|bucket`
- `state`, `type`, `q`, `qf`, `af`

## 태스크 상세

상세 화면은 `GET /api/tasks/:taskId` 응답으로 렌더링합니다.

- 좌측: 시스템 필드, 소유자, 우선순위, 기한, 담당자/참관자, 하위 항목/노트/스레드/파일 수
- 중앙: 노트, Form Output, 검수 기준
- 우측: `TaskRightPanel`
  - `스레드` 탭: 댓글, 멘션, 노트 참조, 커맨드형 composer
  - `타임라인` 탭: 이벤트 로그, 세션 묶음, 전체 펼침/접기
- 하단: 결정 액션 바

우측 탭은 `rt=timeline` query로 상태가 유지됩니다.

## 공통 UI 컴포넌트

- `Tabs`: 일반 탭과 segmented 탭
- `Select`: 기본, 필터용, 인라인용 선택 컨트롤
- `FilterShell`: 필터 입력 묶음, 메타 정보, 초기화 액션
- `Badge`: tone 기반 상태 표시
- `PageHeader`, `PanelHeader`, `PanelTitle`, `Meta`, `Centered`

새 화면을 만들 때는 먼저 `components/ui.tsx`의 컴포넌트를 재사용하고, 반복되는 패턴은 이 파일로 끌어올립니다.

## 데이터 로딩

- 앱 최초 로딩은 `/api/bootstrap`입니다.
- 상세 진입은 `/api/tasks/:taskId`입니다.
- 변경 액션 후 `onReload`로 서버 상태를 다시 가져옵니다.
- `request()`는 `Content-Type`과 `X-Demo-User-Id`를 기본으로 보내고, 오류를 사용자 메시지로 변환합니다.

## 프론트 권한 원칙

- 프론트 권한 체크는 안내와 버튼 상태 제어용입니다.
- 실제 보안은 API가 강제합니다.
- Form Output 편집은 서버의 `permissions.canEditForm`을 따릅니다.

## 유지보수 포인트

- `App.tsx`가 커졌으므로 다음 분리 후보는 `features/tasks`, `features/settings`, `features/inbox`, `features/graph`입니다.
- URL query와 React state가 같이 움직이는 뷰는 query 업데이트 로직을 같이 점검해야 합니다.
- 화면 탭을 추가할 때는 사이드바 메뉴와 중복되지 않게 "탭으로 볼 것"과 "전역 메뉴로 갈 것"을 구분합니다.
