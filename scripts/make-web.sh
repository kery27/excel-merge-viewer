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
echo "만듦: $out/index.html (+ vendor/)"
