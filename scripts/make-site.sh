#!/usr/bin/env bash
# 홈페이지(johnsongarage.github.io)에 올릴 공개 체험판을 dist/site/에 만든다.
# 사용: bash scripts/make-site.sh  → dist/site/ 통째로 홈페이지 저장소의 excel/ 폴더에 복사
# 바꾸는 것: 검색·공유용 제목·설명, 맨 위 "체험판" 띠(만든 곳 링크). 기능 코드는 index.html 그대로.
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/site
home='https://johnsongarage.github.io/'
rm -rf "$out" && mkdir -p "$out"
cp -r vendor "$out/vendor"
python3 - "$out/index.html" "$home" <<'PY'
import sys
out, home = sys.argv[1], sys.argv[2]
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
    '<meta property="og:url" content="' + home + 'excel/">')
# 맨 위 띠: 체험판이라는 것과 만든 곳·문의
sub('<header class="top">',
    '<div style="background:var(--accent-soft);color:var(--ink);font-size:13px;padding:8px 20px;display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)">'
    '<span><b>체험판</b> · 가짜 데이터로 눌러 보세요. 내 엑셀을 넣어도 이 PC 밖으로 나가지 않아요.</span>'
    '<a href="' + home + '#contact" style="color:var(--accent);font-weight:700;text-decoration:none;margin-left:auto">우리 회사 엑셀에 맞춰 만들기 문의 →</a></div>\n'
    '<header class="top">')
open(out, 'w', encoding='utf-8').write(s)
PY
echo "만듦: $out/ (index.html + vendor/) → 홈페이지 저장소 excel/ 에 복사"
