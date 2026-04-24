# 문서 인덱스 (학습 순서 가이드)

이 폴더 문서는 "전체 구조 이해 -> API 이해 -> 데이터 흐름 이해 -> 룰/스펙 이해" 순서로 보면 가장 빠르게 익힐 수 있습니다.

## 1) 먼저 읽기 (큰 그림)

- `ARCHITECTURE.md`  
  시스템 구조, 경계, 진화 방향
- `BACKEND.md`  
  백엔드 핵심 책임과 처리 흐름
- `FRONTEND.md`  
  프론트 화면 구성과 상태 흐름

## 2) API 이해

- `API_SPEC.md`  
  엔드포인트, 호출 규칙, 메서드 용어/비교표
- `APPROVAL_POLICY_SPEC.md`  
  승인정책 스키마/API/전이 연동 스캐폴드

## 3) 데이터 흐름 학습 트랙 (생애주기)

- `TASK_LIFECYCLE.md`  
  태스크 생성부터 종료/삭제까지
- `TIMELINE_LIFECYCLE.md`  
  타임라인 데이터 생성/저장/표현
- `INBOX_LIFECYCLE.md`  
  Inbox 라우팅/표시/읽음 토글
- `DECISION_GRAPH_LIFECYCLE.md`  
  그래프 데이터 조합/시각화 흐름
- `AUTH_VISIBILITY_LIFECYCLE.md`  
  인증/권한/가시성 검증 흐름

## 4) 비즈니스 룰/시스템 스펙

- `business-rules/BUSINESS_RULES.md`  
  제품 운영 기준이 되는 비즈니스 규칙
- `business-rules/SYSTEM_SPEC.md`  
  룰이 시스템 요구사항으로 내려오는 매핑
- `business-rules/system-spec/RELEASE_1_SPEC.md`
- `business-rules/system-spec/RELEASE_2_SPEC.md`
- `business-rules/system-spec/RELEASE_3_SPEC.md`
- `business-rules/system-spec/RELEASE_4_SPEC.md`

## 5) 액션 모델

- `ACTION_FLOWS.md`  
  Hook 루프, 의사결정 액션 플로우, 그래프 레이어

---

## 추천 학습 순서 (비개발자 기준)

1. `ARCHITECTURE.md`
2. `API_SPEC.md`
3. `TASK_LIFECYCLE.md`
4. `TIMELINE_LIFECYCLE.md` + `INBOX_LIFECYCLE.md`
5. `DECISION_GRAPH_LIFECYCLE.md`
6. `BUSINESS_RULES.md` -> `SYSTEM_SPEC.md` -> Release 스펙
