# 엑셀 모아보기 — 체험판

엑셀 어딘가에 있는데 못 찾아서 손해 보던 일 — 반품 출고일, 이름 잘린 입금, 지난번 단가, 몇 년 전 계약 —
폴더 속 엑셀 수백 개에서 그 줄을 10초 안에 찾고, 흩어진 월별 탭·연도별 파일은 하나로 모아 조건으로 걸러 보는 화면입니다.

- **소개 · 업종별 장면**: https://kery27.github.io/excel-jsgg/
- **바로 써 보기**: https://kery27.github.io/excel-jsgg/app/ — 가짜 회사 폴더로 체험: https://kery27.github.io/excel-jsgg/app/?demo=1
- 설치·서버 없이 브라우저 안에서만 동작합니다. 넣은 엑셀은 이 PC 밖으로 나가지 않아요(서버 전송·외부 CDN 없음).
- 내 폴더 연결(폴더 찾아보기)은 크롬·엣지에서 됩니다.

## 내 PC에서 열기

앱 위쪽의 [오프라인용 내려받기]를 누르거나, 이 저장소를 내려받아(Code → Download ZIP) 압축을 풀고 `app/index.html`을 크롬으로 열면 인터넷 없이도 동작합니다.
`app/vendor/` 폴더가 옆에 있어야 해요.

## 쓰는 라이브러리

`app/vendor/` 안에 그대로 넣어 둠 — [sql.js](https://github.com/sql-js/sql.js)(MIT), [SheetJS Community Edition](https://sheetjs.com)(Apache-2.0). 각 폴더의 `LICENSE` 참고.

문의: [존슨거라지](https://johnsongarage.github.io/#contact)
