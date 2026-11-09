#!/usr/bin/env bash
# 공개 체험판(kery27/excel-jsgg, GitHub Pages)에 지금 소개 페이지와 앱을 반영한다(모양은 scripts/make-public.sh).
# 사용: bash scripts/publish-public.sh [공개 저장소 클론 경로(기본 ../excel-jsgg)]
# main에 화면 코드를 올릴 때마다 같이 돌린다(CLAUDE.md "공개 체험판"). 공개 저장소에는 소개 페이지·app/(체험판·vendor)·README만 —
# 개발 이력·문서·CLAUDE.md는 넣지 않는다. 커밋 메시지에 개발 저장소 커밋 번호를 적어 어느 버전인지 추적.
set -euo pipefail
cd "$(dirname "$0")/.."
pub="${1:-../excel-jsgg}"
[ -d "$pub/.git" ] || { echo "공개 저장소 클론이 없어요: $pub"; exit 1; }
if [ -n "$(git status --porcelain -- index.html vendor intro)" ]; then echo "index.html·vendor·intro에 커밋 안 한 변경이 있어요 — 먼저 커밋하세요"; exit 1; fi
rev=$(git rev-parse --short HEAD)
bash scripts/make-public.sh >/dev/null
git -C "$pub" pull -q --ff-only origin main
# .git만 남기고 비운 뒤 새 모양으로(예전 루트의 vendor/ 같은 남은 파일이 안 남게)
find "$pub" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r dist/public/. "$pub/"
cd "$pub"
if [ -z "$(git status --porcelain)" ]; then echo "공개 체험판: 바뀐 것 없음"; exit 0; fi
git add -A
git commit -qm "체험판 갱신 (개발 저장소 $rev)" ${COMMIT_TRAILER:+-m "$COMMIT_TRAILER"}
git push -q origin main
echo "공개 체험판 갱신: $(git log --oneline -1)"
