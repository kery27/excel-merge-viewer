// 크몽 세팅 상품 메인 이미지: setup-main.html → out/setup-main.png (652×488의 2배 = 1304×976)
// 실행: node marketing/kmong/render-setup.js   (Playwright + Chromium 필요)
// 글꼴은 dist/font-src/(scripts/make-fonts.py가 받아 둠)의 Noto Serif KR·Pretendard를 찍을 때만 쓴다 — 없으면 멈춤.
// 크몽 메인이미지 가이드: 글자·디자인 요소는 상하좌우 50px 안쪽 → data-safe 요소의 글자·그림이 그 안에 있는지 검사하고, 밖이면 멈춘다.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const W = 652, H = 488, M = 50;
(async () => {
  const here = __dirname;
  const fontDir = path.join(here, '..', '..', 'dist', 'font-src');
  const need = ['NotoSerifKR-Bold.otf', 'Pretendard-SemiBold.otf', 'Pretendard-Bold.otf', 'Pretendard-ExtraBold.otf'];
  const missing = need.filter(f => !fs.existsSync(path.join(fontDir, f)));
  if (missing.length) throw new Error('글꼴이 없어요(' + missing.join(', ') + ') — python3 scripts/make-fonts.py 로 받아 주세요');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await p.goto('file://' + encodeURI(path.join(here, 'setup-main.html')));
  await p.evaluate(async () => { await document.fonts.ready; [...document.fonts].forEach(f => f.load()); await document.fonts.ready; });
  const fontsOk = await p.evaluate(() => ['700 44px "KM Serif"', '600 16px "KM Sans"', '700 16px "KM Sans"', '800 21px "KM Sans"']
    .every(f => document.fonts.check(f, '반품 송장')));
  if (!fontsOk) throw new Error('글꼴을 못 불러왔어요 — dist/font-src 확인');

  // 50px 안쪽 검사: 글자는 글자 자리(Range), 그림(svg)은 상자로
  const out = await p.evaluate(({ W, H, M }) => {
    const bad = [];
    for (const el of document.querySelectorAll('[data-safe]')) {
      const rects = [];
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) {
        if (!tw.currentNode.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(tw.currentNode);
        rects.push(...rg.getClientRects());
      }
      el.querySelectorAll('svg').forEach(s => rects.push(s.getBoundingClientRect()));
      if (el.matches('.clip')) rects.push(el.getBoundingClientRect());
      for (const r of rects) {
        if (r.left < M - .5 || r.top < M - .5 || r.right > W - M + .5 || r.bottom > H - M + .5)
          bad.push(el.className || el.tagName + ' ' + JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round)));
      }
    }
    return [...new Set(bad)];
  }, { W, H, M });
  if (out.length) throw new Error('50px 여백 밖으로 나간 요소: ' + out.join(', '));

  fs.mkdirSync(path.join(here, 'out'), { recursive: true });
  const file = path.join(here, 'out', 'setup-main.png');
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
  await b.close();
  console.log('메인 이미지 → ' + path.relative(process.cwd(), file) + ' (' + W * 2 + '×' + H * 2 + ')');
})().catch(e => { console.error(e.message || e); process.exit(1); });
