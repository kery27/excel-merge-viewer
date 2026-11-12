// 크몽 세팅 상품 메인 이미지: setup-main.html → out/setup-main.png (652×488의 2배 = 1304×976)
// 실행: node marketing/kmong/render-setup.js   (Playwright + Chromium 필요)
// 1) 앱(../../index.html)의 가짜 회사 폴더 화면에서 송장번호를 찾은 모습을 찍어 out/setup-app-shot.png로 둔다(실제 화면, 가짜 데이터).
//    체험 띠·위쪽 제목줄·상태 줄은 숨기고 찍는다. 가짜 데이터의 날짜는 오늘 기준이라 다시 찍으면 날짜가 바뀐다.
// 2) setup-main.html에 그 화면을 넣어 찍는다.
// 글꼴은 dist/font-src/(scripts/make-fonts.py가 받아 둠)의 Pretendard를 찍을 때만 쓴다 — 없으면 멈춤.
// 크몽 메인이미지 가이드: 글자·디자인 요소는 상하좌우 50px 안쪽 → data-safe 요소의 글자·그림이 그 안에 있는지 검사하고, 밖이면 멈춘다.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const W = 652, H = 488, M = 50, Q = 'TS-88412';
(async () => {
  const here = __dirname, repo = path.join(here, '..', '..');
  const fontDir = path.join(repo, 'dist', 'font-src');
  const weights = { SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900, Regular: 400 };
  const missing = Object.keys(weights).map(w => 'Pretendard-' + w + '.otf').filter(f => !fs.existsSync(path.join(fontDir, f)));
  if (missing.length) throw new Error('글꼴이 없어요(' + missing.join(', ') + ') — python3 scripts/make-fonts.py 로 받아 주세요');
  fs.mkdirSync(path.join(here, 'out'), { recursive: true });
  const b = await chromium.launch();

  // 1) 앱 화면
  const a = await b.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
  await a.goto('file://' + encodeURI(path.join(repo, 'index.html')) + '?demo=1&q=' + encodeURIComponent(Q));
  await a.addStyleTag({ content: Object.entries(weights).map(([w, n]) =>
    '@font-face{font-family:"Pretendard";src:url("file://' + encodeURI(path.join(fontDir, 'Pretendard-' + w + '.otf')) + '");font-weight:' + n + '}').join('') +
    'header.top,#fsDemoBar,#fsStatus,#fsMsg,#fsProblems,.siteBar{display:none!important}' });
  await a.waitForFunction(q => document.querySelector('#fsQ')?.value === q && document.querySelectorAll('#fsResults td').length > 4, Q, { timeout: 20000 });
  await a.evaluate(async () => { await document.fonts.ready; });
  await a.waitForTimeout(300);
  const top = await a.$eval('.fsTop', e => e.getBoundingClientRect().top + scrollY);
  const shot = path.join(here, 'out', 'setup-app-shot.png');
  await a.screenshot({ path: shot, clip: { x: 0, y: Math.max(0, top - 12), width: 760, height: 420 } });
  await a.close();

  // 2) 메인 이미지
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await p.goto('file://' + encodeURI(path.join(here, 'setup-main.html')));
  await p.evaluate(async () => {
    await document.fonts.ready; [...document.fonts].forEach(f => f.load()); await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  });
  const ok = await p.evaluate(() => ['900 40px "KM Sans"', '800 15px "KM Sans"', '700 19px "KM Sans"', '600 12px "KM Sans"']
    .every(f => document.fonts.check(f, '송장 찾기')) && [...document.images].every(i => i.naturalWidth > 0));
  if (!ok) throw new Error('글꼴이나 앱 화면을 못 불러왔어요');

  // 50px 안쪽 검사: 글자는 글자 자리(Range), 그림(svg)은 상자로
  const bad = await p.evaluate(({ W, H, M }) => {
    const out = [];
    for (const el of document.querySelectorAll('[data-safe]')) {
      const rects = [];
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) {
        if (!tw.currentNode.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(tw.currentNode);
        rects.push(...rg.getClientRects());
      }
      el.querySelectorAll('svg').forEach(s => rects.push(s.getBoundingClientRect()));
      if (el.matches('.pill')) rects.push(el.getBoundingClientRect());
      for (const r of rects)
        if (r.left < M - .5 || r.top < M - .5 || r.right > W - M + .5 || r.bottom > H - M + .5)
          out.push((el.className || el.tagName) + ' ' + JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round)));
    }
    return [...new Set(out)];
  }, { W, H, M });
  if (bad.length) throw new Error('50px 여백 밖으로 나간 요소: ' + bad.join(', '));

  const file = path.join(here, 'out', 'setup-main.png');
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
  await b.close();
  console.log('앱 화면 → ' + path.relative(process.cwd(), shot) + '\n메인 이미지 → ' + path.relative(process.cwd(), file) + ' (' + W * 2 + '×' + H * 2 + ')');
})().catch(e => { console.error(e.message || e); process.exit(1); });
