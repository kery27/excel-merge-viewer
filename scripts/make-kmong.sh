#!/usr/bin/env bash
# 크몽 세팅 상품에서 손님 PC에 넣는 판을 dist/kmong/에 만든다: 엑셀찾기/ 폴더 + 엑셀찾기.zip
# 사용: bash scripts/make-kmong.sh        (시험용으로 커밋 안 한 수정까지 넣으려면 ALLOW_DIRTY=1)
#
# 공개 체험판(make-site.sh)과 다른 점
#   - 맨 위 '체험판' 띠(홈페이지·문의 링크)가 없다 — 크몽은 손님을 크몽 밖 연락으로 이끄는 걸 막는다. 연락처·바깥 주소가 하나도 없어야 함(끝에서 검사).
#   - 폴더 찾아보기만 + 열자마자 찾기 화면(<html class="folderOnly startFolder">). 파일 모아보기는 숨김(의뢰인 동의 전 — CLAUDE.md).
#   - 제목 '엑셀 찾기', 창 아이콘(icon.png)·바탕화면 바로 가기 아이콘(엑셀찾기.ico), 여는 법.txt(끝에 버전 줄).
# 넣는 것은 index.html·vendor/와 scripts/kmong/의 아이콘·여는 법뿐. 문서·테스트·이력은 들어가지 않는다.
# 어느 판을 줬는지는 여는 법.txt 끝의 "버전: 날짜 · 커밋"으로 따진다 (손님이 보는 글이라 브랜치 이름은 넣지 않음).
set -euo pipefail
cd "$(dirname "$0")/.."

name='엑셀찾기'
out=dist/kmong
src=scripts/kmong

dirty=''
if ! git diff --quiet HEAD -- index.html vendor "$src" 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard -- "$src")" ]; then
  if [ "${ALLOW_DIRTY:-}" != 1 ]; then
    echo "index.html·vendor·$src 에 커밋 안 한 수정이 있어요. 커밋한 뒤 다시 만들어 주세요 (시험용이면 ALLOW_DIRTY=1)."; exit 1
  fi
  dirty=' + 커밋 안 한 수정(시험용)'
fi
version="버전: $(date +%Y-%m-%d) · $(git rev-parse --short HEAD)${dirty}"

for f in "$src/icon.png" "$src/$name.ico" "$src/여는 법.txt"; do
  [ -f "$f" ] || { echo "$f 가 없어요 (아이콘은 python3 $src/make-icon.py)"; exit 1; }
done

rm -rf "$out" && mkdir -p "$out/$name"
cp -r vendor "$out/$name/vendor"
cp "$src/icon.png" "$src/$name.ico" "$out/$name/"

python3 - "$out/$name" "$src/여는 법.txt" "$version" <<'PY'
import sys
out, guide, version = sys.argv[1], sys.argv[2], sys.argv[3]
s = open('index.html', encoding='utf-8').read()
def sub(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)
sub('<html lang="ko">', '<html lang="ko" class="folderOnly startFolder">')
sub('<title>엑셀 모아보기</title>', '<title>엑셀 찾기</title>\n<link rel="icon" type="image/png" href="icon.png">')
open(out + '/index.html', 'w', encoding='utf-8').write(s)
# 여는 법: 윈도 메모장에서 그대로 보이게 BOM + CRLF
t = open(guide, encoding='utf-8').read().replace('{{VERSION}}', version)
assert '{{' not in t
open(out + '/여는 법.txt', 'w', encoding='utf-8-sig', newline='').write(t.replace('\r\n', '\n').replace('\n', '\r\n'))
PY

# ---- 검사: 들어간 파일, 바깥으로 이끄는 글 ----
expect=$'index.html\nicon.png\nvendor/sqljs/LICENSE\nvendor/sqljs/sqljs-bundle.js\nvendor/xlsx/LICENSE\nvendor/xlsx/xlsx-bundle.js\n엑셀찾기.ico\n여는 법.txt'
got=$(cd "$out/$name" && find . -type f | sed 's|^\./||' | LC_ALL=C sort)
if [ "$got" != "$(printf '%s\n' "$expect" | LC_ALL=C sort)" ]; then
  echo "들어간 파일이 예상과 달라요:"; echo "$got"; exit 1
fi
for f in "$out/$name/index.html" "$out/$name/여는 법.txt"; do
  # 연락처·바깥 주소·체험판 띠가 있으면 안 됨 (vendor 번들의 라이선스 주소는 제외)
  if grep -nE 'https?://|johnsongarage|instagram|mailto:|tel:|<div class="siteBar"|010-[0-9]' "$f" | head -5 | grep -q .; then
    echo "$f 에 바깥 주소·연락처·체험판 띠가 있어요:"; grep -nE 'https?://|johnsongarage|instagram|mailto:|tel:|<div class="siteBar"|010-[0-9]' "$f" | head -5 | cut -c1-200; exit 1
  fi
done
grep -q '<html lang="ko" class="folderOnly startFolder">' "$out/$name/index.html" || { echo "폴더 찾기 전용 표시가 빠졌어요"; exit 1; }

# ---- zip: 경로는 / 로, 한글 이름은 UTF-8 표시로 (윈도·맥 모두 폴더째 풀리게) ----
python3 - "$out" "$name" <<'PY'
import sys, os, zipfile
out, name = sys.argv[1], sys.argv[2]
root = os.path.join(out, name)
z = os.path.join(out, name + '.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for d, _, files in sorted(os.walk(root)):
        for f in sorted(files):
            p = os.path.join(d, f)
            zf.write(p, name + '/' + os.path.relpath(p, root).replace(os.sep, '/'))
bad = [i.filename for i in zipfile.ZipFile(z).infolist() if '\\' in i.filename]
assert not bad, bad
print('zip: %s (%.1f MB, 파일 %d개)' % (z, os.path.getsize(z) / 1e6, len(zipfile.ZipFile(z).infolist())))
PY
echo "만듦: $out/$name/ · $out/$name.zip"
echo "$version"
