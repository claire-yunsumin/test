# 백엔드 이해 가이드

## 한 줄 요약

현재 백엔드는 `Express + Zod + 인메모리 데이터` 기반입니다.  
"권한/가시성/입력검증"을 서버에서 강제하고, 프론트는 안내만 담당합니다.

## 핵심 파일 구조

```text
apps/api/src/
  server.ts           전체 라우트 등록, 앱 생성, 에러 처리
  domain/store.ts     인메모리 데이터, 직렬화, 이벤트/분석 계산
  http/access.ts      인증/인가, 가시성, 참조/멘션 검증
  http/security.ts    보안 헤더, CORS, rate limit
  http/validation.ts  공통 Zod 텍스트 검증 헬퍼
  security.test.ts    보안/권한/검증/CRUD 회귀 테스트
```

## 요청 처리 흐름

1. `authenticate`에서 `X-Demo-User-Id`로 사용자 식별  
2. `requireRole`/`getVisibleTask`로 역할 및 리소스 접근 확인  
3. Zod로 요청 본문 검증  
4. `domain/store.ts`에서 데이터 변경 + 타임라인/엔게이지먼트 반영  
5. 공통 에러 핸들러가 `VALIDATION_ERROR`, `FORBIDDEN` 등으로 응답

## 권한 모델(실무 이해용)

- 역할 순서: `VIEWER < EDITOR < APPROVER < ADMIN`
- `VIEWER`: 본인이 assignee/watcher인 태스크만 조회 가능, 쓰기 제한 큼
- `EDITOR`: 일반 생성/수정/삭제 가능(일부 정책 제외)
- `APPROVER`: 승인 관련 전이 처리 가능
- `ADMIN`: 전체 가시성 + 관리 API + 멤버 관리 가능

## 데이터 모델 포인트

- 태스크는 `unitId`, `folderId`, `listId`를 가짐
- 태스크 생성/수정 시 `folderId`와 `listId` 조합 무결성 검증
- 노트 참조(`referencedNoteIds`)는 사용자에게 보이는 태스크의 노트만 허용
- 멘션(`MEMBER`, `TASK`, `FORM_FIELD`, `NOTE`)도 동일한 가시성 규칙 적용

## 이벤트/분석

- 타임라인(`timeline`): 상태 전이/노트 변경/구조 변경 등 이력
- 엔게이지먼트(`engagement`): 행동성 이벤트(댓글, 멘션, 방문 등)
- 분석(`analytics`): 리텐션/협업 관련 지표를 현재 데이터에서 계산

## 테스트 전략

`apps/api/src/security.test.ts`에서 아래를 회귀 테스트합니다.

- 보안 헤더/CORS/미인증 사용자
- IDOR/역할 경계
- 노트 참조/멘션 검증
- folder-list 무결성
- CRUD 스모크 경로

## 나중에 확장할 때

- `server.ts` 라우트를 기능 단위로 분리(`tasks`, `workspace`, `analytics`, `admin` 등)
- 인메모리 스토어를 Repository 인터페이스 + DB 구현으로 교체
- 데모 헤더 인증을 실제 세션/JWT 인증으로 교체
