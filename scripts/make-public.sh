#!/usr/bin/env bash
# 공개 체험판(kery27/excel-jsgg, GitHub Pages)에 올릴 모양을 dist/public/에 만든다.
#   /            소개 페이지(intro/index.html — 업종별 장면, "이 장면 직접 해 보기"는 app/?demo=1&q=…)
#   /app/        엑셀 모아보기(make-site.sh 결과: index.html + vendor/)
#   /cards/      카드뉴스 9장(intro/cards/ — 넘겨 보기 + img/card-0N.png, 소개 페이지 링크 미리보기 그림)
#   /README.md   공개용 설명(intro/README-public.md)
# 사용: bash scripts/make-public.sh   (올리기는 scripts/publish-public.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/public
SITE_URL=https://kery27.github.io/excel-jsgg/app/ INTRO_URL=../ bash scripts/make-site.sh >/dev/null
rm -rf "$out" && mkdir -p "$out/app"
cp -r dist/site/. "$out/app/"
cp intro/index.html "$out/index.html"
# 카드뉴스(웹 넘겨 보기 + 1080×1080 이미지 — 이미지는 intro/cards/render.js로 만들어 커밋해 둔 것)
mkdir -p "$out/cards/img"
cp intro/cards/index.html "$out/cards/index.html"
cp intro/cards/img/card-*.png "$out/cards/img/"
cp intro/README-public.md "$out/README.md"
touch "$out/.nojekyll"
echo "만듦: $out/ (소개 index.html + app/ + README.md)"
