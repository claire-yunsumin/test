# Release 3 Spec

## 목표

Objective 1/KR 1.1의 "형상화 -> 정형화 -> 멘션" 루프를 태스크 운영 화면 안에서 구현합니다.

## 범위

- 자유 노드 생성과 parent 연결
- `FREEFORM`/`TEMPLATED` 구조 상태
- 템플릿 적용과 Form Output 활성화
- unit/folder/list 무결성
- 리스트/보드/백로그/결정 그래프 뷰 탭

## 시스템 요구사항

1. `templateType`과 `templateId`는 nullable이어야 합니다.
2. FREEFORM 태스크는 템플릿 없이 생성/수정/parent 연결이 가능해야 합니다.
3. 템플릿 적용 시 `structureState=TEMPLATED`가 되고 `formValues`가 필드 키 기준으로 초기화됩니다.
4. `unitId`, `folderId`, `listId` 조합은 생성/수정 시 항상 검증합니다.
5. parent 연결은 Work Graph cycle을 만들 수 없습니다.
6. 계층과 결정 그래프는 별도 메뉴가 아니라 태스크 뷰 탭으로 제공됩니다.

## 수용 기준

- 사용자가 자유 노드를 만들고 상위 노드에 연결할 수 있습니다.
- 사용자가 자기 자신 또는 descendant를 parent로 연결하려 하면 저장 전에 실패합니다.
- 반복/규칙이 필요한 노드에 템플릿을 적용해 Form Output을 활성화할 수 있습니다.
- 리스트, 보드, 백로그, 결정 그래프 탭 전환 시 같은 태스크 데이터를 다른 방식으로 볼 수 있습니다.
- 잘못된 folder/list 조합은 저장 전에 실패합니다.
