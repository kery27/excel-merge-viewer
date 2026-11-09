// 카드뉴스 이미지 만들기: intro/cards/index.html?render=N 을 1080×1080으로 찍어 intro/cards/img/card-0N.png 로.
// 실행: node intro/cards/render.js   (Playwright + Chromium 필요. 카드 글을 고치면 다시 돌리고 이미지도 같이 커밋)
// 이미지는 SNS·카톡에 올리는 용도이고, 공개 체험판의 /cards/img/ 에도 그대로 올라가 링크 미리보기(og:image)로 쓰인다.
// 본문 고딕은 Pretendard로 찍는다 — dist/font-src/Pretendard-*.otf(scripts/make-fonts.py가 받아 둠)가 있으면 찍을 때만 끼워 넣음.
// (글꼴 파일은 배포하지 않음. 없으면 이 PC의 기본 고딕으로 찍히고 경고만 낸다.)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const here = __dirname;
  const out = path.join(here, 'img');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  const url = 'file://' + encodeURI(path.join(here, 'index.html'));
  const fontDir = path.join(here, '..', '..', 'dist', 'font-src');
  const weights = { Regular: 400, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };
  const faces = Object.entries(weights).filter(([w]) => fs.existsSync(path.join(fontDir, 'Pretendard-' + w + '.otf')))
    .map(([w, n]) => '@font-face{font-family:"Pretendard";src:url("file://' + encodeURI(path.join(fontDir, 'Pretendard-' + w + '.otf')) + '");font-weight:' + n + ';}').join('');
  if (!faces) console.warn('Pretendard가 없어 기본 고딕으로 찍어요 — python3 scripts/make-fonts.py 로 받아 두면 Pretendard로 찍힘');
  await p.goto(url);
  const n = await p.$$eval('.slide', x => x.length);
  for (let i = 1; i <= n; i++) {
    await p.goto(url + '?render=' + i);
    if (faces) await p.addStyleTag({ content: faces });
    await p.evaluate(async () => { await document.fonts.ready; [...document.fonts].forEach(f => f.load()); await document.fonts.ready; });
    const serifOk = await p.evaluate(() => document.fonts.check('700 20px "EMV Serif"'));
    if (!serifOk) throw new Error('제목 명조(EMV Serif)를 못 불러옴 — intro/fonts/emv-serif.woff2 확인');
    const card = await p.$('.slide:not([hidden]) .card');
    const box = await card.boundingBox();
    if (Math.round(box.width) !== 1080 || Math.round(box.height) !== 1080) throw new Error('카드 크기가 1080이 아님: ' + JSON.stringify(box));
    // 글자가 카드 밖으로 넘치지 않았는지(넘치면 이미지에서 잘림)
    const over = await card.evaluate(c => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('*')].filter(e => { const q = e.getBoundingClientRect(); return q.width && (q.bottom > r.bottom + 0.5 || q.right > r.right + 0.5); }).map(e => e.className || e.tagName).slice(0, 5); });
    if (over.length) throw new Error(i + '번 카드에서 넘친 요소: ' + over.join(', '));
    await card.screenshot({ path: path.join(out, 'card-' + String(i).padStart(2, '0') + '.png') });
  }
  await b.close();
  console.log('카드 이미지 ' + n + '장 → ' + out);
})();
