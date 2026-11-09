#!/usr/bin/env bash
# 공개 체험판(kery27/excel-jsgg, GitHub Pages)에 지금 index.html을 반영한다.
# 사용: bash scripts/publish-public.sh [공개 저장소 클론 경로(기본 ../excel-jsgg)]
# main에 화면 코드를 올릴 때마다 같이 돌린다(CLAUDE.md "공개 체험판"). 공개 저장소에는 체험판 index.html·vendor/·README만 —
# 개발 이력·문서·CLAUDE.md는 넣지 않는다. 커밋 메시지에 개발 저장소 커밋 번호를 적어 어느 버전인지 추적.
set -euo pipefail
cd "$(dirname "$0")/.."
pub="${1:-../excel-jsgg}"
[ -d "$pub/.git" ] || { echo "공개 저장소 클론이 없어요: $pub"; exit 1; }
if [ -n "$(git status --porcelain -- index.html vendor)" ]; then echo "index.html·vendor에 커밋 안 한 변경이 있어요 — 먼저 커밋하세요"; exit 1; fi
rev=$(git rev-parse --short HEAD)
SITE_URL=https://kery27.github.io/excel-jsgg/ bash scripts/make-site.sh >/dev/null
git -C "$pub" pull -q --ff-only origin main
rm -rf "$pub/vendor" && cp -r dist/site/. "$pub/"
touch "$pub/.nojekyll"
cd "$pub"
if [ -z "$(git status --porcelain)" ]; then echo "공개 체험판: 바뀐 것 없음"; exit 0; fi
git add -A
git commit -qm "체험판 갱신 (개발 저장소 $rev)" ${COMMIT_TRAILER:+-m "$COMMIT_TRAILER"}
git push -q origin main
echo "공개 체험판 갱신: $(git log --oneline -1)"
