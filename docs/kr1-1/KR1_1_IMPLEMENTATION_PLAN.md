# KR 1.1 구현 플랜 — 전환 정책 커버 실행안

## 목적

| 항목 | 내용 |
| --- | --- |
| 기준 문서 | `KR1_1_TRANSITION_POLICY_DECISION.md` (KR11-TP-v1) |
| 목표 | FREEFORM/TEMPLATED 전환 정책(B안 안전 매핑)을 코드/UX/지표에 반영 |
| 완료 정의 | 수용 기준 TP-AC-01 ~ TP-AC-04를 코드/테스트/문서로 충족 |

## 구현 범위

| 트랙 | 범위 |
| --- | --- |
| API | 상태 매핑, 정책 재검증, 에러 코드, 이벤트 스키마 |
| Web | 전환 안내 UX, 불일치 경고, 상태/정책 가시화 |
| Shared | 타입 확장(이벤트/응답/검증 메타) |
| Analytics | 매핑 성공률/수동 보정률/전환 이벤트 지표 |
| Docs | 정책-구현-검증 결과 동기화 |

## 우선순위 실행 (P1 -> P4)

### P1. 서버 전환 엔진 구현

| 항목 | 상세 |
| --- | --- |
| 목표 | 템플릿 변경 시 `workflowStatusId` 안전 매핑 및 검증 강제 |
| 대상 파일 | `apps/api/src/server.ts`, `apps/api/src/domain/store.ts` |
| 작업 | 1) 카테고리 기반 상태 매핑 함수 추가 2) fallback 규칙 적용 3) 실패 시 `WORKFLOW_STATUS_MAPPING_REQUIRED` 반환 |
| 산출물 | 템플릿 적용/교체/해제 시 유효 상태 보장 |

### P2. 승인정책 정합성 처리

| 항목 | 상세 |
| --- | --- |
| 목표 | 템플릿 교체 시 승인정책 자동 재선정 없이 유효성 재검증 |
| 대상 파일 | `apps/api/src/server.ts`, `packages/shared/src/index.ts` |
| 작업 | 1) `approvalPolicyId` 유효성 재검증 2) 불일치 경고 메타 생성 3) 전이 시점 안전 차단 유지 |
| 산출물 | 정책 불일치가 누락되지 않고 사용자에게 명시 |

### P3. 전환 UX + 타임라인 이벤트

| 항목 | 상세 |
| --- | --- |
| 목표 | 사용자가 전환 결과(매핑/경고)를 즉시 이해하고 추적 가능 |
| 대상 파일 | `apps/web/src/pages/TaskDetailPage.tsx`, `apps/web/src/lib/domain.ts` |
| 작업 | 1) 템플릿 전환 결과 배지/토스트 2) 정책 재검토 필요 경고 3) 이벤트 타입(`TEMPLATE_APPLIED/REPLACED/REMOVED`) 표시 |
| 산출물 | 적용/교체/해제 구분 추적 가능 |

### P4. 지표/회귀/문서 동기화

| 항목 | 상세 |
| --- | --- |
| 목표 | 운영 지표와 회귀 테스트로 정책 준수 보장 |
| 대상 파일 | `apps/api/src/domain/store.ts`, `apps/web/src/pages/AnalyticsPage.tsx`, `docs/OKR_MATCHING_REPORT.md` |
| 작업 | 1) 매핑 성공률/수동 보정률 계산 2) 분석 화면 노출 3) KR1.1 커버리지 판정 갱신 |
| 산출물 | 정책 준수 여부를 수치로 운영 가능 |

## 테스트 계획

| 테스트 ID | 시나리오 | 기대 결과 |
| --- | --- | --- |
| KR11-IT-01 | FREEFORM -> TEMPLATED 적용 | 상태 매핑 성공, 유효 `workflowStatusId` 저장 |
| KR11-IT-02 | TEMPLATED A -> B 교체(상태셋 상이) | 카테고리 매핑 실패 시 default/legacy fallback 적용, 최종 유효성 실패 시 `WORKFLOW_STATUS_MAPPING_REQUIRED` |
| KR11-IT-03 | 템플릿 교체 + 비활성 정책 | 정책 재검증 경고/정리 동작 확인 |
| KR11-IT-04 | TEMPLATED -> FREEFORM 해제 | 협업 데이터 손실 없이 상태 유지 |
| KR11-IT-05 | 전환 이벤트 추적 | 타임라인에서 적용/교체/해제 구분 조회 가능 |

## 완료 체크리스트

| ID | 체크 항목 | 상태 | 완료 기준 | 구현/검증 근거 |
| --- | --- | --- | --- | --- |
| KR11-DONE-01 | 상태 매핑 엔진 | 완료 | TP-AC-01 충족 | `server.ts` 전환 매핑 로직 + `security.test.ts` KR11-IT-01/02 통과 |
| KR11-DONE-02 | 협업 데이터 보존 | 완료 | TP-AC-02 충족 | 템플릿 교체/해제 시 Thread/Timeline/Note/Attachment 유지 + KR11-IT-04 커버 |
| KR11-DONE-03 | 정책 불일치 가시화 | 완료 | TP-AC-03 충족 | `policyReviewRequired`/`policyReviewReason` 도입 + Task 상세 경고 노출 + KR11-IT-03 통과 |
| KR11-DONE-04 | 전환 이벤트 구분 | 완료 | TP-AC-04 충족 | `TEMPLATE_APPLIED/REPLACED/REMOVED` 이벤트 타입 추가 및 UI 라벨 반영 + KR11-IT-05 통과 |
| KR11-DONE-05 | 문서/리포트 갱신 | 완료 | KR1.1 하위 문서 + OKR 매칭 리포트 동기화 | `docs/kr1-1/*`, `docs/README.md`, `docs/OKR_MATCHING_REPORT.md` 갱신 |

검증 메모:
- API 테스트: `npm run test -w apps/api` 통과 (35 passed / 0 failed)
