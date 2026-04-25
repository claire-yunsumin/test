# OKR 매칭 리포트 (MVP 1 / MVP 2)

## 판정 기준

| 상태 | 의미 |
| --- | --- |
| 달성 | 시스템 요구사항/수용 기준이 구현 범위와 일치 |
| 부분달성 | 핵심 구조는 있으나 지표 자동화 또는 일부 동작 미확정 |
| 미달성 | 요구사항 대비 구현 근거 없음 |

## Objective 1 매칭 (Unmet Needs 해소 + Retention)

| 구분 | 요구 내용 | 현재 구현 매칭 | 판정 |
| --- | --- | --- | --- |
| W1 | 결정 대상 구조화 (Work Graph, Template) | `FREEFORM/TEMPLATED`, 템플릿 적용, Form Output, parent cycle 방지, 그래프 뷰 탭이 Release 3 + System Spec에 명시 | 달성 |
| W2 | 논의-결정 흐름 귀속 (Thread/Notes/상태전이/알람) | 멘션/노트 참조 검증, 타임라인, 전이 시 reason 필수, Inbox 라우팅이 Release 2 + System Spec에 명시 | 달성 |
| KR 1.1-형상화 | Objective->KR->Task 형상화 가능 | 자유 노드 생성, parent 연결, 그래프/리스트/보드/백로그 뷰 제공 | 달성 |
| KR 1.1-정형화 | Template 적용으로 산출물 구조화 | templateId/templateType, formValues 보강(기존값 보존 + 누락 필드 채움), 레거시 파일 필드 제거 규칙 | 달성 |
| KR 1.1-멘션 | 노드/필드/노트 멘션으로 논의 시작 | `@`/`#` composer, MEMBER/TASK/FORM_FIELD/NOTE 검증, INVALID_MENTION 처리 | 달성 |
| KR 1.2-알람 분류 | 결정/논의/인지/결과 흐름 기반 처리 | 이벤트-컴포넌트 명시 매핑 보강, Inbox read/ack/remind/read-all 액션이 API/UI에서 모두 노출 | 달성 |
| KR 1.2-Notes 귀속 | Notes/Thread가 결정 대상에 귀속 | 노트 CRUD + 태그 + 참조 링크 + 스레드 결합 구조 정의 | 달성 |
| KR 1.2-합의/승인 Gate | 승인/반려/보완요청과 결정 추적 | 전이 이벤트가 APPROVAL_REQUESTED/APPROVAL_APPROVED/APPROVAL_REJECTED로 세분화되고, Task 상세에서 승인 단계/근거 가시화 | 달성 |
| O1 Retention 측정 | 자발적 재방문/루프 반복 판단 | `Alarm->Action 전환율`, `결정 귀속 완결률`, `주간 자발 재방문율(7d)`를 API 계산 및 Analytics 화면 자동 판정에 반영 | 달성 |

## Objective 2 매칭 (AI 활용 + 변경 인지)

| 구분 | 요구 내용 | 현재 구현 매칭 | 판정 |
| --- | --- | --- | --- |
| W3 | Task 산출물 AI 활용 구조 | 현재 스펙/릴리즈 문서에 AI 생성·검수·가이드의 API/UX 수용 기준이 없음 | 미달성 |
| KR 2.1-Notes AI 초안 | Task 맥락 기반 AI 문서 초안 | 구현 근거(엔드포인트/화면/지표) 미확인 | 미달성 |
| KR 2.1-Template AI 검수 | Output 목적/검수 기준 기반 AI 평가 | inspection_criteria를 AI가 판정하는 실행 규약 부재 | 미달성 |
| W4 | 관계 규칙 기반 변경 인지 | hierarchy/related/derived_from 기반 영향 전파는 방향성 존재(Release 3 의존성/영향 블록) | 부분달성 |
| KR 2.2-실행 시점 인지 | Task 열람/전이 시 상위 변경 인지 마커 | 변경 마커(🟡) 및 Pull 인지 규칙의 명시적 수용 기준 부재 | 미달성 |
| KR 2.2-신규 액션만 Push | 알람 폭주 없이 신규 할 일만 유입 | Inbox 라우팅은 존재하나 "변경 유발 신규 액션 한정" 규칙은 미확정 | 부분달성 |

## 종합 판정

| Objective | 판정 | 근거 요약 |
| --- | --- | --- |
| Objective 1 (MVP 1) | 달성 | 형상화/정형화/멘션/알람 분류/합의·승인 Gate/자동 판정 지표까지 O1 루프를 구성하는 핵심 구현 완료 |
| Objective 2 (MVP 2) | 미달성 | AI 생성·검수·가이드 핵심 기능 근거 부재. 변경 인지는 일부 기반만 존재하고 운영 규칙/수용 기준 미완성 |

## 우선 보강 항목 (구현 순서)

| 우선순위 | 항목 | 완료 조건 |
| --- | --- | --- |
| P1 | KR 2.1 AI 기능 명세/구현 | AI 초안 생성, AI 검수, Template->AI Context 주입의 API+UI+지표 확정 |
| P2 | KR 2.2 변경 인지 모델 고정 | 실행 시점 인지 마커, 신규 액션 한정 Push, 전파 depth 규칙 수용 기준 확정 |
| P3 | O1 Retention 운영 고도화 | 현행 자동 판정 지표(Alarm->Action, 구조 갱신률, 자발 재방문율)의 임계치/운영 리포트 고도화 |
