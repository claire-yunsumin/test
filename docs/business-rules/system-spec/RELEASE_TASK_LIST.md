# Release Task List

이 문서는 `RELEASE_1_SPEC.md` ~ `RELEASE_4_SPEC.md`를 실행 가능한 하위 태스크로 분해한 백로그입니다.

## 사용 규칙

- 상태값: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`
- 우선순위: `P0`(필수), `P1`(중요), `P2`(개선)
- 트랙: `기획`, `디자인`, `개발`, `QA`
- 모든 태스크는 완료 시 체크리스트 `DoD`를 충족해야 합니다.

## 공통 DoD (Definition of Done)

- 기획: 요구사항, 범위 제외 항목, 예외사항이 문서에 반영됨
- 디자인: 기본/오류/빈 상태/권한 상태가 모두 설계됨
- 개발: API/클라이언트/권한/로그가 스펙과 일치함
- QA: 정상/예외/권한/회귀 테스트 케이스 통과

## 디자이너 산출물 기준 (화면/컴포넌트/아이콘)

디자인 태스크는 아래 산출물을 반드시 포함합니다.

- 화면 산출물: IA 위치, 화면명, 주요 사용자 목표, 진입/이탈 경로
- 컴포넌트 산출물: 상태(`default`, `hover`, `focus`, `disabled`, `error`, `empty`, `loading`)
- 아이콘 산출물: 의미, 노출 위치, 크기(`16/20/24`), 컬러 토큰, 툴팁 문구
- 인터랙션 산출물: 클릭/키보드 동작, 성공/실패 피드백, 권한 제한 시 동작
- 핸드오프 산출물: spacing/token, 텍스트 규칙, 예외 케이스 캡처, QA 체크포인트

## 릴리즈별 디자이너 작업 맵

### Release 1 (권한/가시성)

- 화면: 태스크 상세 read-only 상태, 인증 실패 화면, 권한 차단 화면
- 컴포넌트: 비활성 입력 필드, 권한 안내 배너, 에러 패널, 재시도 버튼
- 아이콘: 잠금(`lock`), 경고(`alert-triangle`), 정보(`info`)
- 디자이너 DoD: "조회 가능/수정 불가"를 사용자가 1초 내 인지 가능해야 함

### Release 2 (협업)

- 화면: 우측 논의 탭, 변경 기록 탭, 노트 카드(접힘/펼침), 스레드 composer
- 컴포넌트: 멘션 검색 메뉴, 노트 태그 칩, 링크 변환 피드백 토스트/힌트
- 아이콘: 멘션(`at-sign`), 노트 참조(`hash`), 링크 복사(`link-2`), 상태(`clock`)
- 디자이너 DoD: `@`/`#` 흐름이 마우스/키보드 모두에서 끊기지 않아야 함

### Release 3 (형상화/정형화)

- 화면: FREEFORM 편집 상태, TEMPLATED 편집 상태, 우측 미니맵+의존성/전파 영향 영역
- 컴포넌트: 리치에디터 툴바, 블록 추가 메뉴, 미니맵 노드, 의존성/영향 리스트 아이템
- 아이콘: 블록 추가(`plus`), 이미지(`image`), 의존성(`git-branch`), 영향도(`signal`)
- 디자이너 DoD: 미니맵 아래 영향 블록에서 "선행/후행/전파범위"를 즉시 읽을 수 있어야 함

### Release 4 (운영)

- 화면: 승인정책 관리, 알림 설정, Inbox 대량 액션, 분석 카드
- 컴포넌트: 정책 라인 편집 행, 토글 그룹, read-all 확인 다이얼로그, fallback 배너
- 아이콘: 승인(`check-circle`), 리마인드(`bell`), 관리자 위험 액션(`shield-alert`)
- 디자이너 DoD: 위험 액션과 일반 액션의 시각적 우선순위가 명확히 분리되어야 함

## 디자인 태스크 카드 템플릿 (필수 필드)

- 대상 화면: (예: `Task Detail Right Panel`)
- 대상 컴포넌트: (예: `TaskContextMiniMap`, `DependencyImpactPanel`)
- 대상 아이콘: 이름/용도/상태별 색상
- 상태 스펙: default/hover/focus/disabled/error/empty/loading
- 카피 스펙: 제목/보조문구/툴팁/오류문구
- 접근성 스펙: 키보드 동선, aria label, 명도 대비
- 핸드오프 링크: Figma frame, 컴포넌트 라이브러리, 토큰 정의

---

## Release 1 - 인증/권한/가시성/기본 CRUD

### R1-기획

- [ ] `R1-PLN-01` (`P0`, `TODO`) 권한 매트릭스 확정 (MEMBER/OWNER/ADMIN/SUPER_ADMIN x CRUD)
  - Depends on: 없음
  - DoD: 역할별 가능한 액션과 금지 액션이 한 표로 정리됨
- [ ] `R1-PLN-02` (`P0`, `TODO`) 공통 오류 메시지 가이드 확정 (`401`, `403`, validation)
  - Depends on: `R1-PLN-01`
  - DoD: 사용자 노출 문구/원인/권장 액션이 정의됨

### R1-디자인

- [ ] `R1-DSN-01` (`P0`, `TODO`) read-only 상세 화면 패턴 설계 (watcher, parent-chain viewer)
  - Depends on: `R1-PLN-01`
  - DoD: 편집 비활성 상태와 사유 문구가 컴포넌트 단위로 정의됨
- [ ] `R1-DSN-02` (`P1`, `TODO`) 인증 실패/권한 실패 에러 상태 UI 설계
  - Depends on: `R1-PLN-02`
  - DoD: 실패 상태별 재시도/이동 액션이 포함됨
- [ ] `R1-DSN-03` (`P1`, `TODO`) 권한 상태 아이콘 세트 및 사용 규칙 정의
  - Depends on: `R1-DSN-01`
  - DoD: lock/alert/info 아이콘의 위치, 크기, 색상 토큰, 툴팁 문구가 정리됨

### R1-개발

- [ ] `R1-DEV-01` (`P0`, `TODO`) 인증 미들웨어 및 역할 검사 강제
  - Depends on: `R1-PLN-01`
  - DoD: `/health` 제외 전 API 인증 검증이 일관 동작
- [ ] `R1-DEV-02` (`P0`, `TODO`) visible task 계산 + parent chain 조회 정책 반영
  - Depends on: `R1-DEV-01`
  - DoD: 가시성 밖 리소스 차단(`403`)과 데이터 미노출 보장
- [ ] `R1-DEV-03` (`P0`, `TODO`) watcher/read-only 사용자의 수정 요청 서버 차단
  - Depends on: `R1-DEV-02`
  - DoD: title/assignee/watcher/parent/form 수정 차단 검증 완료
- [ ] `R1-DEV-04` (`P1`, `TODO`) 공통 에러 응답 포맷 통일 (`error`, `requestId`, `issues`)
  - Depends on: `R1-DEV-01`
  - DoD: 주요 엔드포인트에서 동일 포맷 반환

### R1-QA

- [ ] `R1-QA-01` (`P0`, `TODO`) 역할별 CRUD 권한 테스트 스위트 작성/갱신
  - Depends on: `R1-DEV-03`
  - DoD: 역할별 허용/차단 케이스 통과
- [ ] `R1-QA-02` (`P1`, `TODO`) 인증 만료/직접 URL 접근/동시 수정 엣지케이스 검증
  - Depends on: `R1-DEV-04`
  - DoD: 엣지케이스 3종 회귀 테스트 통과

---

## Release 2 - 협업(노트/멘션/스레드/타임라인/Inbox)

### R2-기획

- [ ] `R2-PLN-01` (`P0`, `TODO`) 멘션/노트 참조 정책 확정 (`INVALID_NOTE_REFERENCE`, `INVALID_MENTION`)
  - Depends on: 없음
  - DoD: 참조 허용 범위/실패 조건이 예시 포함 문서화됨
- [ ] `R2-PLN-02` (`P1`, `TODO`) 노트 태그 분류 체계/명명 규칙 확정
  - Depends on: 없음
  - DoD: 기본 태그셋, 자유입력 정책, 중복 처리 규칙 정의

### R2-디자인

- [ ] `R2-DSN-01` (`P0`, `TODO`) 스레드 composer `@`/`#` 검색 및 토큰 삽입 UX 설계
  - Depends on: `R2-PLN-01`
  - DoD: 키보드 탐색/선택/취소 동작이 포함됨
- [ ] `R2-DSN-02` (`P0`, `TODO`) 노트 카드 접힘/펼침 + 태그/메타 정보 설계
  - Depends on: `R2-PLN-02`
  - DoD: 중복 정보 노출 없이 요약/본문 상태가 분리됨
- [ ] `R2-DSN-03` (`P1`, `TODO`) 노트 링크 복사 후 스레드 붙여넣기 참조 변환 피드백 설계
  - Depends on: `R2-DSN-01`
  - DoD: 성공/실패 피드백 문구와 상태가 정의됨
- [ ] `R2-DSN-04` (`P1`, `TODO`) 협업 아이콘 세트(멘션/노트/링크/타임라인) 가이드 정의
  - Depends on: `R2-DSN-02`
  - DoD: 아이콘별 의미 충돌 없이 화면별 매핑표가 제공됨

### R2-개발

- [ ] `R2-DEV-01` (`P0`, `TODO`) 댓글 저장 시 멘션/노트 참조 서버 검증
  - Depends on: `R2-PLN-01`
  - DoD: invalid 케이스에서 정확한 에러 코드 반환
- [ ] `R2-DEV-02` (`P0`, `TODO`) 노트 `tags` 생성/수정/조회 API 및 타입 반영
  - Depends on: `R2-PLN-02`
  - DoD: 생성/수정/조회 전 경로에서 tags 일관 동작
- [ ] `R2-DEV-03` (`P1`, `TODO`) 노트 링크 붙여넣기 -> `#노트` 참조 변환 로직 적용
  - Depends on: `R2-DEV-01`
  - DoD: 지원 URL 패턴/실패 fallback 처리 완료
- [ ] `R2-DEV-04` (`P1`, `TODO`) 노트/댓글 삭제 시 참조 표시 상태(삭제됨/접근불가) 처리
  - Depends on: `R2-DEV-01`
  - DoD: 과거 스레드 문맥이 깨지지 않도록 표시 규칙 반영

### R2-QA

- [ ] `R2-QA-01` (`P0`, `TODO`) 멘션/노트 참조 검증 시나리오 테스트
  - Depends on: `R2-DEV-01`
  - DoD: 가시성 내/외, 삭제됨, 권한변경 케이스 통과
- [ ] `R2-QA-02` (`P1`, `TODO`) 노트 태그 CRUD + 링크 변환 E2E 테스트
  - Depends on: `R2-DEV-03`
  - DoD: 작성/수정/삭제/붙여넣기 사용자 흐름 통과

---

## Release 3 - 형상화/정형화 루프(FREEFORM/TEMPLATED)

### R3-기획

- [ ] `R3-PLN-01` (`P0`, `TODO`) FREEFORM vs TEMPLATED 편집 정책 확정
  - Depends on: 없음
  - DoD: 상태 전환 시 데이터 유지/초기화 규칙 문서화
- [ ] `R3-PLN-02` (`P0`, `TODO`) 첨부/노트 기본 섹션 유지 원칙 및 예외 정책 확정
  - Depends on: 없음
  - DoD: 폼 블록 흡수 금지, 참조 표현 허용 원칙이 명시됨

### R3-디자인

- [ ] `R3-DSN-01` (`P0`, `TODO`) 리치에디터(설명/노트) 공통 컴포넌트 UX 설계
  - Depends on: `R3-PLN-01`
  - DoD: 툴바/미리보기/업로드 중 상태/실패 복구 정의
- [ ] `R3-DSN-02` (`P0`, `TODO`) FREEFORM 블록 추가 메뉴 및 카드 편집 UX 설계
  - Depends on: `R3-PLN-01`
  - DoD: 블록 타입별 입력/검증/빈 상태가 정의됨
- [ ] `R3-DSN-03` (`P1`, `TODO`) 우측 1-depth 미니맵 시각 규칙 설계
  - Depends on: `R3-PLN-02`
  - DoD: 루트/리프/비가시 노드/점선-실선 규칙 포함
- [ ] `R3-DSN-04` (`P1`, `TODO`) 미니맵 하단 의존성/전파 영향 블록 설계
  - Depends on: `R3-DSN-03`
  - DoD: 요약 메트릭(선행/후행/전파범위), 목록, empty/권한 상태가 정의됨
- [ ] `R3-DSN-05` (`P1`, `TODO`) Task Detail 우측 패널 UI 스펙 시트 작성 (미니맵+영향블록+탭)
  - Depends on: `R3-DSN-04`
  - DoD: 화면 구조도, 컴포넌트 트리, 아이콘 배치, 상태별 캡처가 하나의 시트로 정리됨

### R3-개발

- [ ] `R3-DEV-01` (`P0`, `TODO`) `__task_description` 리치에디터 및 마크다운 렌더링 반영
  - Depends on: `R3-DSN-01`
  - DoD: 편집/미리보기/저장 전 경로 정상 동작
- [ ] `R3-DEV-02` (`P0`, `TODO`) 이미지 붙여넣기 업로드 + 본문 참조 토큰 삽입
  - Depends on: `R3-DEV-01`
  - DoD: 단일/연속 붙여넣기, 실패 재시도, 롤백 처리 완료
- [ ] `R3-DEV-03` (`P0`, `TODO`) FREEFORM 블록형 Form Output 생성/수정/삭제 구현
  - Depends on: `R3-DSN-02`
  - DoD: 블록 CRUD와 렌더링 일관성 보장
- [ ] `R3-DEV-04` (`P0`, `TODO`) 레거시 파일 필드(`__task_files`, `FILE`) 저장 시 제거
  - Depends on: `R3-PLN-02`
  - DoD: task/template 저장 경로 전반에서 재유입 방지
- [ ] `R3-DEV-05` (`P1`, `TODO`) 우측 맥락 미니맵 렌더링/네비게이션 구현
  - Depends on: `R3-DSN-03`
  - DoD: 노드 클릭 이동, head/tail 인지, 권한 비가시 대응 처리
- [ ] `R3-DEV-06` (`P1`, `TODO`) 미니맵 바로 아래 의존성/전파 영향 패널 구현
  - Depends on: `R3-DSN-04`
  - DoD: 선행/후행/전파범위 계산 및 클릭 이동, 레이아웃 고정 반영
- [ ] `R3-DEV-07` (`P1`, `TODO`) 우측 패널 레이아웃/스크롤 충돌 정리
  - Depends on: `R3-DEV-06`
  - DoD: 우측 패널의 관계 섹션/탭/콘텐츠가 잘림 없이 모두 보이고 탭과 콘텐츠 사이 여백 없이 연결됨

### R3-QA

- [ ] `R3-QA-01` (`P0`, `TODO`) FREEFORM/TEMPLATED 전환 및 데이터 보존 테스트
  - Depends on: `R3-DEV-03`
  - DoD: 전환 시 초기화/보존 정책 일치 확인
- [ ] `R3-QA-02` (`P0`, `TODO`) 이미지 붙여넣기 업로드 예외 테스트
  - Depends on: `R3-DEV-02`
  - DoD: 실패/대용량/연속 입력 케이스 통과
- [ ] `R3-QA-03` (`P1`, `TODO`) 미니맵 표시/탐색/권한 엣지케이스 테스트
  - Depends on: `R3-DEV-05`
  - DoD: 루트/리프/비가시 노드 시나리오 통과
- [ ] `R3-QA-04` (`P1`, `TODO`) 의존성/전파 영향 패널 계산 정확도 테스트
  - Depends on: `R3-DEV-06`
  - DoD: 선행 없음/후행 없음/다단계 전파/권한 축소 케이스 통과
- [ ] `R3-QA-05` (`P1`, `TODO`) 우측 패널 스크롤/겹침 회귀 테스트
  - Depends on: `R3-DEV-07`
  - DoD: 다양한 화면 높이에서 미니맵/의존성/탭/댓글/타임라인이 잘림/겹침 없이 연속 노출됨

---

## Release 4 - 운영 고도화(승인정책/알림/분석/관리)

### R4-기획

- [ ] `R4-PLN-01` (`P0`, `TODO`) 승인정책 lifecycle 정의 (생성/수정/삭제/참조중 제약)
  - Depends on: 없음
  - DoD: 정책 삭제/교체 시나리오와 영향 범위가 정의됨
- [ ] `R4-PLN-02` (`P1`, `TODO`) 분석 지표 해석 가이드 및 경고 문구 확정
  - Depends on: 없음
  - DoD: 지표 정의, 집계 지연 시 fallback 메시지 문구 확정

### R4-디자인

- [ ] `R4-DSN-01` (`P0`, `TODO`) 승인정책 관리 화면 정보 계층 설계
  - Depends on: `R4-PLN-01`
  - DoD: 범위(글로벌/유닛)와 라인 규칙이 시각적으로 구분됨
- [ ] `R4-DSN-02` (`P0`, `TODO`) 알림 설정/Inbox read-ack-remind 상태 피드백 설계
  - Depends on: 없음
  - DoD: 대량 액션(read-all) 영향 범위가 명확히 표시됨
- [ ] `R4-DSN-03` (`P1`, `TODO`) 분석 카드/지연 fallback/권한 변경 상태 설계
  - Depends on: `R4-PLN-02`
  - DoD: 데이터 최신 시각과 fallback 상태가 구분됨
- [ ] `R4-DSN-04` (`P1`, `TODO`) 운영/위험 액션 아이콘 및 강조 규칙 정의
  - Depends on: `R4-DSN-01`
  - DoD: 일반 액션과 위험 액션의 색상/아이콘/버튼 위계가 문서화됨

### R4-개발

- [ ] `R4-DEV-01` (`P0`, `TODO`) 승인정책 CRUD 및 참조중 삭제 제약 구현
  - Depends on: `R4-PLN-01`
  - DoD: 참조중 정책 삭제 차단 또는 교체 플로우 동작
- [ ] `R4-DEV-02` (`P0`, `TODO`) 알림 설정/Push subscription CRUD 정합성 구현
  - Depends on: `R4-DSN-02`
  - DoD: 중복 등록/만료 토큰 idempotent 처리
- [ ] `R4-DEV-03` (`P0`, `TODO`) Inbox read/ack/remind/read-all 권한/범위 보장
  - Depends on: `R4-DEV-02`
  - DoD: read-all이 본인 Inbox만 변경함을 보장
- [ ] `R4-DEV-04` (`P1`, `TODO`) retention analytics 계산/지연 fallback 처리
  - Depends on: `R4-PLN-02`
  - DoD: API 응답에 최신 집계 시각과 상태가 포함됨

### R4-QA

- [ ] `R4-QA-01` (`P0`, `TODO`) 승인정책 CRUD + 참조중 삭제 제약 테스트
  - Depends on: `R4-DEV-01`
  - DoD: 정책 참조/비참조 경로 모두 통과
- [ ] `R4-QA-02` (`P0`, `TODO`) Inbox 대량 액션/권한 변경/동시성 테스트
  - Depends on: `R4-DEV-03`
  - DoD: read-all 범위/권한 변경 실시간 반영 검증
- [ ] `R4-QA-03` (`P1`, `TODO`) 분석 API 값-UI 표시 일치 회귀 테스트
  - Depends on: `R4-DEV-04`
  - DoD: 지연 fallback 포함 전 시나리오 통과

---

## 추천 실행 순서

1. `Release 1` P0 전체 완료 (권한/가시성 기반)
2. `Release 2` P0 완료 (협업 무결성)
3. `Release 3` P0 완료 (작성 생산성/구조화)
4. `Release 4` P0 완료 (운영 안정화)
5. 각 릴리즈별 P1/P2를 병렬 개선

## 운영 팁

- 스프린트 보드 컬럼 예시: `TODO -> READY -> IN_PROGRESS -> REVIEW -> QA -> DONE`
- 태스크 카드 템플릿에 다음 3개를 고정합니다.
  - 구현 범위(In/Out)
  - 엣지케이스 체크 항목
  - 테스트 증적(스크린샷/로그/케이스 링크)
