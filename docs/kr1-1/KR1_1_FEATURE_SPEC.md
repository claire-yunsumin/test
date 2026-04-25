# KR 1.1 기능 스펙 표

## 목적

| 항목 | 내용 |
| --- | --- |
| KR | KR 1.1 — OKR 구조와 Backlog가 Work Graph에 형상화·정형화되어 멘션으로 논의가 시작되는 상태 |
| Unmet Needs 해소 | 결정 대상의 불명확 해소 (가리킬 수 있는 구조적 대상 확보) |
| Hook 포지션 | Investment -> Variable Reward |
| 기본 루프 | 형상화 -> 정형화 -> 멘션 |

## 단계별 기능 스펙

| 단계 | 기능군 | 필수 기능 스펙 | 입력/행동 | 출력/결과 | 관련 영역 |
| --- | --- | --- | --- | --- | --- |
| 1 | 형상화 (Work Graph) | 자유 노드 생성, parent 연결, cycle 방지, 계층 맥락 유지 | 사용자가 Objective/KR/Task 노드 생성 및 관계 연결 | Work Graph에 지칭 가능한 결정 대상 생성 | Tasks View (list/board/backlog/graph), Task CRUD |
| 2 | 정형화 (Template) | Template 적용, `structureState` 전환(FREEFORM/TEMPLATED), `formValues` 필드키 초기화, inspection/workflow 활성화 | 반복/규칙이 필요한 노드에 Template 적용 | 산출물 구조/검수 기준/전이 기준 명확화 | Templates, Task Detail Form Output |
| 3 | 멘션 시작 | `@`/`#` 기반 멘션/참조, 서버 검증(`INVALID_MENTION`, `INVALID_NOTE_REFERENCE`) | 사용자가 노드/사람/필드/노트를 지칭해 논의 시작 | 대상 귀속 Thread 생성, 논의 시작점 명확화 | Thread Composer, Comment API |

## 기능 요구사항 (체크리스트)

| ID | 요구사항 | 수용 기준 |
| --- | --- | --- |
| KR11-F01 | 자유 형상화 지원 | 템플릿 없이도 노드 생성/수정/연결 가능 |
| KR11-F02 | 관계 무결성 보장 | 자기 자신/하위 descendant를 parent로 연결 시 차단 |
| KR11-F03 | 점진적 정형화 지원 | 형상화된 노드에 필요 시 Template 적용 가능 |
| KR11-F04 | Form Output 정합성 | Template 필드 정의와 호환되는 값만 저장 |
| KR11-F05 | 레거시 파일 필드 제거 | `__task_files`/`FILE` 타입 재유입 방지 |
| KR11-F06 | 멘션 유효성 검증 | 유효하지 않은 대상 지칭 시 저장 실패 및 오류 코드 반환 |
| KR11-F07 | 논의 시작 가능성 보장 | 멘션 기반 Thread 생성 및 맥락 유지 |

## 데이터/도메인 스펙

| 항목 | 스펙 |
| --- | --- |
| 구조 상태 | `FREEFORM`, `TEMPLATED` |
| 템플릿 연계 필드 | `templateId`, `templateType`, `formDefinition`, `inspectionCriteria`, `workflow`, `workflowSchema` |
| 관계 규칙 핵심 | parent chain 유효성, cycle 금지 |
| 멘션 타입 | MEMBER, TASK, FORM_FIELD, NOTE |
| 양방향 전환 원칙 | FREEFORM/TEMPLATED 전환은 단일 Task 모델에서 처리하며 협업 데이터(Thread/Timeline/Notes/Attachments)는 `taskId` 귀속으로 유지 |
| 상태/워크플로우 처리 | 결정본 정책(KR11-TP-v1)은 템플릿 변경 시 카테고리 기반 안전 매핑(B안)을 적용한다 |
| 정책/정합성 참고 | 상세 정책/예외/서버 검증 규칙은 `KR1_1_TRANSITION_POLICY_DECISION.md`를 기준으로 운영 |

## KPI 매핑 (KR 1.1)

| 목표 지표 | 계산 대상 |
| --- | --- |
| 형상화된 노드 수 | 생성된 노드 수, parent/related 연결 수 |
| 정형화 진행도 | Template 적용 노드 수, 활성 Form Output 필드 수 |
| 멘션 기반 논의 시작 | 노드 멘션 수, 멘션 기반 Thread 수 |
| 크로스펑셔널 논의 | 비개발·개발 참여 Thread 비율 |
| 피드백 반영 루프 | 피드백 이후 노드 수정 발생률 |

## 비범위 (KR 1.1)

| 항목 | 사유 |
| --- | --- |
| 승인 정책 세부 운영 | KR 1.2 범위 |
| 알람 분류/처리 운영 | KR 1.2 범위 |
| AI 생성/검수 | Objective 2 범위 |

## 하위 문서

| 문서 | 설명 |
| --- | --- |
| `KR1_1_IMPLEMENTATION_PLAN.md` | KR1.1 전환 정책 결정본을 실제 코드/UX/지표로 반영하기 위한 구현 실행 플랜 |
| `KR1_1_TRANSITION_POLICY_DECISION.md` | FREEFORM/TEMPLATED 전환 정책 결정본(예외 케이스, 서버 검증, 이벤트 스키마) |
| `KR1_1_WORKFLOW_STATE_POLICY_OPTIONS.md` | FREEFORM/TEMPLATED 전환 및 템플릿 변경 시 워크플로우 상태 처리 3안 비교 및 권장안 |
| `KR1_1_FREEFORM_TEMPLATE_BIDIRECTIONAL_FLOWS.md` | 자유 형상화 시작 후 템플릿 적용/저장/교체/해제까지 사용자 플로우 매트릭스 |

## 구현 완료/검증 동기화 (KR11-TP-v1)

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 상태 안전 매핑 (카테고리/기본 fallback) | 완료 | `apps/api/src/server.ts` 전환 매핑 로직 + `apps/api/src/security.test.ts` KR11-IT-01/02 |
| 정책 정합성 재검증 및 경고 가시화 | 완료 | `policyReviewRequired`, `policyReviewReason` 반영 (`packages/shared/src/index.ts`, `TaskDetailPage.tsx`) + KR11-IT-03 |
| 전환 이벤트 구분 추적 | 완료 | `TEMPLATE_APPLIED/REPLACED/REMOVED` 타입/라벨 반영 (`packages/shared/src/index.ts`, `apps/web/src/lib/domain.ts`) + KR11-IT-05 |
| 템플릿 해제 시 협업 데이터 연속성 | 완료 | 템플릿 해제 후 `taskId` 귀속 데이터 유지 정책 구현 + KR11-IT-04 |
| 지표 운영 연동 | 완료 | `templateStatusMappingSuccessRate`, `templateManualAdjustmentRate` 계산/노출 (`apps/api/src/domain/store.ts`, `AnalyticsPage.tsx`) |

검증 메모:
- API 테스트: `npm run test -w apps/api` 통과 (35 passed / 0 failed)
