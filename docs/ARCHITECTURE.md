# SelvasIn4 HWE 아키텍처

## 현재 구조

이 저장소는 의도적으로 모노레포로 구성되어 있습니다. 현재 제품 단계에서는 UI, API 계약, 워크플로우 메타데이터, RBAC 규칙, 데모 도메인 데이터가 강하게 연결되어 있으므로, 한 저장소에 함께 두는 것이 경계를 유지하면서도 R2/R3 반복 속도를 높이는 데 유리합니다.

```text
apps/
  api/              PRD 핵심 흐름을 제공하는 Express API
    src/domain/     데모 스토어, 프로젝션, 이벤트 헬퍼
    src/http/       보안, 인증/인가, 유효성 검증 미들웨어
    src/server.ts   앱 팩토리, 라우트 등록, 프로세스 진입점
    src/*.test.ts   API 보안, RBAC, 그래프 가시성, 검증, CRUD 회귀 테스트
  web/              React 19 + Vite 애플리케이션
    src/components/ 재사용 UI 프리미티브
    src/lib/        API 클라이언트, 라우터, 뷰 전용 타입
    src/App.tsx     워크스페이스 셸, unit/list 컨텍스트, 화면 조합
packages/
  shared/           앱 공용 도메인 타입, 워크플로우 메타데이터, 시드 데이터
docs/
  ARCHITECTURE.md   모노레포 경계와 진화 규칙
  ACTION_FLOWS.md   Hook 루프, 액션 흐름, Decision Graph 다이어그램
```

## 아키텍처 결정

현 단계에서는 모노레포가 가장 적합합니다.

- `packages/shared`는 API/도메인 언어를 담당합니다(열거형, DTO 구조, 템플릿/상태 메타데이터).
- `apps/api`는 인가, 입력 검증, 이벤트 생성, 리텐션 분석, 리소스 스코프를 담당합니다. 프론트의 권한 체크는 UX 안내용 보조 장치일 뿐입니다.
- `apps/web`는 사용자 흐름, 상태 가시화, 피드백, Decision Graph 시각화, unit/folder/list 워크스페이스 컨텍스트, 상호작용 레이아웃을 담당합니다.
- 보안 규칙과 UX 규칙은 선택 사항이 아니라 운영 제약입니다.

## 지금 구조가 유효한 이유

- UI를 바로 실행해서 검토할 수 있습니다.
- API와 UI가 같은 도메인 어휘를 사용하므로 Inbox/Workflow/RBAC/Timeline에서 enum 불일치가 줄어듭니다.
- `/graph`는 별도 그래프 저장소 없이 기존 Task/Note/Thread/Timeline/참조 Note를 투영해 Decision Graph를 구성합니다.
- Task가 `unitId`/`folderId`/`listId`를 명시적으로 가지므로, 네비게이션 컨텍스트와 향후 영속화 구조를 조기에 정렬할 수 있습니다.
- 서버 무결성 검증으로 잘못된 folder/list 조합을 차단해 DB 이전 전에도 위치 일관성을 유지합니다.
- 보안 미들웨어가 라우트 로직과 분리되어 P0 검토를 독립적으로 수행할 수 있습니다.
- API 앱 생성이 `listen()`과 분리되어 테스트에서 독립적인 임시 서버를 사용할 수 있습니다.
- 프론트 공용 컨트롤과 API 에러 처리가 화면 조합 로직과 분리되어 있습니다.
- 데모 인메모리 스토어가 `apps/api/src/domain`에 격리되어 있어 이후 DB 리포지토리로 교체하기 쉽습니다.
- 자동화 테스트가 보안 헤더, CORS 차단, 미등록 사용자, IDOR, 역할 경계, 멘션/참조 검증, folder-list 무결성, CRUD 스모크 경로를 커버합니다.

## 현재 한계

- `apps/api/src/server.ts`에 라우트 등록이 집중되어 있습니다. API 범위가 커지면 기능별로 분리합니다.
  - `routes/tasks.ts`
  - `routes/notes.ts`
  - `routes/inbox.ts`
  - `routes/workspace.ts` (`units`/`folders`/`lists`)
  - `routes/analytics.ts`
  - `routes/admin.ts`
  - `routes/templates.ts`
- `packages/shared/src/index.ts`에 시드 데이터가 포함되어 있습니다. 영속 저장소 도입 시 `packages/fixtures` 또는 `apps/api/src/domain/fixtures`로 이동합니다.
- `apps/web/src/App.tsx`에 화면 컴포넌트가 집중되어 있습니다. 화면 구성이 안정화되면 아래와 같이 분리합니다.
  - `features/hierarchy`
  - `features/tasks`
  - `features/inbox`
  - `features/admin`
  - `features/templates`

## 진화 규칙

1. 새 enum/DTO 필드는 `packages/shared`에서 먼저 정의합니다.
2. 상태를 바꾸는 모든 API 엔드포인트는 Zod로 입력을 검증하고, 서버에서 역할/리소스 접근 제어를 강제해야 합니다.
3. 프론트 권한 체크는 사용자 안내를 위한 것이며, 단독 보안 장치가 되어서는 안 됩니다.
4. 화면은 태스크 컨텍스트를 유지해야 합니다(상태, 다음 액션, 협업, 타임라인이 가까이 있어야 함).
5. 라우트 파일은 도메인 헬퍼를 가져올 수 있지만, 도메인 헬퍼는 Express를 import 하면 안 됩니다.
6. 공유 패키지, 프론트 환경 변수, 시드 데이터, 로그, 생성 번들에 비밀값을 두지 않습니다.
7. 라우트 권한이나 리소스 가시성 규칙이 바뀌면 보안/인가 테스트를 반드시 갱신합니다.
8. 교차 태스크 노트 참조는, 참조 대상 노트가 요청 사용자에게 보이는 태스크에 속할 때만 허용됩니다.
9. 태스크 생성/수정 시 `unitId`/`folderId`/`listId` 일관성을 유지해야 하며, 불일치 조합은 API에서 거부해야 합니다.

## 다음 아키텍처 마일스톤

1. 영속성 경계 추가: 리포지토리 인터페이스와 DB 구현 분리.
2. 데모 인증 헤더를 실제 세션/JWT 미들웨어로 교체.
3. 현재 수직 슬라이스 범위를 넘어서면 API 라우트를 기능별로 분리.
4. UI 리뷰에서 PRD 흐름이 검증되면 웹 화면을 기능별로 분리.
5. UI 리뷰 이후 자동화 범위를 프론트 상호작용 흐름까지 확대.
