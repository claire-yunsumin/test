# KR 1.1 결정본 — FREEFORM/TEMPLATED 전환 정책

## 정책 결정

| 항목 | 결정 |
| --- | --- |
| 정책 버전 | KR11-TP-v1 |
| 최종안 | **B안(안전 매핑)** 채택 |
| 적용 범위 | FREEFORM -> TEMPLATED, TEMPLATED -> FREEFORM, 템플릿 A -> B 교체 |
| 목표 | 형상화의 연속성을 보존하면서 템플릿 워크플로우/승인정책 정합성을 확보 |

## 핵심 정책 문안

| ID | 정책 문안 |
| --- | --- |
| TP-01 | 전환 시 Thread/Timeline/Notes/Attachments는 항상 `taskId` 귀속으로 보존한다. |
| TP-02 | 템플릿 적용/교체 시 상태는 **카테고리 매핑**으로 정합화한다. (`OPEN/IN_PROGRESS/PENDING_APPROVAL/DONE/CANCELED`) |
| TP-03 | 카테고리 매핑 실패 시 템플릿 기본 상태(`isDefault`)를 사용한다. |
| TP-04 | 기본 상태도 없으면 `LEGACY_STATE_TO_STATUS_ID[currentState]`로 fallback한다. |
| TP-05 | `workflowStatusId`가 최종적으로 새 템플릿 상태셋에 없으면 저장을 차단하고 `WORKFLOW_STATUS_MAPPING_REQUIRED`를 반환한다. |
| TP-06 | 템플릿 교체 시 승인정책(`approvalPolicyId`)은 자동 재선정하지 않고 **유효성 재검증**만 수행한다. |
| TP-07 | 승인정책이 새 전이 게이트와 불일치하면 저장은 허용하되 태스크에 `정책 재검토 필요` 경고 상태를 남긴다. |
| TP-08 | 템플릿 적용/교체/해제는 구분 가능한 이벤트 타입으로 타임라인에 기록한다. |

## 예외 케이스 정책

| 케이스 | 처리 규칙 | 사용자 피드백 |
| --- | --- | --- |
| 새 템플릿에 기존 상태 카테고리가 없음 | `isDefault`로 매핑 | "상태가 기본값으로 매핑됨" 배지/토스트 |
| `isDefault`도 없음 | legacy fallback 시도 후 실패 시 저장 차단 | "워크플로우 매핑 필요" 모달 |
| 승인정책이 비활성/삭제됨 | `approvalPolicyId` 유지 금지, null 처리 | "승인정책이 비활성화되어 해제됨" 알림 |
| 승인게이트 on + 정책 미지정 | 저장 허용, 전이 시점 차단 | "승인 게이트 정책 미지정" 경고 |
| 템플릿 해제(TEMPLATED -> FREEFORM) | 상태는 마지막 유효 상태 유지 | "자유폼으로 전환, 상태 유지" 안내 |
| 템플릿 교체 직후 pending 상태 불일치 | 카테고리 매핑 후 pending 여부 재평가 | "승인 대기 상태 재평가됨" 안내 |

## 서버 검증 규칙 (API 계약)

| 규칙 ID | 검증 위치 | 검증 내용 | 실패 코드 |
| --- | --- | --- | --- |
| SV-01 | `PATCH /api/tasks/:taskId` | `templateId` 유효성(존재/활성) | `INVALID_TEMPLATE` |
| SV-02 | `PATCH /api/tasks/:taskId` | 전환 후 `workflowStatusId`가 대상 템플릿 상태셋에 포함되는지 | `WORKFLOW_STATUS_MAPPING_REQUIRED` |
| SV-03 | `PATCH /api/tasks/:taskId` | `approvalPolicyId` 유효성(존재/활성) | `INVALID_APPROVAL_POLICY` |
| SV-04 | `POST /api/tasks/:taskId/transition` | 승인게이트 on 상태에서 정책/승인자 조건 충족 | `APPROVAL_POLICY_REQUIRED` / `NOT_POLICY_APPROVER` |
| SV-05 | `PATCH /api/tasks/:taskId` | 전환 이벤트 타입 기록(적용/교체/해제) | `VALIDATION_ERROR` |

## 타임라인 이벤트 스키마

| 이벤트 타입 | 발생 시점 | 최소 payload |
| --- | --- | --- |
| `TEMPLATE_APPLIED` | FREEFORM -> TEMPLATED | `fromTemplateId`, `toTemplateId`, `statusMapping` |
| `TEMPLATE_REPLACED` | TEMPLATED A -> B | `fromTemplateId`, `toTemplateId`, `statusMapping`, `policyValidation` |
| `TEMPLATE_REMOVED` | TEMPLATED -> FREEFORM | `fromTemplateId`, `toTemplateId:null`, `statusPreserved:true` |

## 수용 기준

| ID | 기준 |
| --- | --- |
| TP-AC-01 | 템플릿 변경 후 유효하지 않은 `workflowStatusId`가 남지 않는다. |
| TP-AC-02 | 협업 데이터(Thread/Timeline/Notes/Attachments)가 전환 전후 동일 `taskId`로 유지된다. |
| TP-AC-03 | 승인정책 불일치가 사용자에게 명시적으로 노출되고 전이 시점에 안전하게 차단된다. |
| TP-AC-04 | 적용/교체/해제 이벤트를 타임라인에서 구분 조회할 수 있다. |
