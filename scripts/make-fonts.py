#!/usr/bin/env python3
"""소개 페이지·카드뉴스 제목용 명조 글꼴을 "쓰는 글자만" 뽑아 작게 만든다(intro/fonts/emv-serif.woff2).

- 원본: Noto Serif KR Bold(SIL OFL 1.1). 페이지 글자를 고치면 다시 돌린다 — 새 글자가 빠지면 그 글자만 다른 글꼴로 보임.
- OFL에 따라 고친(부분만 뽑은) 글꼴은 이름을 바꿔 "EMV Serif"로 내고, 라이선스(intro/fonts/OFL.txt)를 같이 둔다.
- 원본 글꼴 파일은 저장소에 넣지 않는다(8MB) — dist/font-src/에 받아 둠(dist/는 .gitignore).
  카드 이미지(intro/cards/render.js)를 찍을 때 쓰는 Pretendard도 여기로 받는다(이미지에만 쓰고 배포하지 않음).
사용: python3 scripts/make-fonts.py   (처음 한 번은 인터넷 필요 · pip install fonttools brotli)
"""
import os, sys, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist', 'font-src')
OUT = os.path.join(ROOT, 'intro', 'fonts', 'emv-serif.woff2')
PAGES = ['intro/index.html', 'intro/cards/index.html']
FETCH = {
    'NotoSerifKR-Bold.otf': 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/SubsetOTF/KR/NotoSerifKR-Bold.otf',
    **{f'Pretendard-{w}.otf': f'https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/public/static/Pretendard-{w}.otf'
       for w in ['Regular', 'SemiBold', 'Bold', 'ExtraBold', 'Black']},
}

def fetch():
    os.makedirs(SRC, exist_ok=True)
    for name, url in FETCH.items():
        p = os.path.join(SRC, name)
        if not os.path.exists(p):
            print('받는 중', name)
            urllib.request.urlretrieve(url, p)

def main():
    fetch()
    chars = set()
    for p in PAGES:
        chars |= set(open(os.path.join(ROOT, p), encoding='utf-8').read())
    chars |= set('0123456789-·.,:;!?()[]“”‘’"\' →←·…%/+#')  # 날짜·숫자는 스크립트가 채우므로 늘 넣는다
    text = ''.join(sorted(c for c in chars if ord(c) >= 32))
    font = TTFont(os.path.join(SRC, 'NotoSerifKR-Bold.otf'))
    cmap = font.getBestCmap()
    missing = [c for c in text if ord(c) > 127 and ord(c) not in cmap and not c.isspace()]
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    # OFL: 고친 글꼴은 원래 이름을 쓰지 않는다
    for rec in font['name'].names:
        if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22):
            new = {1: 'EMV Serif', 3: 'EMV Serif Bold subset', 4: 'EMV Serif Bold', 6: 'EMVSerif-Bold', 16: 'EMV Serif', 17: 'Bold', 21: 'EMV Serif', 22: 'Bold'}[rec.nameID]
            rec.string = new
    font.save(OUT)
    print('만듦:', os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024, 'KB ·', sum(1 for c in text if ord(c) > 127), '글자')
    if missing:
        print('원본 글꼴에 없는 글자(다른 글꼴로 보임):', ''.join(missing[:40]))

if __name__ == '__main__':
    sys.exit(main())
