# 습관 트래커 (Habit Tracker)

아이폰 홈 화면에 설치해서 쓰는 간단한 습관 체크 앱입니다. 빌드 과정이 없는 순수 HTML/CSS/JS **PWA**라, GitHub Pages가 그대로 서빙합니다.

## 기능

- 습관 추가 (아이콘·이름·색상 선택)
- 오늘 완료 체크 / 최근 7일 기록 그리드
- 🔥 연속 달성(streak) 표시, 오늘 진행률 링
- 데이터는 폰 안(`localStorage`)에 저장 — 서버·로그인 불필요
- 서비스워커로 오프라인에서도 동작

## 아이폰에 설치하기

1. 사파리에서 배포 주소(GitHub Pages URL)를 엽니다.
2. 하단 **공유 버튼** → **홈 화면에 추가**를 누릅니다.
3. 추가된 아이콘을 누르면 전체화면 앱처럼 실행됩니다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 마크업 + PWA / iOS 메타 태그 |
| `styles.css` | 다크 테마, 노치 안전영역 대응 스타일 |
| `app.js` | 상태 관리, 렌더링, localStorage 저장 |
| `manifest.webmanifest` | 앱 이름·아이콘·standalone 설정 |
| `sw.js` | 오프라인 캐시 서비스워커 |
| `icons/` | 홈 화면 아이콘 (180/192/512) |
| `tools/make_icons.py` | 아이콘 PNG 생성 스크립트 (Pillow 불필요) |

## 로컬 실행

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```
