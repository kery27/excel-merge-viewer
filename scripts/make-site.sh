#!/usr/bin/env bash
# 홈페이지(johnsongarage.github.io)에 올릴 공개 체험판을 dist/site/에 만든다.
# 사용: bash scripts/make-site.sh  → dist/site/ 통째로 홈페이지 저장소의 excel/ 폴더에 복사
# 공개 저장소(kery27/excel-moa, GitHub Pages)용: SITE_URL=https://kery27.github.io/excel-moa/ WEB_PW_HASH=... bash scripts/make-site.sh
#   SITE_URL: 공유용 주소(기본은 홈페이지 excel/). WEB_PW_HASH: 들어갈 때 비밀번호(scripts/make-web.sh와 같은 방식, 선택)
# 바꾸는 것: 검색·공유용 제목·설명, 맨 위 "체험판" 띠(만든 곳 링크). 기능 코드는 index.html 그대로.
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/site
home='https://johnsongarage.github.io/'
rm -rf "$out" && mkdir -p "$out"
cp -r vendor "$out/vendor"
python3 - "$out/index.html" "$home" "${SITE_URL:-}" <<'PY'
import sys
out, home, url = sys.argv[1], sys.argv[2], sys.argv[3] or sys.argv[2] + 'excel/'
s = open('index.html', encoding='utf-8').read()
def sub(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)
desc = '월별 탭·연도별 파일로 흩어진 엑셀을 끌어다 놓으면 하나로 모아 조건으로 바로 걸러 봐요. 설치 없이, 파일은 내 PC 밖으로 나가지 않아요. 가짜 데이터로 바로 체험.'
sub('<title>엑셀 모아보기</title>',
    '<title>엑셀 모아보기 체험 · 존슨거라지</title>\n'
    '<meta name="description" content="' + desc + '">\n'
    '<meta property="og:title" content="엑셀 모아보기 체험 · 존슨거라지">\n'
    '<meta property="og:description" content="' + desc + '">\n'
    '<meta property="og:url" content="' + url + '">')
# 맨 위 띠: 체험판이라는 것과 만든 곳·문의
sub('<header class="top">',
    '<div style="background:var(--accent-soft);color:var(--ink);font-size:13px;padding:8px 20px;display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)">'
    '<span><b>체험판</b> · 가짜 데이터로 눌러 보세요. 내 엑셀을 넣어도 이 PC 밖으로 나가지 않아요.</span>'
    '<a href="' + home + '#contact" style="color:var(--accent);font-weight:700;text-decoration:none;margin-left:auto">우리 회사 엑셀에 맞춰 만들기 문의 →</a></div>\n'
    '<header class="top">')
open(out, 'w', encoding='utf-8').write(s)
PY
if [ -n "${WEB_PW_HASH:-}" ]; then
  python3 - "$out/index.html" "$WEB_PW_HASH" scripts/web-gate.html <<'PY'
import sys
p, h, g = sys.argv[1], sys.argv[2].strip().lower(), sys.argv[3]
assert len(h) == 64 and all(c in '0123456789abcdef' for c in h), 'WEB_PW_HASH는 sha256 16진수 64글자'
s = open(p, encoding='utf-8').read()
gate = open(g, encoding='utf-8').read().replace('__HASH__', h)
open(p, 'w', encoding='utf-8').write(s.replace('<header class="top">', gate + '<header class="top">', 1))
PY
  echo "비밀번호 화면 넣음"
fi
echo "만듦: $out/ (index.html + vendor/) → 홈페이지 저장소 excel/ 에 복사"
