# SelvasIn4 — HWE MVP
## Release 2 & 3 통합 스펙 — RFP + PRD

> **결정 워크스페이스로의 전환**
>
> 작성: Orchestration Lab · 버전 1.0 · 2026-04-23
>
> OKR v3.2 / Design Goals v7.1 정렬

> 참고: 이 문서는 Release 2/3 기획 원문입니다. 현재 코드와 동기화된 구현 기준 문서는 `docs/` 하위 문서를 기준으로 봅니다.


## 목차

**PART 1. RFP — 사업 배경과 요청 범위**
- [1. Executive Summary](#1-executive-summary)
- [2. 사업 배경](#2-사업-배경)
- [3. 요청 범위](#3-요청-범위)
- [4. 제약과 의존성](#4-제약과-의존성)
- [5. 성공 기준](#5-성공-기준)

**PART 2. PRD — 제품 상세 요구사항**
- [6. 사이트맵 & 정보 구조 (IA)](#6-사이트맵--정보-구조-ia)
- [7. 핵심 엔티티 모델](#7-핵심-엔티티-모델)
- [8. 상세 기능 요구사항](#8-상세-기능-요구사항)
  - [8.1 계층 뷰 (/hierarchy)](#81-계층-뷰-hierarchy--release-2)
  - [8.2 Task Detail — 결정 워크스페이스](#82-task-detail--결정-워크스페이스-tasksid)
  - [8.3 Task · Task Template CRUD](#83-task--task-template-crud)
  - [8.4 RBAC](#84-rbac-역할-기반-접근-제어)
  - [8.5 Inbox & 알림](#85-inbox--알림)
  - [8.6 관리·설정 요소](#86-관리설정-요소)
- [9. 사용자 여정](#9-사용자-여정-user-journeys)
- [10. 파일럿 계획](#10-파일럿-계획-release-2와-3-사이)
- [11. 로드맵 & 스프린트](#11-로드맵--스프린트)
- [12. 비기능 요구사항](#12-비기능-요구사항)
- [13. Release 별 최종 수용 기준](#13-release-별-최종-수용-기준)
- [14. 부록](#14-부록)


---


# PART 1. RFP — 사업 배경과 요청 범위


## 1. Executive Summary

SelvasIn4의 HWE MVP는 개발부서와 비개발부서가 전략적 의사결정을 함께 내리는 과정에서 발생하는 구조적 단절을 해소하기 위한 제품이다. Release 1에서 태스크·템플릿·워크플로우의 기반 구현을 완료했으나, 현재 코드는 "실행 아이템(Task Execution)" 모델에 머물러 있어 OKR v3.2에서 정의한 "결정 워크스페이스(Decision Workspace)" 모델로의 전환이 필요하다.

본 RFP+PRD는 Release 2와 Release 3에서 이 전환을 완료하기 위한 요구사항을 정의한다. 핵심 전환은 세 축이다:

- **(1) 계층(Hierarchy) 가시화** — 결정 대상이 "구조로 드러나는" 상태 확보
- **(2) 결정 메타데이터 확립** — 상태전이·Timeline·Inbox가 "결정 행위"를 1급으로 표현
- **(3) Notes·Thread 이원 논의 구조 파일럿 검증** — 문서형 논의와 대화형 논의의 분리·연결 모델

총 개발 기간은 **Release 2 (5주) + 파일럿 (4주) + Release 3 (5주) = 14주**이며, 이후 Retention 관측 기간 6주를 포함하면 Objective 1 판정까지 약 **20주**가 소요된다.


## 2. 사업 배경


### 2.1 해결하려는 문제 (Unmet Needs)

하네스엔지니어링(개발부서)이 비개발부서(마케팅·영업·기획·경영진)와 전략적 의사결정을 내리는 과정에서 다음 네 가지 단절이 반복된다:

- **결정 대상의 불명확** — 전략·로드맵·백로그가 구조화되지 않아 회의 시작 시 "오늘 뭘 결정하지?"부터 합의 필요
- **논의-결정 흐름 단절** — 논의는 메신저·이메일·구두로 흩어지고 결정 결과는 별도로 전달되어 사후 추적 불가
- **AI 활용 불가** — Task 산출물에 AI를 활용할 수단이 없어 Notes 작성·검수·질의를 수작업 (Release 3 이후 범위)
- **변경 전파 부재** — 상위 전략 변경 시 하위 실행 항목에 영향이 전파되지 않아 기존 기준으로 실행 지속


### 2.2 현재 상태 (Release 1)

Release 1 코드베이스 감사 결과 다음이 확인됨:

| 영역 | 상태 | 판정 |
|---|---|---|
| Template type(5단계) 선언 | ✅ 구현됨 (VISION/AXIS/OBJECTIVE/KEYRESULT/TASK) | hierarchy_meaning 대행 |
| Workflow 상태머신 | ✅ 구현됨 (Phase 4단계 × N State × Transition) | 결정 전이 메타 부재 |
| Timeline 스냅샷 기록 | ✅ 구현됨 (전체 Task 스냅샷) | decision_type·reason 부재 |
| Inbox 이벤트 파이프라인 | ⚠️ 부분 (STATE_CHANGE만 실제 발행) | FE/BE enum 미스매치 |
| 계층 뷰 진입점 | ❌ 없음 | Task 목록만 존재 |
| Task Detail 라우트 | ❌ 없음 (Edit로 통합) | 결정 워크스페이스 부재 |
| Notes 엔티티 | ❌ 없음 (formValues로 흡수) | 노이즈 분리 실패 |
| RBAC 역할 분기 | ❌ 없음 (작성자 가드만) | 크로스펑셔널 차단 |
| AI Context 스키마 | ❌ 없음 | Release 3 이후 범위 |


### 2.3 전환 목표 (Release 2 + 3)

Release 1의 "실행 아이템 모델"을 "결정 워크스페이스 모델"로 전환한다. 전환 완료 상태는 다음과 같다:

- 결정 대상(Task)이 계층 구조로 가시화되어 비개발부서가 "이 KR에 대해 논의하자"고 지칭 가능
- 논의 자료(Notes)·대화(Thread)·산출물(Form Output)·감사 로그(Timeline)가 결정 대상에 귀속되어 동일 화면에서 조망
- 상태전이가 "결정 행위"로 인식되어 decision_type·reason·참조 Notes가 Timeline에 보존
- Inbox 4탭(DECISION/DISCUSSION/AWARENESS/RESULT)이 실데이터로 작동하여 알림이 성격별로 분류
- RBAC 3역할(뷰어/편집자/승인자)로 비개발부서가 안전하게 참여하고 승인권자가 명확히 구별


## 3. 요청 범위


### 3.1 포함 범위

**Release 2 (5주)**
- 계층 뷰 (`/hierarchy`) 신설 — 트리 기반 Objective→KR→Task 탐색
- Task Detail 라우트 (`/tasks/:id`) 분리 — Edit와 별도
- 상태전이 DTO 확장 (reason, decision_type, referencedNoteIds) + 사유 입력 모달
- Inbox FE/BE enum 통일 + 4탭 실데이터 연결
- RBAC 뷰어 역할 도입 + 비개발부서 초대 플로우
- LastSeenAt 추적 + Task 진입 시 상위 변경 배너 (Pull 재확인)

**파일럿 (4주, Release 2~3 사이)**
- Notes 엔티티 최소 구현 + 시스템 섹션 아코디언 UI
- Thread 확장 — `#NoteName` 호출 자동완성 + 참조 추적
- 관측 이벤트 로깅 + 판정 대시보드
- 실사용자 4~6명 파일럿 4주 수행 + 회고 인터뷰

**Release 3 (5주)**
- 승인자 RBAC 역할 추가 + 권한 가드
- Template 메타 확장 (Transition의 is_decision 플래그)
- DECISION 이벤트 발행 파이프라인
- Task Detail의 Notes·Thread·Form Output·Timeline 4구역 통합 배치 (파일럿 결과 반영)
- `#`참조 → Notes 수정 시 원 코멘트 작성자 알림 (Variable Reward 자동화)
- Retention 관측 대시보드


### 3.2 제외 범위

다음 항목은 MVP 2 또는 MVP 3+ 범위로 분리되며 본 문서에 포함되지 않는다:

- AI 산출물 생성·검증 기능 (MVP 2 · OKR O2)
- Template AI Context 스키마 전체 설계 (MVP 2 · 본 문서에서는 확장 가능한 자리만 확보)
- Template Library 카탈로그 및 Import 메커니즘 (MVP 3+)
- 다관점 뷰 (개인·Unit·전략·전사) (MVP 3+)
- 외부 AI 도구 양방향 동기화 (MVP 3+)
- Custom Hierarchy Schema (BSC, Hoshin Kanri 등 OKR 외 프레임워크) (MVP 3+)
- 기여도 추적 (evaluation_target 기반) (MVP 3+)


## 4. 제약과 의존성


### 4.1 기술 스택 제약

- 프론트엔드: React 19 + Tailwind + shadcn/ui (변경 없음)
- 백엔드: Spring Boot + Java + MyBatis (변경 없음)
- DB 마이그레이션: 기존 formValues 데이터는 보존. Notes는 신규 엔티티로 추가 (기존 데이터 이주는 옵트인)


### 4.2 의존성

- Release 2의 모든 항목은 Release 1 Workflow 상태머신에 의존
- 파일럿의 모든 항목은 Release 2 완료 후 시작 가능 (뷰어 RBAC, Task Detail 라우트 전제)
- Release 3의 DECISION 이벤트 파이프라인은 파일럿 결과 확정 후 설계 가능


### 4.3 리스크

| 리스크 | 영향 | 완화 전략 |
|---|---|---|
| 파일럿 결과가 가설과 불일치 | Release 3 설계 재조정 필요 (Thread+# 구조 폐기 가능성) | 판정 기준 사전 합의 · 대안 설계(단일 공간 Notes) 미리 준비 |
| Notes 마이그레이션 복잡도 | 기존 Task의 formValues 중 논의 성격 데이터 분리 어려움 | 신규 Task부터 Notes 적용 · 기존 데이터는 옵트인 이주 버튼 제공 |
| 비개발부서 어댑션 실패 | 크로스펑셔널 목표 미달성 → Objective 1 판정 불가 | 뷰어 초대 플로우를 R2 W5에 완성 후 즉시 도입 시작 |
| RBAC 설계 변경이 기존 기능 영향 | 기존 Unit 멤버십 체크 로직과 충돌 가능 | Feature flag로 점진 전환 · R2 W5에 집중 테스트 |
| Retention 기준선 미정 | 달성 판정 기준 모호 | R2 W1에 기획 차원 정의 작업 병행 |


## 5. 성공 기준

각 Release 종료 시 달성되어야 하는 상태:


### 5.1 Release 2 종료 시

- KR 1.1의 Unmet Needs 해소 기준 1, 2, 3 달성 (계층 가시화 + hierarchy_meaning 노출 + 크로스펑셔널 지칭 가능)
- KR 1.2의 기준 2, 3, 4 달성 (Thread 귀속 + Timeline 결정 근거 기록 + 전략-백로그 계층 관리)
- Inbox 4탭 전 이벤트 정상 유입 (DECISION 탭은 일부 이벤트만)
- 비개발부서 1명 이상이 뷰어로 초대되어 Task 열람 완료


### 5.2 파일럿 종료 시

- 하네스엔지니어링 4~6명 실사용자 확보 및 4주 사용 완주
- 6개 관측 지표 전량 수집 완료
- 시나리오 A/B/C 중 어느 쪽인지 판정 가능 (사전 합의된 기준으로)
- Release 3 구현 방향 확정 (Notes+Thread 이원 유지 vs 단일 공간 전환 vs 레벨별 하이브리드)


### 5.3 Release 3 종료 시

- KR 1.1 + KR 1.2의 모든 Unmet Needs 해소 기준 달성
- Hook 루프 4단계 작동 — Investment, Trigger, Action, Variable Reward
- Retention 관측 대시보드 데이터 수집 시작
- DECISION 이벤트 파이프라인 전량 실데이터 작동


### 5.4 Objective 1 판정 (Release 3 + 6주)

- 주간 자발적 재방문율 사전 정의된 기준선 이상 (R2 W1에 기준선 확정)
- Notes·Thread가 주당 일정 횟수 이상 자발적 편집
- 비개발부서의 Notes·Thread 편집 비율이 전체의 30% 이상
- 결정 대상이 구조화되는 행위(노드 생성·수정)가 주 단위로 지속


---


# PART 2. PRD — 제품 상세 요구사항


## 6. 사이트맵 & 정보 구조 (IA)


### 6.1 전체 사이트맵

Release 3 완료 시점의 최종 사이트맵. ★ 표시는 Release 3에서 완성되는 항목.

```
🌐 Public (비인증)
  /login                          로그인 (SSO 지원)
  /auth/callback                  OAuth 콜백
  /invitations/accept             초대 수락 (뷰어·편집자·승인자 구분)

🔒 Authenticated
  /units                          Unit 선택 (AppLayout 밖)

🏢 Unit 소속 (UnitGuard + AppLayout)
  /                               → /hierarchy 리다이렉트 (기본 홈 전환)

  📍 Hierarchy (신설)
    /hierarchy                    전략 계층 트리 뷰
    /hierarchy/:nodeId            노드 중심 뷰 (상위/하위/related)

  📥 Inbox
    /inbox                        기본: DECISION 탭
    /inbox/decision               결정 필요 (승인·반려·보완 요청) ★
    /inbox/discussion             응답 필요 (멘션·코멘트·Notes 업데이트) ★
    /inbox/awareness              인지 (담당 지정·상태 변경·마감 임박)
    /inbox/result                 읽고 끝 (완료·취소)

  📋 Tasks
    /tasks                        태스크 목록 (필터·그룹바이)
    /tasks/new                    태스크 생성
    /tasks/:id                    결정 워크스페이스 (신설 — 기본 진입)
    /tasks/:id/edit               편집 모드 (Form Output 작성)
    /tasks/:id/timeline           전체 Timeline (감사용)

  📐 Templates (편집자·관리자)
    /templates                    템플릿 관리
    /templates/new                템플릿 생성
    /templates/:id                템플릿 상세
    /templates/:id/workflow       Workflow 편집
    /templates/:id/ai-context     AI Context 확장 자리 ★ (MVP 2 대비)

  💬 Feedback (관리자)
    /feedbacks                    피드백 관리

  ⚙️ Admin
    /admin                        관리자 홈 (대시보드)
    /admin/members                멤버·역할 관리 (RBAC)
    /admin/roles                  역할 정의 (뷰어·편집자·승인자)
    /admin/permissions            권한 정책 (Template/Task 레벨)
    /admin/audit                  감사 로그 (전사 Timeline)
    /admin/analytics              Retention·활동 대시보드 ★

  🔧 Unit Settings
    /units/:id/settings           Unit 설정
    /units/:id/integrations       외부 연동 (MVP 3+)

  👤 User (우상단 아바타)
    /me/profile                   프로필
    /me/notifications             알림 환경설정
    /me/preferences               테마·언어
```


### 6.2 IA 변경 요약 (Release 1 → Release 3)

| 영역 | Release 1 | Release 3 | 변화 성격 |
|---|---|---|---|
| 기본 홈 | /tasks | /hierarchy | "실행 아이템"→"결정 대상"으로 진입 전환 |
| Task Detail | 없음 (edit 통합) | /tasks/:id 독립 | 결정 워크스페이스로 승격 |
| Inbox 탭 | 3종 (BE 기준) | 4탭 (DECISION/DISCUSSION/AWARENESS/RESULT) | Alarm v2 분류 |
| Templates 하위 | 상세만 | 상세+Workflow+AI Context | 방법론 자산화 |
| Admin | Unit Settings 하나 | 멤버·역할·권한·감사·분석 분리 | 조직 관리 1급화 |
| User 영역 | 없음 | 프로필·알림·테마 | 개인화 진입점 |


### 6.3 네비게이션 위계

왼쪽 사이드바에 고정되는 Global Navigation 순서:

1. **Hierarchy** (🏗️) — 기본 홈, 결정 대상 구조 조망
2. **Inbox** (📥) — 4탭 분류, 배지로 미확인 건수 표시
3. **Tasks** (📋) — 실행 관점 목록, 필터·검색 중심
4. **Templates** (📐) — 편집자 이상 가시
5. **Admin** (⚙️) — 관리자만 가시

상단 Shell Bar (전역 헤더):

- Unit 전환기 (여러 Unit 소속 시)
- Global Search (⌘K) — Task·Template·Notes 통합 검색
- Inbox 요약 배지 (탭별 건수)
- 사용자 메뉴 (우상단 아바타) — 프로필·설정·로그아웃


## 7. 핵심 엔티티 모델


### 7.1 엔티티 관계도

```
Unit
  └─ Member ──┬── Role (VIEWER | EDITOR | APPROVER | ADMIN)
              └─ RoleGrant (scope: Unit | Template | Task)

TaskTemplate ──┬── Workflow ──┬── State
               │              └── Transition (is_decision, decision_type)
               ├── FormDefinition ── FormField
               └── type (VISION | AXIS | OBJECTIVE | KEYRESULT | TASK)

Task ──┬── Template (FK)
       ├── parentId (self-ref, 계층)
       ├── formValues (JSON, 구조화 산출물)
       ├── currentState (FK to WorkflowState)
       ├── assignees (N:M)
       ├── watchers (N:M)                          [신설]
       ├── Notes (1:N)                             [신설]
       ├── Thread (1:N) ── Comment (N, with #refs) [확장]
       └── TimelineEvent (1:N, with decision_type) [확장]

Notes
  ├── taskId
  ├── title         (아코디언 헤더, # 호출 자동완성 키)
  ├── content       (Rich Text JSON)
  ├── attachments   (FK to File, N)
  ├── authorId
  └── updatedAt

ThreadComment
  ├── threadId (Task 1:1 Thread 전제)
  ├── authorId
  ├── content
  ├── referencedNoteIds (배열, # 호출 추적)        [신설]
  └── createdAt

TimelineEvent
  ├── taskId
  ├── type           (STATE_CHANGE | NOTE_UPDATED | FORM_UPDATED | ...)
  ├── decision_type  (APPROVE | REJECT | SUPPLEMENT | STATE_ONLY | null) [신설]
  ├── reason         (text, null 가능)            [신설]
  ├── referencedNoteIds (배열)                    [신설]
  ├── actorId
  ├── snapshot       (JSON)
  └── createdAt

InboxItem
  ├── userId (수신자)
  ├── taskId
  ├── componentType  (DECISION | DISCUSSION | AWARENESS | RESULT) [통일]
  ├── eventType      (ASSIGN | APPROVE_REQUESTED | MENTION | ...)
  ├── readAt
  └── createdAt
```


### 7.2 엔티티별 주요 필드

**Task (확장)**
| 필드 | 타입 | 설명 | Release |
|---|---|---|---|
| id | UUID | 기존 유지 | R1 |
| templateId | UUID | 기존 유지 | R1 |
| parentId | UUID? | 계층 상위 (self-ref) | R1 |
| assignees | User[] | 기존 유지 | R1 |
| watchers | User[] | 읽기 권한, Notes 수정 시 알림 수신 | R2 |
| currentState | WorkflowState | 기존 유지 | R1 |
| formValues | JSON | Template 기반 산출물 (Notes와 분리) | R1 |
| notes | Notes[] | 1:N, 시스템 필드로 추가 | R3 |
| lastSeenAt (per user) | Map | 각 사용자의 마지막 진입 시간 | R2 |

**Notes (신설)**
| 필드 | 타입 | 설명 |
|---|---|---|
| id | UUID | 고유 ID |
| taskId | UUID | 소속 Task (FK) |
| title | string | Notes 제목 (아코디언 헤더, # 호출 자동완성 키) |
| content | RichText JSON | 본문 (파일럿은 기본 서식만, Release 3에 확장) |
| attachments | File[] | 파일 첨부 (PDF·이미지·Excel 등) |
| authorId | UUID | 최초 작성자 |
| lastEditorId | UUID | 최근 편집자 |
| createdAt / updatedAt | timestamp | 시간 기록 |

**TimelineEvent (확장)**
| 필드 | 타입 | 설명 | Release |
|---|---|---|---|
| type | enum | STATE_CHANGE / NOTE_UPDATED / FORM_UPDATED / COMMENT 등 | R2 확장 |
| decision_type | enum? | APPROVE / REJECT / SUPPLEMENT / STATE_ONLY / null | R2 신설 |
| reason | text? | 상태전이 시 사용자가 입력한 사유 | R2 신설 |
| referencedNoteIds | UUID[] | 결정 시 참조한 Notes | R2 신설 |
| actorId | UUID | 행위자 | R1 |
| snapshot | JSON | Task 전체 스냅샷 (기존 유지) | R1 |

**Role & Permission (신설)**
| 역할 | Task 권한 | Template 권한 | Admin 권한 |
|---|---|---|---|
| VIEWER (뷰어) | 읽기, Thread 코멘트, Notes 읽기 | 읽기 | 없음 |
| EDITOR (편집자) | 읽기 + 편집 + 상태전이 (DECISION 제외) | 읽기, 본인 생성 Template 편집 | 없음 |
| APPROVER (승인자) | EDITOR + DECISION 전이 실행 | 읽기 | 없음 |
| ADMIN (관리자) | 모든 Task 권한 | 모든 Template 권한 | 멤버·역할·정책 관리 |


## 8. 상세 기능 요구사항


### 8.1 계층 뷰 (/hierarchy) — Release 2


#### 8.1.1 목적

결정 대상이 "구조로 드러나는" 상태를 UI에 구현한다. OKR KR 1.1 기준 1, 2의 가시화 레이어.


#### 8.1.2 기능 요구사항

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| HV-1 | Objective→KR→Task 3레벨 이상 트리 렌더링 | Template.type 기반 자동 그룹핑, 5레벨까지 확장 가능 |
| HV-2 | 각 노드에 Template.type 배지 표시 | VISION/AXIS/OBJECTIVE/KEYRESULT/TASK 색상·아이콘 구분 |
| HV-3 | 노드 클릭 시 Task Detail로 이동 | /tasks/:id 진입, 뒤로가기로 계층 뷰 복귀 |
| HV-4 | 노드에 Notes 수·Thread 코멘트 수·담당자 배지 | 숫자 배지로 활동량 시각화 |
| HV-5 | 노드 상태 색상 (Phase 기반) | DRAFT/IN_PROGRESS/DONE/CANCELED 색 구분 |
| HV-6 | 접힘/펼침 상태 URL 반영 | ?expanded=id1,id2 형태로 공유 가능 |
| HV-7 | 검색·필터 (담당자·상태·Template type) | 상단 필터 바 |
| HV-8 | 권한에 따른 노드 가시성 | VIEWER도 전체 트리 구조는 보되, 개별 Task 내부는 RBAC 따름 |


#### 8.1.3 제외 (Release 3+ 이후)

- 그래프 뷰 (related·derived_from 관계 시각화) — MVP 3+
- 타임라인 뷰 (Gantt 스타일) — MVP 3+
- 드래그 앤 드롭으로 계층 재조정 — MVP 3+


### 8.2 Task Detail — 결정 워크스페이스 (/tasks/:id)


#### 8.2.1 목적

결정 대상에 귀속된 모든 맥락을 한 화면에서 조망. Form Output·Notes·Thread·Timeline을 동등한 위계로 배치하여 "논의하면서 결정한다"는 UX를 구현한다.


#### 8.2.2 레이아웃 (Release 3 기준)

```
┌─── Shell Bar ─────────────────────────────────────────────┐
│  ← Back to Hierarchy    Task: [Template 배지] 제목         │
├───────────────────────────────────────────────────────────┤
│  🟡 상위 Objective "2026 Q3 마케팅"이 당신의 마지막         │
│     방문 이후 변경되었습니다. [확인]   ← Pull 재확인 배너   │
├──────────────┬────────────────────────┬────────────────────┤
│  System      │   Main                 │  Side Panel        │
│  Fields      │   ─────────            │  (lg+)             │
│  ────────    │                        │                    │
│  상태 ▼      │  ▼ Notes (3)           │  Thread            │
│  담당자      │    ├─ 시장 세분화 계획 │  ─────             │
│  기간        │    │  (RT + PDF)       │  # 4 comments      │
│  우선순위    │    ├─ 분석 요약        │  [...]             │
│  Phase       │    └─ 결정사항         │                    │
│  ────────    │                        │  [+ New Comment]   │
│  Notes: 3    │  ▶ Form Output         │                    │
│  Thread: 4   │    (Template 기반)     │  ─────             │
│  Files: 2    │                        │  Timeline (탭)     │
│              │                        │  [최근 10건]       │
├──────────────┼────────────────────────┴────────────────────┤
│              │  [Reject] [Request Supplement] [Approve]   │
│              │  ← 승인자만 가시                            │
└──────────────┴────────────────────────────────────────────┘
```


#### 8.2.3 기능 요구사항

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| TD-1 | System Fields 좌측 고정 (상태·담당자·기간 등) | Release 1 SystemFieldsCard 재활용 |
| TD-2 | Notes 섹션 아코디언 — 여러 Notes 개별 접힘/펼침 | 기본 상태: OBJECTIVE/KR는 펼침, TASK는 접힘 |
| TD-3 | Notes 추가·편집·삭제 (권한 기반) | VIEWER는 읽기만, EDITOR 이상 편집 가능 |
| TD-4 | Notes Rich Text 에디터 (파일럿은 최소, R3에 확장) | bold/italic/list/heading/link 기본 지원 |
| TD-5 | Notes 파일 첨부 (드래그앤드롭) | PDF·이미지·xlsx 10MB 이하 |
| TD-6 | Form Output은 별도 섹션으로 분리 | Notes와 시각적·데이터 모델 양쪽에서 분리 |
| TD-7 | Thread 사이드 패널 (lg+ 화면) | 좁은 화면에서는 탭으로 전환 |
| TD-8 | Thread 코멘트에 #NoteName 자동완성 | # 입력 시 현재 Task의 Notes 목록 드롭다운 |
| TD-9 | # 참조 후 Notes 수정 시 원 코멘트 작성자 알림 | Variable Reward 자동화 (R3) |
| TD-10 | 상단 변경 배너 (LastSeenAt 기반) | 상위 또는 관련 Task가 마지막 진입 후 수정됐을 때 |
| TD-11 | 하단 결정 액션 바 (승인자만 가시) | Approve / Reject / Request Supplement |
| TD-12 | 결정 버튼 클릭 시 사유 입력 모달 | reason 텍스트 + 참조 Notes 체크박스 |
| TD-13 | Timeline 탭 (최근 10건 + 전체 보기) | /tasks/:id/timeline으로 이동 |
| TD-14 | Edit 모드 진입 버튼 (/tasks/:id/edit) | 편집 권한 있을 때만 가시 |


### 8.3 Task · Task Template CRUD


#### 8.3.1 Task CRUD

| 연산 | 경로 | 권한 | 동작 |
|---|---|---|---|
| Create | /tasks/new | EDITOR+ | Template 선택 → 초기값 → 저장. parentId 선택으로 계층 내 배치 |
| Read (목록) | /tasks | VIEWER+ | 필터·그룹바이·검색. 권한 없는 Task는 숨김 |
| Read (상세) | /tasks/:id | VIEWER+ | 결정 워크스페이스 (위 8.2) |
| Update (편집) | /tasks/:id/edit | EDITOR+ 또는 담당자 | Form Output·시스템 필드 편집 |
| Update (Notes) | /tasks/:id (인라인) | EDITOR+ 또는 담당자 | Notes 아코디언 인라인 편집 |
| Update (상태전이) | 모달 | EDITOR (비결정) / APPROVER (결정) | 사유 입력 후 Timeline 기록 |
| Delete | 메뉴 | 작성자 또는 ADMIN | 소프트 삭제, 복구 기간 30일 |


#### 8.3.2 Task Template CRUD

| 연산 | 경로 | 권한 | 동작 |
|---|---|---|---|
| Create | /templates/new | EDITOR+ | 기본 정보 + Form 정의 + Workflow 그래프 + type 선택 |
| Read (목록) | /templates | EDITOR+ | 카테고리·type·enabled 필터 |
| Read (상세) | /templates/:id | EDITOR+ | 3탭: 개요 / Form Builder / Workflow |
| Update (Form) | /templates/:id (Form 탭) | EDITOR+ 또는 Template 작성자 | 14종 필드 편집 (Release 1 유지) |
| Update (Workflow) | /templates/:id/workflow | EDITOR+ 또는 Template 작성자 | State·Transition 편집 + is_decision 플래그 (R3) |
| Update (AI Context) | /templates/:id/ai-context | EDITOR+ | aiPrompt·inspectionCriteria·guidelines (R3 자리만, MVP 2 완성) |
| Delete | 메뉴 | 작성자 또는 ADMIN | 사용 중 Template은 enabled=false로 soft disable |
| Version | Template 내부 | 자동 | 수정 시 신규 version 생성, 기존 Task는 이전 version 유지 |


#### 8.3.3 Task Template의 Version 정책

- Template 수정 시 자동으로 새 version 생성 (incremental)
- 기존 Task는 생성 시점의 version을 고정 참조
- 신규 Task 생성 시 최신 version을 기본값으로 사용
- 사용자는 Task 내에서 "Template 업그레이드" 명시적 액션으로 최신 version 적용 가능
- 업그레이드 시 기존 formValues 호환성 자동 검사, 비호환 필드는 경고


### 8.4 RBAC (역할 기반 접근 제어)


#### 8.4.1 역할 정의

4개 역할을 도입하며, 사용자는 Unit별로 하나의 주 역할을 가진다. Task·Template 레벨의 세부 권한은 Unit 주 역할에서 파생되되, 관리자가 개별 조정 가능하다.

| 역할 | 대상 | 기본 할당 상황 |
|---|---|---|
| VIEWER (뷰어) | 비개발부서, 외부 협력자 | 초대 기본값, 읽기 + Thread 코멘트 + Notes 읽기 |
| EDITOR (편집자) | 개발부서 구성원, 담당자 | Task 생성·편집, Template 참여 가능 |
| APPROVER (승인자) | 팀장, 의사결정권자 | EDITOR + 상태 전이 중 is_decision=true Transition 실행 가능 |
| ADMIN (관리자) | Unit 오너, 시스템 관리자 | 모든 권한 + 멤버/역할/정책 관리 |


#### 8.4.2 권한 매트릭스

| 액션 | VIEWER | EDITOR | APPROVER | ADMIN |
|---|---|---|---|---|
| Task 목록·상세 읽기 | ✓ | ✓ | ✓ | ✓ |
| Task Notes 읽기 | ✓ | ✓ | ✓ | ✓ |
| Thread 코멘트 작성 | ✓ | ✓ | ✓ | ✓ |
| Thread에서 #Notes 호출 | ✓ | ✓ | ✓ | ✓ |
| Task 생성 | ✗ | ✓ | ✓ | ✓ |
| Task 편집 (Form Output) | ✗ | ✓ (담당자/Unit) | ✓ | ✓ |
| Task Notes 추가·편집·삭제 | ✗ | ✓ | ✓ | ✓ |
| 상태 전이 (비결정) | ✗ | ✓ | ✓ | ✓ |
| 상태 전이 (DECISION) | ✗ | ✗ | ✓ | ✓ |
| Task 삭제 | ✗ | 작성자만 | 작성자만 | ✓ |
| Template 읽기 | ✗ (간접) | ✓ | ✓ | ✓ |
| Template 편집 | ✗ | 작성자만 | 작성자만 | ✓ |
| 멤버·역할 관리 | ✗ | ✗ | ✗ | ✓ |
| Audit Log 조회 | ✗ | 본인 관련만 | 본인 관련만 | ✓ (전체) |


#### 8.4.3 초대 플로우

1. ADMIN이 `/admin/members`에서 "초대" 클릭
2. 이메일 + 역할 선택 (VIEWER가 기본값)
3. 초대 링크 발송 (`/invitations/accept?token=...`)
4. 초대 수락 시 해당 Unit의 멤버로 등록, 선택된 역할 자동 할당
5. 멤버는 이후 ADMIN이 역할 변경 가능 (단, 본인은 본인 역할 변경 불가)


### 8.5 Inbox & 알림


#### 8.5.1 4탭 구조

| 탭 | 성격 | 포함 이벤트 | UX 가이드 |
|---|---|---|---|
| DECISION | 판단 필요 (행동 요구) | APPROVE_REQUESTED, SUPPLEMENT_REQUESTED, REJECT | 즉시 Task Detail 진입 → 결정 액션 바 |
| DISCUSSION | 응답 필요 | MENTION, COMMENT, NOTE_UPDATED (# 참조된 Notes 수정) | Thread로 이동, Notes 업데이트 확인 |
| AWARENESS | 인지만 | ASSIGN, STATE_CHANGE, DUE_SOON, DUE_OVERDUE, REOPEN, HIERARCHY_CHANGE | 읽음 처리로 해소, 필요 시 Task 진입 |
| RESULT | 읽고 끝 | COMPLETED, CANCELED | 자동 읽음 처리, 조회만 |


#### 8.5.2 기능 요구사항

| ID | 요구사항 | 수용 기준 |
|---|---|---|
| IB-1 | FE 4탭과 BE componentType 완전 일치 | enum 동일, VALID_COMPONENT_TYPES 확장 |
| IB-2 | 각 이벤트는 올바른 탭으로 발행 | 이벤트→componentType 매핑 테이블 기반 라우팅 |
| IB-3 | DECISION 탭의 실제 발행처 존재 | Workflow Transition의 is_decision=true 시 자동 발행 |
| IB-4 | NOTE_UPDATED 알림 (Variable Reward 핵심) | # 참조한 Notes 수정 시 원 코멘트 작성자 수신 |
| IB-5 | 미확인 건수 배지 (탭별) | 사이드바 Inbox 아이콘 옆, 탭 헤더 |
| IB-6 | 읽음/안읽음 토글 | 개별·일괄 처리 |
| IB-7 | 스누즈 (나중에 다시 알림) | 1h / 4h / 1d / 1w 옵션 (R3) |
| IB-8 | 보관 (Archive) | RESULT는 자동 보관, 수동 보관도 가능 (R3) |
| IB-9 | 전역 검색과 별개 (Inbox 내 필터만) | Task·담당자·기간 필터 |


#### 8.5.3 이벤트 → 탭 매핑

| 이벤트 | componentType | 발행 시점 | Release |
|---|---|---|---|
| ASSIGN | AWARENESS | Task assignees에 추가될 때 | R1 유지 |
| STATE_CHANGE (비결정) | AWARENESS | is_decision=false 전이 | R1 유지 |
| STATE_CHANGE (결정) | DECISION | is_decision=true 전이 요청 | R3 신설 |
| APPROVE_REQUESTED | DECISION | 검토 대기 상태 진입 시 승인자에게 | R3 신설 |
| SUPPLEMENT_REQUESTED | DECISION | 승인자가 보완 요청 액션 시 담당자에게 | R3 신설 |
| REJECT | DECISION | 승인자가 반려 액션 시 담당자에게 | R3 신설 |
| REOPEN | AWARENESS | 완료/취소된 Task 재개 시 관계자에게 | R3 신설 |
| MENTION | DISCUSSION | Thread 코멘트에서 @멘션 | R2 |
| COMMENT | DISCUSSION | Thread 신규 코멘트 (멘션 없어도) | R2 |
| NOTE_UPDATED | DISCUSSION | # 참조한 Notes 수정 시 원 코멘트 작성자에게 | R3 신설 (핵심) |
| DUE_SOON / DUE_OVERDUE | AWARENESS | 마감 3일 전 / 당일 초과 | R2 |
| HIERARCHY_CHANGE | AWARENESS | 상위 Task 변경 시 하위 담당자에게 | R2 (배너와 별도 유지) |
| COMPLETED / CANCELED | RESULT | 종결 상태 진입 | R1 유지 |


### 8.6 관리·설정 요소


#### 8.6.1 Admin 영역 (/admin)

관리자만 접근 가능한 통합 관리 콘솔. Release 2에서 /admin/members를 최소 확보, 나머지는 Release 3에 확장.

| 경로 | 기능 | Release |
|---|---|---|
| /admin | 대시보드 — 멤버 수·활동량·최근 이슈 | R3 |
| /admin/members | 멤버 초대·역할 변경·제거 | R2 |
| /admin/roles | 역할 정의·커스텀 역할 (R3+) | R3 |
| /admin/permissions | Template 레벨·Task 레벨 권한 예외 정책 | R3 |
| /admin/audit | 전체 Timeline 감사 로그 (decision_type 필터) | R3 |
| /admin/analytics | Retention·활동·의사결정 통계 대시보드 | R3 |


#### 8.6.2 Unit Settings (/units/:id/settings)

- Unit 이름·로고·설명
- 기본 Template 세트 (Unit 생성 시 자동 설치)
- 기본 알림 정책 (이메일·인앱 on/off)
- 타임존·주 시작 요일
- Unit 삭제 (ADMIN 전용, 확인 2단계)


#### 8.6.3 User Settings (/me/...)

- `/me/profile` — 이름, 아바타, 직함, Unit별 역할 조회
- `/me/notifications` — 탭별 알림 on/off, 이메일 다이제스트 주기
- `/me/preferences` — 테마(라이트/다크), 언어, Notes 에디터 단축키


#### 8.6.4 Feedback (/feedbacks)

- 사용자 제보 접수 (버그·개선 제안)
- 관리자가 상태 관리 (NEW / IN_PROGRESS / RESOLVED / WONT_FIX)
- 관리자 답글 → 제보자에게 알림
- Release 1 유지, Release 2에서 Inbox 연동 보강


## 9. 사용자 여정 (User Journeys)

주요 4가지 페르소나별 여정. Release 3 기준 이상적 시나리오.


### 9.1 페르소나

| 페르소나 | 역할 | 주 사용 맥락 | 성공 체감 |
|---|---|---|---|
| 박PM (개발부서 PM) | EDITOR | Objective·KR 생성, 비개발부서와 조율 | 내 구조화가 조직 의사결정의 기반이 됨 |
| 김매니저 (마케팅) | VIEWER → EDITOR | 비개발 실무자, Notes 작성·Thread 응답 | 내 의견이 결정에 반영되는 과정이 보임 |
| 이팀장 (비개발 리더) | APPROVER | 최종 의사결정자, 주 1~2회 방문 | 분산된 자료 없이 한 화면에서 결정 가능 |
| Admin (운영자) | ADMIN | 초대·역할·감사 | 조직 전체 의사결정 흐름 관리 |


### 9.2 Journey 1 — 박PM (EDITOR): 결정 대상 구조화

맥락: Q3 마케팅 방향 확정이 필요. 박PM이 Objective를 만들고 김매니저·이팀장을 참여시킨다.

| 단계 | 행동 | 화면 | 데이터 변화 |
|---|---|---|---|
| 1 | HWE 접속 | / → /hierarchy 리다이렉트 | LastSeenAt 갱신 |
| 2 | 새 Objective 생성 | /tasks/new (Template: OBJECTIVE) | Task 생성, 계층에 추가 |
| 3 | 배경 Notes 작성 + PDF 첨부 | /tasks/:id Notes 섹션 | Notes 1건, 파일 2건 저장 |
| 4 | 하위 KR 2개 생성 | /tasks/new (parentId 지정) | Task 2건, 트리 확장 |
| 5 | 각 KR에 담당자(김매니저) + Watcher(이팀장) | Task Detail | assignees·watchers 갱신 |
| 6 | Hierarchy 뷰에서 구조 확인 | /hierarchy | 읽기 전용 확인 |
| — | (김매니저에게 ASSIGN, 이팀장에게 Watcher ASSIGN) | — | Inbox 이벤트 발행 |
| 7 | 3일 후: 김매니저 Notes 업데이트 DISCUSSION 탭 수신 | /inbox/discussion | 읽음 처리 |
| 8 | Task Detail 재방문, Notes 확인 후 Thread 질문 | /tasks/:id | Thread 코멘트 + # 참조 기록 |
| 9 | 1일 후: NOTE_UPDATED 알림 (내 질문 반영 수정) | /inbox/discussion | Variable Reward 체감 |


### 9.3 Journey 2 — 김매니저 (VIEWER→EDITOR): 자료 기여

맥락: 비개발부서 첫 참여. 초대 수락부터 Notes 작성, Thread 응답까지.

| 단계 | 행동 | 화면 | 체감 포인트 |
|---|---|---|---|
| 1 | 이메일 초대 링크 클릭 | /invitations/accept | 진입 장벽 최소화 |
| 2 | 로그인 (SSO) | /login → /auth/callback | — |
| 3 | Unit 자동 진입, /hierarchy에 랜딩 | /hierarchy | "내가 담당된 것" 기본 필터 |
| 4 | Inbox AWARENESS 탭에서 ASSIGN 확인 | /inbox/awareness | "내가 뭘 해야 하나" 명확 |
| 5 | KR Task 진입 → 상위 Objective Notes 읽기 | /tasks/:id → 링크 → Objective | 맥락 파악 15분 |
| 6 | 본인 KR에 Notes 아코디언 "조사 계획" 작성 | /tasks/:id Notes 섹션 | 문서형 논의 경험 |
| 7 | 하위 Task 생성 (시장 세분화 조사) | /tasks/new (parentId: KR) | 구조 기여 |
| 8 | 조사 결과 Rich Text + 파일로 Notes 추가 | /tasks/:id Notes | — |
| 9 | Thread에서 박PM 질문 수신 (MENTION) | /inbox/discussion | — |
| 10 | 답변을 Notes 본문 수정 + Thread 짧은 답글 | /tasks/:id | "공간 구별"이 자연스러움 |
| 11 | 이팀장 피드백 반영 후 "검토 대기" 전이 | 상태전이 모달 | 사유 입력 체감 |
| 12 | 4일 후: COMPLETED 알림 (승인됨) | /inbox/result | 종결 확인 |


### 9.4 Journey 3 — 이팀장 (APPROVER): 결정

맥락: 주 1~2회 로그인하는 의사결정권자. 효율이 최우선.

| 단계 | 행동 | 화면 | 체감 포인트 |
|---|---|---|---|
| 1 | 모바일 이메일: "DECISION 3건 대기" | 외부 | 한눈에 결정 요청 수 파악 |
| 2 | 데스크톱 접속 → /inbox/decision 자동 | /inbox/decision | 판단 집중 모드 |
| 3 | 첫 Task 진입 — 상단 배너 "상위 변경됨" | /tasks/:id | Pull 재확인 작동 |
| 4 | 배너 "확인" → 상위 Objective 변경 조회 | /tasks/상위 | 맥락 업데이트 |
| 5 | 돌아와 Notes 3개 아코디언 전부 펼침 | /tasks/:id | 한 화면에서 자료 조망 |
| 6 | Thread 3개 코멘트 요약 확인 | /tasks/:id Thread | — |
| 7 | 의문점을 Thread에 질문 + "#분석 요약" 참조 | /tasks/:id Thread | # 호출 자연스러움 |
| 8 | 김매니저 답변 대기 (이 Task는 보류) | 다른 Task로 | — |
| 9 | 다른 Task: "Approve" → 사유 모달 | 결정 모달 | — |
| 10 | 사유 입력 + 참조 Notes 2개 체크 → 승인 | 모달 제출 | 결정 근거 명시 습관화 |
| 11 | Timeline에 decision_type=APPROVE, reason, refs 기록 | Timeline | 사후 추적 기반 확보 |
| 12 | 3번째 Task는 "Request Supplement" 선택 | 결정 모달 | — |


### 9.5 Journey 4 — Admin: 조직 운영

맥락: 새 팀 합류 → 초대 → 역할 조정 → 감사.

| 단계 | 행동 | 화면 | 체감 포인트 |
|---|---|---|---|
| 1 | 신규 멤버 합류 통보 수신 | 외부 | — |
| 2 | /admin/members 진입 → "초대" 클릭 | /admin/members | — |
| 3 | 이메일 + 역할 (VIEWER 기본) → 초대 발송 | 모달 | 기본값 안전 |
| 4 | 멤버 수락 후 목록 확인 | /admin/members | — |
| 5 | 1주 뒤 EDITOR로 승격 | 멤버 행 "역할 변경" | 점진적 권한 확장 |
| 6 | 월말: 감사 로그 점검 | /admin/audit | — |
| 7 | DECISION 이벤트 필터 → 이달 결정 15건 조회 | /admin/audit?decision_type=* | 조직 결정 흐름 조망 |
| 8 | 각 결정의 reason·referencedNotes 확인 | 개별 Timeline 링크 | 결정 품질 평가 |
| 9 | Analytics 대시보드 — Retention·활동량 | /admin/analytics | 조직 건강도 |


## 10. 파일럿 계획 (Release 2와 3 사이)


### 10.1 목적

Notes + Thread 이원 논의 구조 가설 검증. 다음 질문에 Yes/No로 답할 수 있는 데이터 확보:

- 하네스엔지니어링과 비개발부서가 논의를 문서형(Notes)과 대화형(Thread)으로 자연스럽게 구별해서 쓰는가?
- # 호출이 자연 발생하는가, 아니면 학습 없이는 쓰이지 않는가?
- Hook 루프 4단계가 실제로 도는가?


### 10.2 판정 기준 (사전 합의 필수)

| 지표 | 가설 성립 임계값 | 가설 실패 임계값 |
|---|---|---|
| 공간 사용 분포 (Notes 편집 : Thread 코멘트) | 3:7 ~ 7:3 | 한쪽 90% 이상 점유 |
| 판단 망설임 (인터뷰) | "2주 후 자연스러워짐" | "끝까지 헷갈렸다" |
| # 호출 빈도 | 1인 평균 주 2회 이상 | 주 1회 미만 |
| 비개발부서 Notes 편집 비율 | 전체의 30% 이상 | 10% 미만 |
| NOTE_UPDATED 후 재방문율 | 70% 이상 | 40% 미만 |
| 주간 자발적 재방문율 (4주차) | 주 3회 이상 | 주 1회 미만 |


### 10.3 파일럿 구성

- 기간: 4주
- 참가자: 개발부서 2~3명 + 비개발부서 2~3명 (총 4~6명)
- 사용 맥락: 실제 진행 중인 의사결정 대상 1건을 HWE로 논의·결정
- 기존 도구 병용: 허용 (Slack/이메일 금지 안 함) — 이탈률도 관측


### 10.4 파일럿 최소 구현 (Thin Slice)

- Notes 엔티티 + 시스템 섹션 아코디언 UI
- Rich Text 에디터 (기본: bold·italic·list·heading·link)
- 파일 첨부 (10MB 이하)
- Thread에 #NoteName 자동완성 + 참조 임베드
- # 참조 추적 + NOTE_UPDATED 알림 (Variable Reward 필수)
- Inbox FE/BE enum 통일 + 실데이터 (Trigger 정확도 필수)
- 관측 이벤트 로깅 (Notes 편집·Thread 코멘트·# 호출·Task 진입)


### 10.5 파일럿 결과 3가지 시나리오

| 시나리오 | 판정 결과 | Release 3 대응 |
|---|---|---|
| A — 가설 성립 | 양 공간 활발, # 호출 자연 발생, 비개발부서도 Notes 사용 | 원안대로 진행. Notes + Thread + # 본격화 |
| B — 가설 실패 | 한쪽 공간만 쓰임, # 호출 거의 없음 | 단일 공간 Notes 재설계. Thread 축소 |
| C — 조건부 성립 | 전략 Task는 A처럼, 실행 Task는 B처럼 | 레벨별 하이브리드. Template type에 따라 Notes 기본 노출 조절 |


## 11. 로드맵 & 스프린트


### 11.1 전체 타임라인

```
Release 2 (5주)          파일럿 (4주)           Release 3 (5주)
────────────────         ─────────────          ────────────────
W1  W2  W3  W4  W5   │   P1  P2  P3  P4    │   W6  W7  W8  W9  W10
↓   ↓   ↓   ↓   ↓   │   ↓   ↓   ↓   ↓    │   ↓   ↓   ↓   ↓   ↓
E1  A1  C1  C2  B1  │   Thin Slice 가동 +   │   C3  C4  D3  D3  A3
A2      C5  F1  B3  │   4주 사용 + 관측     │   B2            통합
        D1a D1b D2  │                        │                테스트
                E2  │                        │

R2 종료:                 P 종료: 파일럿 결과    R3 종료:
KR 1.1 (기준 1·2·3)      시나리오 A/B/C 판정    Objective 1 달성
KR 1.2 (기준 2·3·4)                              판정 가능 상태
```


### 11.2 Release 2 스프린트 (5주)

| 주차 | 목표 | 항목 | 검증 |
|---|---|---|---|
| W1 | Inbox 정합성 + 계층 가시화 준비 | E1 (FE/BE enum 통일), A2 (Template type 배지), Retention 기준선 기획 | 이벤트 올바른 탭 유입, 목록에 type 배지 |
| W2 | 계층 뷰 MVP | A1 (/hierarchy 트리 뷰) | Objective→KR→Task 3레벨 렌더링, 배지·접힘/펼침 |
| W3 | 결정 메타 1차 + Notes 스키마 | C1 (TransitionRequest 확장), C5 (Timeline 기록), D1a (Notes 스키마) | DTO에 reason/decision_type/noteRefs 수신, Notes 테이블 |
| W4 | 결정 UI + 변경 인지 | C2 (사유 모달), F1 (LastSeenAt + 배너), D1b (Notes API) | 상태전이 모달, 상위 변경 배너, Notes CRUD |
| W5 | 뷰어 RBAC + Detail + Inbox 통합 | B1 (뷰어), B3 (초대), D2 (/tasks/:id), E2 (Inbox 4탭) | 뷰어 초대·열람·Thread 참여 / Detail 기본 진입 / Inbox 4탭 |


### 11.3 파일럿 스프린트 (4주)

| 주차 | 목표 | 작업 |
|---|---|---|
| P1 | 온보딩 + 첫 시도 | 참가자 4~6명 온보딩, 첫 Objective·KR·Task 생성, Notes 첫 작성 |
| P2 | 공간 사용 분포 관측 + 중간 인터뷰 | 정량 중간 점검, 3명 짧은 인터뷰 ("Notes vs Thread 고민 있었나요?") |
| P3 | # 호출 행동 집중 관찰 | #호출 빈도·분포 분석, 파워유저 편중 여부 확인 |
| P4 | 회고 + 최종 인터뷰 + 판정 | 6개 지표 최종 집계, 30분×6명 인터뷰, A/B/C 중 확정 |


### 11.4 Release 3 스프린트 (5주)

| 주차 | 목표 | 항목 | 검증 |
|---|---|---|---|
| W6 | 승인자 RBAC + Template 메타 | B2 (APPROVER), C3 (is_decision 플래그) | 승인자 가드, Template에서 결정 전이 선언 |
| W7 | DECISION 이벤트 파이프라인 | C4 (DECISION 발행), NOTE_UPDATED 파이프라인 | is_decision 전이 시 DECISION 탭 알림, # 참조→수정 알림 |
| W8 | Task Detail 4구역 (파일럿 반영) | D3 — A면 Notes+Thread 병행, B면 단일, C면 레벨별 | 4구역 레이아웃 확정 |
| W9 | Detail 반응형 + 하단 액션바 | 모바일 레이아웃, 결정 액션바 | 작은 화면, 결정 흐름 매끄러움 |
| W10 | Retention 대시보드 + 통합 검증 | A3 (Analytics), 회귀 테스트 | 주간 재방문·노드 수정·전환율 수집 시작 |


### 11.5 Release 3 이후 — Objective 1 판정 관측 (6주)

- 기능 변경 최소화, 신규 기능 배포 금지 (관측 기간 안정성)
- 주 1회 Retention 대시보드 리뷰
- 6주차에 Objective 1 달성 여부 최종 판정
- 달성 시 Objective 2 (AI + 변경 인지) 착수
- 미달성 시 실패 원인 분석 → Release 4 재설계


## 12. 비기능 요구사항


### 12.1 성능

- Hierarchy 뷰: 100개 노드 1초 이내, 500개 3초 이내
- Task Detail: Notes 10개 + Thread 100 코멘트 2초 이내
- Inbox: 500건 미만 시 1초 이내 로드
- 상태 전이 API: 500ms 이내 응답


### 12.2 보안

- RBAC 권한 체크는 서버에서 항상 재검증 (클라이언트 신뢰 금지)
- Notes 파일 업로드 시 바이러스 검사·MIME 검증·크기 제한
- Timeline·Audit 로그는 변경 불가 (append-only)
- 초대 토큰 24시간 만료


### 12.3 관측 가능성

- 주요 이벤트 로깅 (Task·Notes·Thread·상태전이·Inbox)
- Retention 지표 자동 집계 (DAU/WAU, 재방문 주기, 활동 깊이)
- 에러 모니터링 (FE Sentry, BE 로그 집계)


### 12.4 접근성

- WCAG 2.1 AA 수준 준수
- 키보드 전용 탐색 지원 (Hierarchy 화살표, Inbox 단축키)
- 스크린리더 호환 (ARIA 역할·라벨)


### 12.5 국제화

- 한국어 기본, 영어 동시 지원
- 날짜·시간 형식 로케일 대응
- Rich Text 에디터 한국어 IME 안정 동작


## 13. Release 별 최종 수용 기준


### 13.1 Release 2 Definition of Done

1. Hierarchy 뷰에서 3레벨 이상 계층이 Template type 배지와 함께 렌더링된다
2. `/tasks/:id` Detail 라우트가 존재하고, Edit와 분리되어 있다
3. 상태 전이 시 사유 입력 모달이 나타나고, reason·decision_type·referencedNoteIds가 Timeline에 저장된다
4. Inbox 4탭이 FE/BE 모두 동일한 enum으로 작동하며, 이벤트가 올바른 탭으로 분류된다
5. VIEWER 역할로 초대된 비개발부서 멤버가 Task를 읽고 Thread 코멘트를 남길 수 있다
6. Task Detail 진입 시 상위 변경 배너가 LastSeenAt 기반으로 표시된다
7. Notes 엔티티 스키마와 CRUD API가 동작한다 (UI는 파일럿에서 시각화)


### 13.2 파일럿 Definition of Done

1. 4~6명 실사용자가 4주간 실제 의사결정 1건을 HWE에서 완주했다
2. 6개 판정 지표가 모두 수집되었고, 시나리오 A/B/C 중 하나로 판정이 내려졌다
3. Release 3 Task Detail 구조 결정이 파일럿 결과에 기반해 문서화되었다


### 13.3 Release 3 Definition of Done

1. APPROVER 역할이 존재하며 is_decision=true 전이는 승인자만 실행 가능하다
2. Template Workflow 편집 화면에서 Transition별 is_decision·decision_type 지정이 가능하다
3. DECISION 이벤트가 APPROVE_REQUESTED 등으로 실제 발행되어 Inbox DECISION 탭에 유입된다
4. # 참조한 Notes 수정 시 원 코멘트 작성자에게 NOTE_UPDATED 알림이 자동 발송된다
5. Task Detail의 Form Output·Notes·Thread·Timeline이 결정 워크스페이스 레이아웃으로 통합되었다
6. Retention 대시보드가 주간 재방문·활동량·전환율을 수집하고 있다
7. 파일럿 결과가 Task Detail 구조에 반영되어 있다 (시나리오 A/B/C 중 확정안)


## 14. 부록


### 14.1 용어집

| 용어 | 정의 |
|---|---|
| Task Template | outcome을 위한 실행 구조 정의(define). 단순 입력 폼이 아니라 특정 성과를 만들기 위해 필요한 산출물, 상태 전이, 권한, 검토 흐름, 판단 기준을 구조화한 방법론 자산 |
| outcome | 성과 — 그로 인해 사용자의 상태, 조직의 판단, 실행 방식, 지표가 실제로 달라진 것 |
| output | 산출물 — 우리가 만든 것. Form Output, Notes, 리포트, 승인 기록, 첨부 문서 등 결과를 만들기 위한 가시적 산물 |
| painpoint | 사용자가 지금 겪는 표면 문제. 예: 결정 대상이 불명확함, 논의가 흩어짐, 변경이 전파되지 않음 |
| unmet needs | painpoint 아래 숨어 있는 아직 충족되지 않은 필요. 예: 비개발부서도 같은 구조를 보고 지칭할 수 있어야 함, 결정 근거가 사후 추적 가능해야 함 |
| hook (훅) | 사용자가 자발적으로 다시 돌아오게 만드는 자기강화 루프. Trigger(알람) → Action(진입) → Variable Reward(보상) → Investment(축적)의 4단계가 닫히면서, "해야 해서"가 아니라 "의미 있어서" 쓰게 되는 제품 원칙 |
| HWE Hook Model | Eddie가 제안한 HWE의 훅 설계. "지식의 형상화 → 피드백 → 알람 → Action"이 자기강화 루프로 순환할 때, 알람이 부담이 아닌 의미 있는 참여 신호가 된다는 제품 원칙 |
| Hook Model | Investment → Trigger → Action → Variable Reward 4단계 순환 구조. Nir Eyal 정의 |
| hierarchy_meaning | 계층 각 레벨이 어떤 의미(Vision/Axis/Objective/KR/Task)인지 명시하는 속성. SelvasIn4에서는 Template.type이 역할 대행 |
| Decision Workspace | 결정 대상(Task)에 Form Output·Notes·Thread·Timeline이 귀속되어 한 화면에서 조망 가능한 UI 패턴 |
| Pull 재확인 | 변경 시 즉시 알림(Push)이 아닌, 사용자가 다음에 Task를 열 때 배너로 인지시키는 변경 전파 모델 |
| Decision Graph | 조직 의사결정 이력이 구조적으로 축적된 데이터 자산. 이탈 장벽(Lock-in) 핵심 축 |
| Variable Reward | Hook Model 4단계 중 마지막. 행동 결과가 예측 불가능하지만 긍정적으로 돌아오는 경험 |
| is_decision flag | Workflow Transition 메타. true면 "결정 행위"로 간주되어 DECISION 이벤트 발행 및 APPROVER 권한 요구 |
| decision_type | TimelineEvent 메타. APPROVE / REJECT / SUPPLEMENT / STATE_ONLY. 사후 추적·감사 필터 기반 |
| LastSeenAt | 사용자별 Task 마지막 진입 시각. 변경 배너 트리거 판단 근거 |


### 14.2 참조 문서

- OKR v3.2 — HWE MVP OKR (하네스엔지니어링)
- Design Goals v7.1
- HWE Hook Model
- Release 1 코드베이스 감사 보고서 (5개 영역 병렬 조사)
- Sitemap 비교 연구 — ClickUp, Workday, SuccessFactors, OmniEsol 등


### 14.3 변경 이력

| 버전 | 일자 | 변경 내용 |
|---|---|---|
| 0.1 | 2026-04-22 | 초안 — Release 2/3 로드맵 기반 스펙 골격 |
| 0.5 | 2026-04-23 | Notes·Thread 이원 구조 파일럿 설계 반영, 시나리오 A/B/C 추가 |
| 1.0 | 2026-04-23 | 최종본 — IA·엔티티·사용자 여정·수용 기준 완비 |
| 1.0.1 | 2026-04-23 | 용어집 보강 — outcome/output/painpoint/unmet needs/hook/HWE Hook Model/Task Template 정의 추가 |
