# KR1.1 Team Dev Closure Plan

## 문서 목적

이 문서는 `work/test` 시뮬레이션 구현을 실제 팀 프로젝트 `SelvasIn4` dev 브랜치에 적용할 때, KR1.1을 확실히 닫기 위해 먼저 규정해야 할 우선순위와 하위 태스크를 정리합니다.

중요한 전제는 다음과 같습니다.

- `work/test`는 목표 도메인 모델을 검증한 시뮬레이션 구현입니다.
- 실제 팀 프로젝트는 Spring Boot + MyBatis 백엔드와 React/Vite 프론트엔드로 구현 중입니다.
- 목표 OKR은 동일하지만, 실제 dev에는 이미 `TaskTemplate` 버저닝, Form Builder, Workflow Builder, Thread, Inbox, Timeline이 존재합니다.
- 따라서 시뮬레이션 코드를 그대로 옮기는 것이 아니라, 실제 dev의 릴리즈 스펙과 구현 상태에 맞춰 KR1.1 종료 조건을 재정의해야 합니다.

## KR1.1 종료 정의

KR1.1은 화면 리팩터링이나 태스크 상세 UI 개선으로 닫히지 않습니다.

KR1.1을 닫았다고 말하려면 다음 문장이 코드와 문서에서 동시에 참이어야 합니다.

> 반정형 Task가 title만으로 생성되고, Default Template 또는 선택 Template으로 정형화되며, 이후 Template 변경에도 기존 Task Instance의 Form/Workflow 의미가 흔들리지 않는다.

즉 핵심은 세 가지입니다.

1. Task 생성 시작점이 가볍다.
2. Task Instance가 어떤 TemplateVersion을 기준으로 해석되는지 고정된다.
3. Template 적용/교체/Workflow 전이 정책이 문서와 테스트로 닫힌다.

## 최우선 의사결정

### P0-0. `dennis-task-v2-poc` 위치 결정

현재 실제 dev에는 `dennis-task-v2-poc` 브랜치가 있고, "Task-Centric v2 아키텍처"와 "폼빌더 기반 Task 생성/편집" 실험이 진행 중입니다.

이 브랜치의 위치를 정하지 않으면 KR1.1 문서와 구현이 두 갈래로 갈라집니다.

권장 결정:

`dennis-task-v2-poc`는 KR1.1 이후 v2 실험으로 분류합니다.

이유:

- Release Spec 1차에는 이미 구현 범위가 정의되어 있습니다.
- 현재 KR1.1의 미해결 항목은 Instance Isolation, 인라인 생성, Template 적용/교체 정책입니다.
- v2 POC를 KR1.1에 섞으면 종료 조건이 다시 흔들립니다.

하위 태스크:

| ID | 태스크 | 산출물 |
| --- | --- | --- |
| `SPEC-KR11-00` | `dennis-task-v2-poc`의 1차/2차 분류 결정 | 회의 결정 기록 |
| `SPEC-KR11-01` | KR1.1 Closure Contract 작성 | `kr1-1-closure-contract` 문서 |
| `SPEC-KR11-02` | `release-spec-1.md`에 KR1.1 필수/비필수 범위 반영 | Release Spec 개정 |

## P0. Instance Isolation / TemplateVersion 고정

실제 dev에서 KR1.1을 닫는 가장 중요한 축입니다.

현재 리포트 기준 리스크는 `#119`입니다.

> TL-009 / TPL-034: Instance는 생성 시점 Template 버전을 영구적으로 따른다.

이 규칙이 닫히지 않으면, Template 수정 시 기존 Task의 Form/Workflow 해석이 바뀔 수 있습니다. 그러면 KR1.1의 정형화 모델은 운영 데이터 위에서 무너집니다.

실제 dev에는 이미 `tasktemplate` 버저닝 개념이 있으므로, `work/test`의 embedded snapshot 방식보다 VersionRef 방식이 자연스럽습니다.

권장 규칙:

- Task 생성 또는 Template 적용 시 `templateVersionId`를 저장합니다.
- Task 조회/편집/전이는 현재 Template이 아니라 Task의 `templateVersionId` 기준으로 해석합니다.
- Template 수정은 새 TemplateVersion을 만들고, 기존 Task Instance를 자동 변형하지 않습니다.
- 과거 TemplateVersion 기반 Task의 Form/Workflow 편집 가능 범위는 별도 정책으로 제한합니다.

하위 태스크:

| ID | 영역 | 태스크 | 완료 기준 |
| --- | --- | --- | --- |
| `BE-KR11-01` | BE | Task 생성 시 `templateVersionId` 저장 강제 | 신규 Task row에 TemplateVersion 참조 존재 |
| `BE-KR11-02` | BE | Task 조회/편집 시 `templateVersionId` 기준 Form/Workflow 해석 | 현재 Template 변경 후에도 기존 Task 해석 불변 |
| `BE-KR11-03` | BE | 과거 TemplateVersion 기반 Task의 편집 제한 또는 migration policy 정의 | 과거 버전 편집 정책 문서/코드 일치 |
| `DB-KR11-01` | DB | TaskInstance -> TaskTemplateVersion FK 확인/보강 | FK 또는 동등 무결성 검증 존재 |
| `TEST-KR11-01` | Test | Template v2 수정 후 기존 Task가 v1 Form/Workflow 유지 | BE 단위 테스트 통과 |

## P0. Default Template 반정형 생성 경로 고정

KR1.1의 시작점은 "title만으로 Task가 생기는가"입니다.

현재 실제 dev는 `/tasks/new` 풀 폼 경로는 있으나, Release Spec의 핵심 UX인 인라인 생성 `title + Enter`가 미구현 상태로 보입니다.

권장 규칙:

- Task 리스트에서 제목만 입력해 즉시 Task를 만들 수 있어야 합니다.
- 생성된 Task에는 Default Template v1.0.0 또는 명시된 TemplateVersion이 연결되어야 합니다.
- 생성 직후 사용자는 Form Builder 전체를 마주하는 것이 아니라, 반정형 Task가 만들어졌다는 피드백을 받아야 합니다.

하위 태스크:

| ID | 영역 | 태스크 | 완료 기준 |
| --- | --- | --- | --- |
| `FE-KR11-01` | FE | Task 리스트 인라인 생성 `title + Enter` 구현 | 리스트에서 즉시 Task 생성 가능 |
| `FE-KR11-02` | FE | 생성 직후 Default Template 적용 상태 표시 | 사용자가 정형화 상태를 인지 |
| `BE-KR11-04` | BE | title-only Task create API 입력 규칙 확정 | title만으로 생성 가능, 필수 컨텍스트 검증 |
| `BE-KR11-05` | BE | Unit/List/Parent/Default Template 적용 규칙 고정 | 생성 위치와 TemplateVersion 일관 |
| `TEST-KR11-02` | Test | title-only 생성 -> Default TemplateVersion 연결 검증 | API/E2E 테스트 통과 |

## P0. Template 적용 / 교체 정책 확정

Template 적용과 교체는 KR1.1에서 가장 사고가 많이 나는 지점입니다.

정책이 없으면 기존 Form 값, 사라진 field, 새 field, Workflow status가 구현자마다 다르게 처리됩니다.

권장 규칙:

- 같은 field key의 기존 `formValues`는 보존합니다.
- 새 field는 기본값 또는 빈값으로 추가합니다.
- 사라진 field는 즉시 삭제하지 않고 archived/read-only snapshot 보존 여부를 결정합니다.
- Workflow status는 category 기준으로 안전 매핑합니다.
- 매핑 불가 시 저장 차단 또는 `review required` 상태를 표시합니다.

하위 태스크:

| ID | 영역 | 태스크 | 완료 기준 |
| --- | --- | --- | --- |
| `SPEC-KR11-03` | Spec | Template 적용/교체 상태 매핑 정책 작성 | Release Spec 하위 결정 문서 존재 |
| `BE-KR11-06` | BE | Workflow status category 매핑 구현/검증 | 매핑 성공/실패 케이스 처리 |
| `BE-KR11-07` | BE | Form field key 보존/추가/삭제 정책 구현 | 기존 값 보존 규칙 테스트 통과 |
| `FE-KR11-03` | FE | Template 교체 시 변경 요약/경고 UI | 사용자가 영향 범위 확인 가능 |
| `TEST-KR11-03` | Test | Template 교체 후 Form 값 보존 테스트 | BE/FE 회귀 통과 |
| `TEST-KR11-04` | Test | Workflow status 매핑 실패 테스트 | 실패 시 저장 차단 또는 review required |

## P1. Workflow / Transition 최소 권한과 상태 규칙

현재 실제 dev의 `#93`은 EX-003 전체 오픈 정책으로 회피 중입니다.

다만 KR1.1을 닫는 기준에서는 모든 보안 이슈를 포함할 필요는 없고, Task 실행 모델에 직접 닿는 최소 전이 규칙만 정리하는 것이 적절합니다.

권장 규칙:

- 상태 전이는 reason을 필수로 유지합니다.
- 담당자, 관리자, 슈퍼관리자 등 최소 전이 권한을 문서화합니다.
- EX-003 전체 오픈을 유지한다면, 그것이 임시 예외임을 명시합니다.

하위 태스크:

| ID | 영역 | 태스크 | 완료 기준 |
| --- | --- | --- | --- |
| `SPEC-KR11-04` | Spec | KR1.1 상태 전이 최소 권한 정의 | EX-003 예외와 실제 목표 구분 |
| `BE-KR11-08` | BE | 담당자/Admin/SuperAdmin 전이 권한 적용 여부 결정 | 정책과 코드 일치 |
| `BE-KR11-09` | BE | transition reason 필수 유지 | 누락 요청 차단 |
| `TEST-KR11-05` | Test | 권한 없는 사용자 상태 전이 차단 테스트 | 단위 테스트 통과 |

## P1. 테스트 안전망 복구

리포트 기준 실제 dev의 FE 단위 테스트는 0개입니다. KR1.1은 상태 계산, Form field 매핑, Template 교체 경고처럼 UI 로직이 많기 때문에 E2E만으로는 회귀를 빠르게 잡기 어렵습니다.

권장 복구 우선순위:

| ID | 영역 | 태스크 | 완료 기준 |
| --- | --- | --- | --- |
| `TEST-FE-KR11-01` | FE Test | form field filtering/normalization 테스트 복구 | vitest 단위 테스트 존재 |
| `TEST-FE-KR11-02` | FE Test | hierarchy parent/depth utility 테스트 복구 | parent/depth 회귀 검출 |
| `TEST-FE-KR11-03` | FE Test | inline create 상태 reducer 또는 hook 테스트 | title-only 생성 UI 로직 검증 |
| `TEST-FE-KR11-04` | FE Test | Template 교체 warning/mapping UI 테스트 | 영향 경고 UI 검증 |
| `TEST-E2E-KR11-01` | E2E | title-only 생성 -> Template 적용 -> Thread 작성 -> Timeline 확인 | KR1.1 핵심 루프 E2E 통과 |

## P1. 문서 구조

실제 팀 프로젝트에서는 큰 문서 하나에 모든 결정을 넣기보다, Release Spec 아래 KR1.1 하위 결정 문서를 두는 편이 좋습니다.

권장 문서 구조:

```text
docs/release/release-spec-1.md
docs/release/kr1-1-closure-contract.md
docs/release/kr1-1-task-breakdown.md
docs/release/kr1-1-template-instance-isolation.md
docs/release/kr1-1-template-transition-policy.md
```

문서 역할:

| 문서 | 역할 |
| --- | --- |
| `kr1-1-closure-contract.md` | KR1.1이 닫혔다고 말할 수 있는 조건 |
| `kr1-1-task-breakdown.md` | BE/FE/DB/Test 단위 태스크 |
| `kr1-1-template-instance-isolation.md` | TemplateVersion과 TaskInstance 규칙 |
| `kr1-1-template-transition-policy.md` | Template 적용/교체/Workflow 상태 매핑 규칙 |

## P2. Release Readiness로 분리할 항목

다음 항목은 중요하지만 KR1.1 자체에 섞으면 범위가 커집니다. 별도 Release Readiness 트랙으로 관리합니다.

| 항목 | 이유 | 권장 분류 |
| --- | --- | --- |
| dev -> main 659 커밋 격차 | 배포 경로 리스크 | Release Ops |
| `#85` JWT Secret | 실사용 전 보안 필수 | Security Readiness |
| PR 리뷰 없는 직접 머지 | 품질 게이트 부재 | Process |
| stale issue 28건 | 운영 백로그 관리 | Triage |
| FCM/Firebase key 노출 가능성 | 보안/운영 위험 | Security Readiness |

## 실행 순서

권장 순서는 다음과 같습니다.

1. `dennis-task-v2-poc`를 KR1.1 범위 밖인지 안인지 결정합니다.
2. KR1.1 Closure Contract를 작성합니다.
3. Instance Isolation / TemplateVersionRef를 P0로 승격합니다.
4. title-only / inline Task 생성 경로를 P0로 구현합니다.
5. Template 적용/교체 정책을 확정합니다.
6. Workflow transition 최소 권한과 테스트를 정리합니다.
7. FE 단위 테스트를 복구합니다.
8. dev-main 머지, JWT Secret, 리뷰 프로세스는 Release Readiness 트랙으로 별도 관리합니다.

## 최종 판단

실제 dev에서 KR1.1을 닫는 첫 단추는 Task 생성 화면을 예쁘게 고치는 것이 아닙니다.

가장 먼저 닫아야 할 것은 다음 질문입니다.

> Task Instance는 어떤 TemplateVersion을 기준으로 영원히 해석되는가?

이 질문의 답이 릴리즈 스펙, DB 모델, 백엔드 서비스, 프론트 표시, 테스트에서 모두 같아졌을 때 KR1.1의 중심축이 닫힙니다.

그 다음에 title-only 생성, Template 교체 정책, 상태 전이 최소 권한, 테스트 안전망을 닫아야 합니다.
