// 카드뉴스 이미지 만들기: intro/cards/index.html?render=N 을 1080×1080으로 찍어 intro/cards/img/card-0N.png 로.
// 실행: node intro/cards/render.js   (Playwright + Chromium 필요. 카드 글을 고치면 다시 돌리고 이미지도 같이 커밋)
// 이미지는 SNS·카톡에 올리는 용도이고, 공개 체험판의 /cards/img/ 에도 그대로 올라가 링크 미리보기(og:image)로 쓰인다.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const here = __dirname;
  const out = path.join(here, 'img');
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  const url = 'file://' + encodeURI(path.join(here, 'index.html'));
  await p.goto(url);
  const n = await p.$$eval('.slide', x => x.length);
  for (let i = 1; i <= n; i++) {
    await p.goto(url + '?render=' + i);
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
