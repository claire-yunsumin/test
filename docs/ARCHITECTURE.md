# SelvasIn4 HWE 아키텍처

## 현재 구조

이 저장소는 React/Vite 웹 앱, Express API, 공유 도메인 타입/시드 데이터를 한 곳에 둔 모노레포입니다. 제품 단계상 UI, API 계약, 워크플로우, 권한, 시드 데이터가 함께 변하므로 현재는 모노레포가 가장 빠르고 안전합니다.

```text
apps/
  api/
    src/server.ts           Express 앱 팩토리와 API 라우트
    src/domain/store.ts     인메모리 데이터, 직렬화, 타임라인/Inbox/Analytics 헬퍼
    src/http/access.ts      인증, 역할, 가시성, 참조/멘션 검증
    src/http/security.ts    보안 헤더, CORS, rate limit
    src/http/validation.ts  공통 Zod 텍스트 검증
    src/security.test.ts    보안/권한/검증/CRUD 회귀 테스트
  web/
    src/App.tsx             워크스페이스 셸, 화면 조합, 주요 상호작용
    src/components/ui.tsx   Badge, Tabs, Select, FilterShell 등 공통 UI
    src/lib/api.ts          fetch 래퍼와 에러 메시지 변환
    src/lib/router.ts       클라이언트 라우팅 유틸
    src/lib/viewTypes.ts    API 직렬화 결과에 맞춘 뷰 타입
packages/
  shared/
    src/index.ts            도메인 타입, enum, 메타데이터, 시드 데이터
docs/
  *.md                      현재 구현 기준 학습/운영 문서
```

## 경계

- `packages/shared`는 도메인 언어의 기준입니다. `Task`, `Template`, `Mention`, `ApprovalPolicy`, `Analytics`, workflow enum이 여기서 시작됩니다.
- `apps/api`는 신뢰 경계입니다. 프론트에서 버튼을 숨기더라도 서버는 인증, 역할, 가시성, 입력 검증을 반드시 수행합니다.
- `apps/web`은 운영 화면과 상호작용을 담당합니다. 태스크 뷰 탭, 상세 우측 패널, 커맨드형 멘션, 버킷/백로그/보드 조작이 이곳에 있습니다.
- `docs`는 코드의 현재 상태를 설명하는 기준 문서입니다. enum, API, 역할 정책이 바뀌면 함께 갱신해야 합니다.

## 현재 제품 모델

- 태스크는 Work Graph 노드입니다.
- `FREEFORM`은 자유 형상화 상태이고, `TEMPLATED`는 Template 적용으로 정형화된 상태입니다.
- Template은 Form Output 필드, 검수 기준, legacy workflow, `workflowSchema`를 포함합니다.
- 노트는 근거 문서, 스레드는 논의 신호, 타임라인은 변경/결정 로그입니다.
- Decision Graph는 별도 DB가 아니라 `tasks`, `notes`, `comments`, `timeline`, `referencedNoteIds`, `parentId`를 프론트에서 투영한 뷰입니다.
- Analytics는 저장된 `engagement` 이벤트와 콘텐츠 상태에서 계산됩니다.

## 주요 아키텍처 결정

- API는 현재 인메모리 데이터지만, `domain/store.ts`에 모여 있어 DB 리포지토리로 교체하기 쉽습니다.
- `server.ts`가 아직 크지만, 모든 라우트가 한 파일에 있어 현재 수직 슬라이스 검증은 빠릅니다.
- 태스크 메뉴에서 `리스트`, `보드`, `백로그`, `결정 그래프`를 동일한 뷰 탭으로 다룹니다.
- 태스크 상세 우측 영역은 `스레드`와 `타임라인`을 탭으로 전환합니다.
- 스레드 입력은 후보 칩을 상시 노출하지 않고, `@`/`#` 커맨드 검색 메뉴로 멘션/노트 참조를 선택합니다.

## 현재 한계

- `apps/api/src/server.ts` 라우트가 커졌습니다. 기능이 안정되면 `routes/tasks`, `routes/workspace`, `routes/templates`, `routes/admin`, `routes/notifications`로 나눕니다.
- `apps/web/src/App.tsx`가 화면 대부분을 담고 있습니다. 안정화 후 `features/tasks`, `features/settings`, `features/inbox`, `features/graph`로 분리합니다.
- 인메모리 저장소라 서버 재시작 시 데이터가 초기화됩니다.
- 데모 인증 헤더는 실제 인증이 아닙니다. 운영 전에는 세션/JWT/OIDC로 교체해야 합니다.

## 진화 규칙

1. 새 도메인 필드는 `packages/shared`에서 먼저 정의합니다.
2. 상태 변경 API는 Zod 검증과 서버 권한/가시성 검증을 통과해야 합니다.
3. 프론트 권한 체크는 UX 보조일 뿐, 보안 경계가 아닙니다.
4. `unitId`, `folderId`, `listId` 정합성은 서버가 강제합니다.
5. 노트 참조와 멘션은 요청 사용자의 visible task 범위 안에서만 허용합니다.
6. 타임라인/Inbox/Engagement 생성 규칙이 바뀌면 테스트와 문서를 같이 갱신합니다.
