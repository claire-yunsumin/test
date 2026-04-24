# 시스템 스펙 (비즈니스 룰 영향 관점)

## 문서 목적

이 문서는 `BUSINESS_RULES.md`의 규칙이 시스템 구현에 어떤 요구사항으로 내려오는지 정리합니다.  
즉, "비즈니스 룰 -> 시스템 동작" 매핑 문서입니다.

## 릴리즈 스코프 문서

릴리즈 단위 상세 스펙은 아래 하위 문서를 사용합니다.

- `system-spec/RELEASE_1_SPEC.md`
- `system-spec/RELEASE_2_SPEC.md`
- `system-spec/RELEASE_3_SPEC.md`
- `system-spec/RELEASE_4_SPEC.md`

## 1) 인증/인가 스펙

### 입력

- 요청 헤더 `X-Demo-User-Id`

### 시스템 요구사항

- 사용자 식별 실패 시 `401 UNAUTHORIZED`
- 역할 미달 시 `403 FORBIDDEN`
- 역할 비교는 계층 기반(`VIEWER < EDITOR < APPROVER < ADMIN`)

### 영향받는 영역

- API 전 엔드포인트(예외: `/health`)
- 프론트 에러 처리 문구(`권한 부족`)

## 2) 리소스 가시성 스펙

### 시스템 요구사항

- 태스크 접근 전 `visibleTaskIds` 계산
- 가시 범위 밖 태스크 접근 시 `403 FORBIDDEN`
- 교차 참조 검증은 가시 범위를 기준으로 판단

### 영향받는 기능

- 태스크 상세 조회
- 노트 참조 검증
- 멘션 대상 검증
- Inbox/타임라인 노출 범위

## 3) 태스크 무결성 스펙(unit/folder/list)

### 시스템 요구사항

- 태스크 생성/수정 시 아래를 검증해야 함:
  - `unitId`가 유효한지
  - `listId`가 해당 `unitId`에 속하는지
  - `folderId`가 해당 `unitId`에 속하는지
  - `folderId`와 `listId` 조합이 일치하는지
- 조합 불일치 시 `400 FOLDER_LIST_MISMATCH`

### 영향받는 기능

- 태스크 생성
- 태스크 수정(이동 포함)
- 워크스페이스 필터/탐색 신뢰도

## 4) 노트/댓글/멘션 스펙

### 시스템 요구사항

- 댓글 생성/수정 시:
  - `referencedNoteIds` 유효성 검증
  - `mentions` 유효성 검증
- `FORM_FIELD` 멘션은 대상 태스크의 `fieldKey` 존재 여부까지 검증

### 오류 규약

- 노트 참조 실패: `400 INVALID_NOTE_REFERENCE`
- 멘션 실패: `400 INVALID_MENTION`

### 영향받는 기능

- 협업 스레드 신뢰성
- 알림 품질(의미 없는 멘션 방지)

## 5) 상태 전이/결정 스펙

### 시스템 요구사항

- 전이 요청에 `reason` 필수
- 결정 이벤트는 `timeline`에 기록
- 이해관계자 대상으로 Inbox 라우팅 수행

### 영향받는 기능

- 승인/반려/보완 프로세스
- 결정 이력 추적
- 재방문 트리거

## 6) 이벤트/분석 스펙

### 시스템 요구사항

- 주요 행동은 `engagement` 이벤트로 축적
- 분석 API는 저장된 이벤트/콘텐츠를 기반으로 계산

### 영향받는 기능

- 관리자 분석 화면
- 리텐션 지표
- 협업 활성도 관찰

## 7) 에러/응답 스펙

### 공통 응답 원칙

- 에러 응답에 `error`, `requestId` 포함
- Zod 검증 실패는 `VALIDATION_ERROR` + `issues` 반환

### 영향받는 기능

- 프론트 사용자 메시지 변환
- 운영 로그 상관관계 추적

## 8) 테스트 스펙(필수 회귀)

아래 항목은 회귀 테스트로 항상 보호해야 합니다.

- 인증 실패/권한 부족
- IDOR(가시성 밖 리소스 접근)
- 노트 참조/멘션 검증
- folder-list 무결성
- 전이 및 CRUD 핵심 경로

## 룰 변경 시 필수 점검표

비즈니스 룰이 변경되면 아래를 함께 수정해야 합니다.

1. 서버 검증 로직(`access`, `server` 레이어)
2. API 스펙 문서(`docs/API_SPEC.md`)
3. 회귀 테스트(`apps/api/src/security.test.ts`)
4. 프론트 안내 문구/제어(버튼 노출, 에러 메시지)
