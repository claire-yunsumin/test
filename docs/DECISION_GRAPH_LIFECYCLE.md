# Decision Graph 데이터 생애주기

## 한 문장 요약

Decision Graph는 별도 저장소가 아니라 태스크 계층, 노트, 스레드, 타임라인, 노트 참조를 프론트에서 그래프 노드/엣지로 투영한 뷰입니다.

## 원천 데이터

- `tasks`: 그래프 노드와 parent hierarchy
- `notes`: 결정 근거와 파일 맥락
- `comments`: 논의 밀도와 note reference
- `timeline`: 결정 이벤트와 referenced note
- `mentions`: 사람/노드/Form field/노트 연결 신호

## 접근 경로

- `/tasks` 화면의 뷰 탭: `리스트`, `보드`, `백로그`, `결정 그래프`
- `/graph`: 그래프 전용 라우트
- Inspector의 액션 신호: 임박/오늘 마감, 근거 없음, 논의 후 결정 없음
- 헤더 breadcrumb에서도 태스크 뷰의 일부처럼 표시됩니다.

## 서버 역할

서버는 그래프 좌표를 만들지 않습니다. 대신 `/api/bootstrap`에서 visible task 범위의 원천 데이터를 반환합니다.

서버가 보장하는 것:

- 사용자 가시성 필터
- 노트 참조와 멘션 정합성
- parentId, template, structureState, activity 직렬화

## 프론트 역할

`DecisionGraphView`가 아래를 계산합니다.

- 노드: task
- 계층 엣지: `parentId`
- 참조 엣지: comment/timeline의 `referencedNoteIds`
- 결정 신호: timeline decision event count
- 맥락 신호: note/comment count
- 스타일: `templateType`, `FREEFORM/TEMPLATED`

## 흐름도

```mermaid
flowchart LR
  A[tasks/notes/comments/timeline] --> B[/api/bootstrap visible filter]
  B --> C[DecisionGraphView]
  C --> D[Task nodes]
  C --> E[parent edges]
  C --> F[note reference edges]
  C --> G[decision/context badges]
  D --> H[SVG graph + inspector]
  E --> H
  F --> H
  G --> H
```

## 운영 의미

- 형상화된 결정 대상이 그래프 노드가 됩니다.
- Template 적용 상태가 정형화 신호가 됩니다.
- 노트/스레드/결정 참조가 쌓일수록 그래프는 의사결정 기억장치가 됩니다.
