#!/usr/bin/env bash
# 웹(claude.ai 페이지)에 올릴 사본을 dist/web/에 만든다.
# 올리는 곳이 <!doctype>·<html>·<head>·<body> 틀을 직접 씌우므로 index.html에서 그 태그만 빼고, vendor/는 그대로 복사.
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/web
rm -rf "$out" && mkdir -p "$out"
sed -E '/^<!doctype html>$/Id; /^<\/?html( [^>]*)?>$/d; /^<\/?head>$/d; /^<\/?body>$/d; /^<meta (charset|name="viewport")/d' index.html > "$out/index.html"
cp -r vendor "$out/vendor"
# SheetJS 번들의 문자표 문자열에 제어 문자(ESC 등)·U+FFFD가 날것으로 들어 있어 업로드가 거절됨 → \uXXXX 표기로 바꿈(문자열 안이라 뜻은 같음)
python3 - "$out"/vendor/*/*-bundle.js <<'PY'
import re, sys
for p in sys.argv[1:]:
    s = open(p, encoding='utf-8').read()
    t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffd]', lambda m: '\\u%04x' % ord(m.group()), s)
    if t != s: open(p, 'w', encoding='utf-8').write(t)
PY
# 들어갈 때 비밀번호(선택): WEB_PW_HASH=<sha256("excel-moa:" + 비밀번호)의 16진수> bash scripts/make-web.sh
# 비밀번호도 해시도 저장소에 넣지 않는다 — 올리는 사본에만(scripts/web-gate.html). 가벼운 장치일 뿐이다: 페이지 코드는 받아 볼 수 있고,
# 짧은 비밀번호는 해시에서 거꾸로 맞혀 볼 수 있다. 그래서 이 페이지엔 가짜 데이터만 둔다(실제 데이터는 PC 안에서만 다룸).
if [ -n "${WEB_PW_HASH:-}" ]; then
  python3 - "$out/index.html" "$WEB_PW_HASH" scripts/web-gate.html <<'PY'
import sys
p, h, g = sys.argv[1], sys.argv[2].strip().lower(), sys.argv[3]
assert len(h) == 64 and all(c in '0123456789abcdef' for c in h), 'WEB_PW_HASH는 sha256 16진수 64글자'
s = open(p, encoding='utf-8').read()
gate = open(g, encoding='utf-8').read().replace('__HASH__', h)
anchor = '<header class="top">'
assert s.count(anchor) == 1
open(p, 'w', encoding='utf-8').write(s.replace(anchor, gate + anchor))
PY
  echo "비밀번호 화면 넣음"
fi
echo "만듦: $out/index.html (+ vendor/)"
