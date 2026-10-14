# Daystitch — Visual Life Journal

Habit Tracker에서 피벗한 독립적인 라이프로그 PWA. viva의 아이디어를 분석해 만든 **별도 디자인과 구현**이며 viva 공식 앱이 아닙니다.

## 현재 기능
- 날짜별 기록 생성·수정·삭제
- 9개 활동 카테고리
- 활동 빈도에 따른 월별 패치 집계 (S/M/L/XL)
- 결정적 좌표의 연간 캔버스
- 연도별 전시실
- IndexedDB 오프라인 로컬 저장
- 이전 Habit Tracker `habits.v1` 데이터 감지 (읽기만, 자동 이전 없음)

## 개발
Node.js 20.19+ 또는 22.12+ 권장.
```bash
npm install
npm run dev
npm run test
npm run build
```

## 브랜치 및 데이터 안전
- 기존 습관 트래커는 `main`에 그대로 유지됩니다. 피벗 개발은 `refactor/viva-pivot`에서 진행합니다.
- 새 앱은 `daystitch-db` IndexedDB를 사용하며 기존 `habits.v1` localStorage를 변경하지 않습니다.
- 아직 사진·AI·Apple Health·계정·서버 동기화·구독 기능은 구현되지 않았습니다.
- 사진 원본/메모를 서버로 전송하지 않습니다. 현재 백엔드 자체가 없습니다.

## 배포
GitHub Pages Actions 워크플로는 main 병합 이후 실행되도록 설정되어 있습니다. 저장소 Settings → Pages → Source를 GitHub Actions로 설정해야 합니다. main 병합 전에는 기존 페이지를 유지합니다.

## 다음 단계
1. 레이아웃 충돌 방지 및 자수 SVG 에셋
2. 패치 선택 → 해당 활동 상세 드릴다운
3. 데이터 JSON 내보내기·가져오기 및 백업
4. 사진 첨부 및 이미지 분석 (기기 권한/개인정보 설계)
5. 선택적 서버 동기화 및 AI 분류
