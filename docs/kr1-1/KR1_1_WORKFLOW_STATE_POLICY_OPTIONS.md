# KR 1.1 부속 — 템플릿 변경 시 워크플로우 상태 처리 비교안

## 목적

| 항목 | 내용 |
| --- | --- |
| 문서 성격 | `KR1_1_FEATURE_SPEC.md` 하위 의사결정 문서 |
| 질문 | FREEFORM/TEMPLATED 전환 또는 템플릿 교체 시 `currentState`/`workflowStatusId`를 어떻게 처리할지 |
| 적용 범위 | `PATCH /api/tasks/:taskId`의 템플릿 변경 흐름 |

## 현재 구현 (AS-IS, KR11-TP-v1 반영 후)

| 항목 | 현재 동작 |
| --- | --- |
| 템플릿 적용 | `templateId`, `templateType`, `structureState`를 변경하고 `formValues`를 초기화/보강 |
| 상태 필드 | 템플릿 변경 시 카테고리 기반 안전 매핑을 수행하고, 필요 시 기본 상태/legacy fallback을 적용 |
| 승인정책 | `approvalPolicyId`는 자동 재선정하지 않으며 유효성 재검증 후 불일치 시 재검토 플래그를 남김 |
| 협업 데이터 | Thread/Timeline/Notes/Attachments는 `taskId` 귀속으로 유지 |
| 장점 | 진행 상태 유지(사용자 맥락 보존) |
| 리스크 | 템플릿별 상태셋 품질이 낮을 경우 fallback 비율이 높아질 수 있음(운영 모니터링 필요) |

## 전체 구성요소 양방향 처리 (AS-IS)

| 구성요소 | FREEFORM -> TEMPLATED | TEMPLATED -> FREEFORM | 템플릿 A -> B 변경 | 비고 |
| --- | --- | --- | --- | --- |
| `structureState` | `TEMPLATED`로 전환 | `FREEFORM`으로 전환 | `TEMPLATED` 유지 | 모드 플래그 |
| `templateId`/`templateType` | 새 템플릿 값 세팅 | `templateId=null`, `templateType`는 패치값 또는 기존값 유지 | 새 템플릿으로 교체 | 타입은 유지/수정 가능 |
| `formValues` | 기존값 유지 + 템플릿 필드 key 누락분 보강 | 자동 삭제 없이 유지 | 기존값 유지 + 신규 필드 보강 | 데이터 손실 최소화 우선 |
| `currentState` | 자동 변경 없음 | 자동 변경 없음(전환 결과에 맞춰 유지) | legacy 상태 규칙으로 재정렬 | 명시 patch/transition에서만 변경 |
| `workflowStatusId` | 카테고리 매핑 우선 | 카테고리 -> default -> legacy fallback | `LEGACY_STATE_TO_STATUS_ID[currentState]`로 정렬 | 카테고리 -> default -> legacy fallback |
| `approvalPolicyId` | 유효성 재검증 후 유지/정리 | 유효성 재검증 후 필요 시 null + 재검토 플래그 | 정책 재검토 플래그 해제 | 자동 재선정 없음, 불일치 가시화 |
| Workflow transition rule | 템플릿이 있으면 해당 workflowSchema 기준 평가 | 템플릿 해제 시 legacy 상태 규칙 기준 | 새 템플릿 규칙으로 즉시 평가 | 실행 규칙은 바뀌나 상태값은 유지 |
| Thread(댓글/멘션) | 유지 | 유지 | 유지 | `taskId` 귀속 |
| Timeline | 유지 + 추가 이벤트 누적 | 유지 + 추가 이벤트 누적 | 유지 + 추가 이벤트 누적 | 이력 연속성 유지 |
| Notes | 유지 | 유지 | 유지 | `taskId` 귀속 |
| Attachments | 유지 | 유지 | 유지 | `taskId` 귀속 |

## 설계상 의미

| 관점 | 의미 |
| --- | --- |
| 강점 | 전환 시 협업/근거 데이터 손실 없이 연속성 유지 |
| 한계 | fallback/수동 개입 비율이 증가하면 템플릿 상태 설계 품질 개선이 필요 |
| 정책 필요 지점 | 매핑 성공률/수동 보정률 지표를 운영 기준으로 관리 필요 |

## 비교안

| 안 | 처리 방식 | 장점 | 리스크 | 권장 상황 |
| --- | --- | --- | --- | --- |
| A. 상태 유지 (현행) | 템플릿만 변경, 상태는 그대로 유지 | 작업 연속성 최고, 예기치 않은 상태 점프 없음 | 템플릿 워크플로우와 상태 불일치 가능 | 초기 도입/마이그레이션 최소화 우선 |
| B. 안전 매핑 | 템플릿 변경 시 기존 상태를 새 템플릿의 동등 카테고리로 매핑(`OPEN/IN_PROGRESS/PENDING_APPROVAL/DONE/CANCELED`) | 불일치 리스크를 줄이면서 연속성 유지 | 매핑 규칙 설계 필요, 예외 케이스 처리 필요 | 현재 제품 단계에서 가장 균형적 |
| C. 상태 초기화 | 템플릿 변경 시 항상 기본 상태(예: `open`)로 초기화 | 규칙 단순, 일관성 명확 | 사용자 진행 맥락 손실, 반발 가능성 큼 | 엄격한 프로세스 리셋이 필요한 조직 |

## 권장안 (TO-BE)

| 항목 | 제안 |
| --- | --- |
| 최종 권장 | **B. 안전 매핑** |
| 이유 | KR1.1의 형상화->정형화 흐름을 해치지 않으면서 템플릿 워크플로우 정합성을 확보 가능 |
| 최소 규칙 | 1) 동일 `workflowStatusCategory` 우선 매핑 2) 없으면 템플릿 기본 상태(`isDefault`) 3) 그래도 없으면 `LEGACY_STATE_TO_STATUS_ID[currentState]` fallback |
| 예외 처리 | `workflowStatusId` 최종 검증 실패 시 `WORKFLOW_STATUS_MAPPING_REQUIRED`로 저장 차단 |

## 구현 체크포인트

| 레이어 | 변경 포인트 |
| --- | --- |
| API | 템플릿 적용/변경 시 상태 매핑 함수 추가 (`server.ts` 템플릿 patch 분기) |
| Shared | 워크플로우 상태 카테고리 기반 매핑 유틸 타입/함수 정리 |
| UI | Task 상세에 승인 단계/정책 재검토 필요 경고 표시, 이벤트 라벨(적용/교체/해제) 노출 |
| 분석 | 템플릿 변경 후 상태 매핑 성공률, 수동 보정률 지표 추가 |

## 수용 기준

| ID | 기준 | 판정 |
| --- | --- | --- |
| KR11-WF-01 | 템플릿 변경 시 유효하지 않은 `workflowStatusId`가 남지 않는다 | Pass/Fail |
| KR11-WF-02 | 사용자 진행 상태 의미(`DRAFT/IN_PROGRESS/DONE/CANCELED`)가 보존된다 | Pass/Fail |
| KR11-WF-03 | 매핑 결과가 타임라인/이벤트에서 추적 가능하다 | Pass/Fail |
| KR11-WF-04 | FREEFORM->TEMPLATED 전환 시 폼 초기화와 상태 매핑이 충돌하지 않는다 | Pass/Fail |

## 구현 반영 상태

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 카테고리 기반 안전 매핑 | 완료 | `apps/api/src/server.ts` |
| 최종 유효성 검증 및 오류 코드 | 완료 | `WORKFLOW_STATUS_MAPPING_REQUIRED` 검증 로직 |
| 정책 재검토 플래그 | 완료 | `policyReviewRequired`, `policyReviewReason` |
| 이벤트 추적성 | 완료 | `TEMPLATE_APPLIED/REPLACED/REMOVED` + 타임라인 payload |
