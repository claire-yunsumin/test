# Release 2 시스템 스펙

## 목표

기본 CRUD 위에 "협업 품질"을 올립니다.  
핵심은 교차 참조 검증, 멘션 정합성, Inbox 라우팅입니다.

## 범위

- 노트 참조(`referencedNoteIds`) 가시성 검증
- 멘션 타입 검증(`MEMBER`, `TASK`, `FORM_FIELD`, `NOTE`)
- 상태 전이(reason 필수) + 타임라인 기록
- 이벤트 기반 Inbox 라우팅(`DECISION`, `DISCUSSION`, `AWARENESS`, `RESULT`)

## 필수 시스템 요구사항

1. 가시 범위 밖 노트 참조는 `INVALID_NOTE_REFERENCE`
2. 유효하지 않은 멘션 대상은 `INVALID_MENTION`
3. 전이 요청은 `reason` 누락 시 실패
4. 전이/협업 이벤트는 타임라인 및 Inbox에 반영

## 수용 기준

- 교차 태스크 참조는 "보이는 태스크" 노트일 때만 성공한다.
- `FORM_FIELD` 멘션은 필드 존재 시에만 허용된다.
- 승인/반려/보완 후 이해관계자가 Inbox 알림을 받는다.
