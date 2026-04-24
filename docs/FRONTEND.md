# 프론트엔드 이해 가이드

## 한 줄 요약

현재 프론트엔드는 `React + Vite` 단일 앱이며, `App.tsx` 안에서 화면 흐름을 통합 관리합니다.  
백엔드 권한 정책을 존중하면서, 사용자에게 "왜 안 되는지"를 UI로 명확히 안내하는 구조입니다.

## 핵심 파일 구조

```text
apps/web/src/
  App.tsx             라우팅, 화면 구성, 주요 상태/동작
  components/ui.tsx   탭/셀렉트/헤더 등 공통 UI 컴포넌트
  lib/api.ts          공통 fetch 래퍼, 에러 메시지 표준화
  styles.css          전체 화면 스타일 시스템
```

## 화면 구성(현재 기준)

- 태스크 계층/리스트/보드/백로그 뷰
- Decision Graph 뷰
- 태스크 상세 워크스페이스
  - 시스템 필드
  - 노트
  - 스레드(멘션 포함)
  - 타임라인
- 템플릿 관리
- 멤버 관리
- 분석 대시보드

## 데이터 로딩 방식

- 최초에 `/api/bootstrap`으로 핵심 데이터 일괄 로딩
- 주요 액션 후 `onReload`로 재동기화
- API 호출은 `lib/api.ts`의 `request()`를 사용
  - 기본 헤더: `Content-Type`, `X-Demo-User-Id`
  - 403/429/5xx를 사용자 이해형 메시지로 변환

## 프론트 권한 처리 원칙

- 프론트의 권한 체크는 **UX 안내 목적**
- 실제 보안은 서버가 강제
- 즉, 버튼을 숨겨도 서버 검증은 반드시 통과해야 동작

## 실무에서 이해하면 좋은 상태들

- 워크스페이스 컨텍스트: `selectedUnitId`, `selectedListId`
- 뷰 탭: list / board / backlog / graph
- 상세 화면의 협업 상태:
  - 댓글/멘션 작성 가능 여부
  - 폼 편집 가능 여부
  - 상태 전이 가능 여부(역할/현재 상태 의존)

## UI 유지보수 팁

- 공통 입력/선택/탭은 `components/ui.tsx`에서 먼저 재사용 고려
- API 실패 메시지 포맷은 `lib/api.ts`에 맞춰 일관성 유지
- 화면이 더 커지면 `App.tsx`를 기능 폴더(`features/tasks`, `features/inbox` 등)로 분리
