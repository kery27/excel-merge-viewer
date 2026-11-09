#!/usr/bin/env bash
# 공개 체험판(kery27/excel-jsgg, GitHub Pages)에 올릴 모양을 dist/public/에 만든다.
#   /            소개 페이지(intro/index.html — 업종별 장면, "이 장면 직접 해 보기"는 app/?demo=1&q=…)
#   /app/        엑셀 모아보기(make-site.sh 결과: index.html + vendor/)
#   /README.md   공개용 설명(intro/README-public.md)
# 사용: bash scripts/make-public.sh   (올리기는 scripts/publish-public.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/public
SITE_URL=https://kery27.github.io/excel-jsgg/app/ INTRO_URL=../ bash scripts/make-site.sh >/dev/null
rm -rf "$out" && mkdir -p "$out/app"
cp -r dist/site/. "$out/app/"
cp intro/index.html "$out/index.html"
cp intro/README-public.md "$out/README.md"
touch "$out/.nojekyll"
echo "만듦: $out/ (소개 index.html + app/ + README.md)"
