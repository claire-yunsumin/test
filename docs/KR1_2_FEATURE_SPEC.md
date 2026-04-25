# KR 1.2 기능 스펙 표

## 목적

| 항목 | 내용 |
| --- | --- |
| KR | KR 1.2 — Notes 기반 논의, 합의/승인 Gate, 알람 분류로 Action Flow가 반복되는 상태 |
| Unmet Needs 해소 | 논의-결정 흐름 단절 해소 (논의/결정의 구조 귀속) |
| Hook 포지션 | Trigger -> Action -> Investment 재진입 |
| 루프 완결 조건 | 알람 분류 -> Notes 논의 -> 승인/반려/보완 -> Timeline 기록 |

## 기능 스펙 (핵심 축)

| 축 | 기능군 | 필수 기능 스펙 | 입력/행동 | 출력/결과 | 관련 영역 |
| --- | --- | --- | --- | --- | --- |
| A | 알람 분류 (Trigger) | Inbox 4분류(DECISION/DISCUSSION/AWARENESS/RESULT), read/ack/remind/read-all | 이벤트 발생(전이/멘션/완료/변경) | 사용자 기대행동 기준 큐 분배 | Inbox API/UI, Home Queue |
| B | Notes 기반 논의 (Action) | Notes(파일/Rich Text) 귀속, Thread에서 `#노트` 참조, 멘션/참조 검증 | 논의 참여자가 Notes 참조하며 댓글/멘션 작성 | 논의 맥락이 Task 인스턴스에 보존 | Task Detail Discussion, Note/Comment API |
| C | 합의/승인 Gate (Action) | 전이 reason 필수, ApprovalRequest/ApprovalDecision 분리, 승인 정책 기반 승인자 검증, 승인/반려/보완요청 처리 | 승인 요청 생성 또는 검토대기 상태에서 승인 판단 | 결정 결과가 상태전이와 함께 귀속 | Transition/Approval APIs, Approval Policy |
| D | 결정 추적 (증거화) | Timeline 이벤트 기록(누가/언제/왜/근거) | 전이/결정 액션 발생 | 사후 추적 가능한 결정 이력 | Timeline API/UI |

## 알람 4분류 운영 스펙

| 분류 | 사용자 기대행동 | 대표 유입 | 필수 처리 |
| --- | --- | --- | --- |
| DECISION | 즉시 판단 | 승인요청/반려/보완요청 라이프사이클 | read, ack, remind, read-all |
| DISCUSSION | 즉시 의견 교환 | 멘션, 질문, 논의 요청 | read, ack, remind |
| AWARENESS | 상황 인지 | 할당, 상위 변경, 영향 전파 | read 중심 처리 |
| RESULT | 결과 확인 | 승인 완료, 자동화 완료, 종료 알림 | 읽고 종료(필요 시 ack) |

## 승인 라이프사이클 스펙

| 단계 | 상태/행동 | 필수 검증 | 기록 항목 |
| --- | --- | --- | --- |
| 1 | 승인요청 | 대상 Workflow 전이 유효성, reason 존재, 열린 ApprovalRequest 중복 없음 | 요청자, 시각, 사유, policySnapshot |
| 2 | 검토 | 정책 승인자/역할 검증 | 검토자, 참조 Notes |
| 3 | 결정 | 승인/반려/보완요청 중 1개 선택 | 결정 타입, 사유 |
| 4 | 귀속 | 상태전이 반영 + Inbox 라우팅 | 전이 전/후 상태, 수신자 |
| 5 | 추적 | Timeline 저장 | 누가·언제·왜·무엇을 근거로 |

## 기능 요구사항 (체크리스트)

| ID | 요구사항 | 수용 기준 |
| --- | --- | --- |
| KR12-F01 | 알람 분류 일관성 | 이벤트가 4분류 중 하나로 명시 매핑 |
| KR12-F02 | Inbox 처리 완결성 | read/ack/remind/read-all 동작이 API/UI에서 동작 |
| KR12-F03 | Notes 귀속 논의 | 결정 논의 시 Notes 참조 사용 가능 |
| KR12-F04 | 멘션/참조 무결성 | 유효하지 않은 멘션/노트 참조 저장 차단 |
| KR12-F05 | 전이 reason 강제 | 상태전이 요청 시 reason 누락 불가 |
| KR12-F06 | 승인자 검증 | 정책 미충족 사용자 승인 차단 |
| KR12-F07 | 결정 이력 증거화 | Timeline에서 결정 사유/근거 추적 가능 |
| KR12-F08 | 구조 재진입 | 결정 결과가 구조 변경/갱신으로 이어짐 |

## KPI 매핑 (KR 1.2)

| 목표 지표 | 계산 대상 |
| --- | --- |
| Alarm->Action 전환율 | 알람 유입 대비 전이/댓글/결정 액션 비율 |
| Alarm 무시율 | 미처리/장기 미열람 비율 |
| Gate 통과율 | 승인요청 대비 승인/반려/보완 종결 비율 |
| 결정 귀속 완결률 | 요청 -> 결정 -> 상태반영 -> 타임라인 기록 완결 비율 |
| Notes 활용률 | 의사결정 건 중 Notes 참조 포함 비율 |
| 구조 재투자율 | 결정 이후 노드/폼/관계 갱신 발생률 |

## 비범위 (KR 1.2)

| 항목 | 사유 |
| --- | --- |
| Work Graph 형상화/정형화 자체 | KR 1.1 범위 |
| AI 생성/검수 기능 | Objective 2 범위 |
