#!/usr/bin/env bash
# 크몽 이미지 HTML → PNG (2배 해상도). 사용: bash marketing/kmong/render.sh [이름...]
# 크기: 메인 652x488(크몽 썸네일 4:3), 상세 860 폭.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
declare -A SIZE=( [main]=652,488 [detail1]=860,1240 [detail2]=860,1180 [detail3]=860,1300 [detail4]=860,1370 )
mkdir -p out
names=("$@"); [ ${#names[@]} -eq 0 ] && names=(main detail1 detail2 detail3 detail4)
for n in "${names[@]}"; do
  url="file:///$(cygpath -m "$PWD/$n.html")"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --virtual-time-budget=6000 --window-size="${SIZE[$n]}" --screenshot="$(cygpath -w "$PWD/out/$n.png")" "$url" 2>/dev/null
  echo "out/$n.png (${SIZE[$n]} x2)"
done
