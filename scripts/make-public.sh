#!/usr/bin/env bash
# 공개 체험판(johnsongarage/excel-moabogi, GitHub Pages → https://excel.johnsongarage.co.kr/)에 올릴 모양을 dist/public/에 만든다.
#   /            소개 페이지(intro/index.html — 업종별 장면, "이 장면 직접 해 보기"는 app/?demo=1&q=…)
#   /app/        엑셀 모아보기(make-site.sh 결과: index.html + vendor/)
#   /fonts/      제목 명조 글꼴(Noto Serif KR에서 쓰는 글자만, OFL) — intro/fonts/
#   /cards/      카드뉴스 9장(intro/cards/ — 넘겨 보기 + img/card-0N.png, 소개 페이지 링크 미리보기 그림)
#   /README.md   공개용 설명(intro/README-public.md)
#   /CNAME       주소(excel.johnsongarage.co.kr) — publish-public.sh가 매번 저장소를 비우고 다시 채우므로 여기서 꼭 만든다
#                (빠진 채로 올리면 GitHub Pages가 주소 연결을 풀어 버림)
#   /robots.txt, /sitemap.xml  검색 등록용 — 홈페이지(johnsongarage.co.kr)와 주소가 달라 사이트맵도 따로
# 예전 주소 kery27.github.io/excel-jsgg/에는 새 주소로 넘겨주는 페이지만 남긴다(scripts/old-address/, 2026-11-10).
# 사용: bash scripts/make-public.sh   (올리기는 scripts/publish-public.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/public
host=excel.johnsongarage.co.kr
base="https://$host/"
# 소개·카드·README의 공유 주소(og:url 등)가 이 주소와 맞는지 — 주소를 바꾸면 그 파일들도 같이 바꿀 것
for f in intro/index.html intro/cards/index.html intro/README-public.md; do
  grep -q "$base" "$f" || { echo "$f 에 $base 가 없어요(공유 주소 확인)"; exit 1; }
  if grep -qE 'kery27\.github\.io|johnsongarage\.github\.io' "$f"; then echo "$f 에 예전 주소가 남아 있어요"; exit 1; fi
done
SITE_URL="${base}app/" INTRO_URL=../ bash scripts/make-site.sh >/dev/null
rm -rf "$out" && mkdir -p "$out/app"
cp -r dist/site/. "$out/app/"
cp intro/index.html "$out/index.html"
# 제목 명조(쓰는 글자만 뽑은 것 — scripts/make-fonts.py)와 라이선스
mkdir -p "$out/fonts"
cp intro/fonts/emv-serif.woff2 intro/fonts/OFL.txt "$out/fonts/"
# 카드뉴스(웹 넘겨 보기 + 1080×1080 이미지 — 이미지는 intro/cards/render.js로 만들어 커밋해 둔 것)
mkdir -p "$out/cards/img"
cp intro/cards/index.html "$out/cards/index.html"
cp intro/cards/img/card-*.png "$out/cards/img/"
cp intro/README-public.md "$out/README.md"
touch "$out/.nojekyll"
echo "$host" > "$out/CNAME"
printf 'User-agent: *\nAllow: /\n\nSitemap: %ssitemap.xml\n' "$base" > "$out/robots.txt"
printf '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' > "$out/sitemap.xml"
for p in "" cards/ app/; do printf '  <url><loc>%s%s</loc></url>\n' "$base" "$p" >> "$out/sitemap.xml"; done
echo '</urlset>' >> "$out/sitemap.xml"
echo "만듦: $out/ (소개 index.html + app/ + cards/ + README.md + CNAME → $base)"
