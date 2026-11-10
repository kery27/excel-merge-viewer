// 소개 페이지 + 가짜 회사 폴더 체험 자동 확인 — 공개 체험판 모양(dist/public: / 소개, /app/ 앱)을 만들어 http로 연다.
// 실행: LANG=C.UTF-8 node tests/intro.test.js   (Playwright + Chromium 필요)
// 장면 카드마다: "이 장면 직접 해 보기" → 앱이 가짜 회사 폴더로 열리고, 카드에 적은 "일치 N줄 · 파일 N개"·날짜가 실제 결과와 같은지.
// 체험은 아무것도 저장하지 않는지, [내 폴더 연결하기]로 나오는지, 예전 주소(?sample=1)가 앱으로 가는지, 휴대폰 화면에서 안 삐져나가는지.
// 공개 주소(excel.johnsongarage.co.kr): CNAME·검색 파일, 공유 주소, 예전 주소(github.io)가 안 남았는지. 휴대폰에서 [내 폴더 연결하기] → PC 안내.
const { chromium, devices } = require('playwright');
const assert = require('assert');
const path = require('path'), http = require('http'), nfs = require('fs'), os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'dist', 'public');

async function main() {
  execSync('bash scripts/make-public.sh', { cwd: ROOT, stdio: 'ignore' });
  const server = http.createServer((req, res) => {
    let f = path.join(PUB, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(PUB)) { res.writeHead(404); return res.end(); }
    if (nfs.existsSync(f) && nfs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!nfs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'application/javascript' });
    nfs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = 'http://localhost:' + server.address().port + '/';
  const userDir = nfs.mkdtempSync(path.join(os.tmpdir(), 'emv-intro-'));
  const ctx = await chromium.launchPersistentContext(userDir, {});
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // ---- 소개 페이지 ----
  await page.goto(base);
  const cards = await page.$$eval('.scene', x => x.map(c => ({
    title: c.querySelector('h3').textContent.trim(),
    ind: c.dataset.ind,
    href: c.querySelector('.try').getAttribute('href'),
    claim: c.querySelector('.mini .n').textContent.trim(),
    quote: c.querySelector('.quote').textContent.trim(),
    dates: [...c.querySelectorAll('.mini li .dt')].map(e => e.textContent.trim())
  })));
  assert.equal(cards.length, 7);
  assert.ok(cards.every(c => /^\d{4}-\d{2}(-\d{2})?$/.test(c.dates[0])), '예시 날짜가 오늘 기준으로 채워짐');
  // 업종 고르기
  const visible = async ind => { await page.click('.tabs button[data-ind="' + ind + '"]'); return page.$$eval('.scene:not([hidden])', x => x.length); };
  assert.equal(await visible('logistics'), 3);
  assert.equal(await visible('wholesale'), 2);
  assert.equal(await visible('shop'), 1);
  assert.equal(await visible('maker'), 1);
  assert.equal(await visible('office'), 1);
  assert.equal(await visible('all'), 7);
  // 제목 명조(fonts/emv-serif.woff2)가 실제로 불러와지는지 — 없으면 기본 글꼴로 조용히 바뀌어 디자인이 깨짐
  const serifLoaded = () => page.evaluate(async () => { await document.fonts.ready; await document.fonts.load('700 20px "EMV Serif"', '사건'); return document.fonts.check('700 20px "EMV Serif"', '사건'); });
  assert.equal(await serifLoaded(), true, '소개 페이지 제목 글꼴');
  // 외부로 나가는 요청이 없는지(분석 도구 없음, 글꼴도 같은 곳에서)
  const external = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(u => !u.startsWith(location.origin)));
  assert.deepEqual(external, []);

  // ---- 카드로 보기(카드뉴스 9장) ----
  assert.equal(await page.$eval('meta[property="og:image"]', e => e.content), 'https://excel.johnsongarage.co.kr/cards/img/card-01.png');
  assert.equal(await page.$eval('link[rel="canonical"]', e => e.href), 'https://excel.johnsongarage.co.kr/');
  assert.equal(await page.$eval('a.btn[href*="#contact"]', e => e.href), 'https://johnsongarage.co.kr/#contact', '문의는 홈페이지 연락으로');
  // 공개 주소 파일: CNAME이 빠지면 GitHub Pages가 주소 연결을 풀어 버림
  assert.equal(nfs.readFileSync(path.join(PUB, 'CNAME'), 'utf8').trim(), 'excel.johnsongarage.co.kr');
  assert.match(nfs.readFileSync(path.join(PUB, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/excel\.johnsongarage\.co\.kr\/sitemap\.xml/);
  assert.equal((nfs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8').match(/<loc>https:\/\/excel\.johnsongarage\.co\.kr\//g) || []).length, 3);
  for (const f of ['index.html', 'cards/index.html', 'app/index.html', 'README.md'])
    assert.ok(!/kery27\.github\.io|johnsongarage\.github\.io/.test(nfs.readFileSync(path.join(PUB, f), 'utf8')), f + ': 예전 주소가 남아 있음');
  await page.goto(base + 'cards/');
  assert.equal(await serifLoaded(), true, '카드 페이지 제목 글꼴');
  const slides = await page.$$eval('.slide', x => x.map(s => ({ q: s.dataset.q || null, img: s.dataset.img })));
  assert.equal(slides.length, 9);
  const cardQs = slides.filter(x => x.q).map(x => x.q).sort();
  const landingQs = cards.map(c => new URLSearchParams(c.href.split('?')[1]).get('q')).sort();
  assert.deepEqual(cardQs, landingQs, '카드뉴스의 장면 = 소개 페이지의 장면');
  for (const sl of slides) {
    const st = await page.evaluate(async u => (await fetch(u)).status, sl.img);
    assert.equal(st, 200, sl.img);
  }
  assert.equal(await page.$eval('#try', e => e.getAttribute('href')), '../app/?demo=1');
  await page.click('.nav.next'); await page.waitForTimeout(700);
  assert.equal(await page.$eval('#count', e => e.textContent), '2 / 9');
  assert.equal(await page.$eval('#try', e => e.getAttribute('href')), '../app/?demo=1&q=TS-88412');
  assert.equal(await page.$eval('#dl', e => e.getAttribute('href')), 'img/card-02.png');
  await page.goto(base);

  // ---- 장면마다 직접 해 보기 ----
  for (const c of cards) {
    await page.goto(base + c.href);
    await page.waitForFunction(() => window.__fsTest && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const q = new URLSearchParams(c.href.split('?')[1]).get('q');
    assert.equal(await page.inputValue('#fsQ'), q, c.title);
    assert.equal(await page.isVisible('#fsDemoBar'), true);
    const sum = await page.$eval('#fsSummary', e => e.innerText);
    assert.ok(sum.startsWith(c.claim), c.title + ': 카드 "' + c.claim + '" ↔ 앱 "' + sum + '"');
    // 체험 띠: 그 장면 버튼이 눌린 모양 + 소개 페이지 카드와 같은 상황 한 줄
    assert.equal(await page.$eval('#fsDemoQs [aria-pressed="true"]', e => e.dataset.demoQ), q, c.title + ' 버튼');
    assert.ok((await page.$eval('#fsDemoScene', e => e.hidden ? '' : e.innerText)).includes(c.quote), c.title + ': 장면 한 줄이 카드의 "' + c.quote + '"와 다름');
    const resultDates = await page.$$eval('#fsResults td.fsD', x => x.map(e => e.textContent));
    for (const d of c.dates) {
      if (d.length === 7) assert.ok(resultDates.some(r => r.startsWith(d)) || /청구/.test(await page.$eval('#fsResults', e => e.innerText)), c.title + ' ' + d);
      else assert.ok(resultDates.includes(d), c.title + ': 카드 날짜 ' + d + ' 가 결과에 없음 ' + resultDates);
    }
  }
  // 체험 단추로도 찾을 말이 바뀜
  await page.click('#fsDemoQs [data-demo-q="LT-5517"]'); await page.waitForTimeout(300);
  assert.match(await page.$eval('#fsSummary', e => e.innerText), /^일치 4줄/);
  assert.match(await page.$eval('#fsDemoBar .dmHow', e => e.innerText), /아래 버튼은 일하다 자주 생기는 장면/);
  // 장면에 없는 말을 넣으면 장면 한 줄은 사라짐
  await page.fill('#fsQ', '샘플 머그컵'); await page.press('#fsQ', 'Enter'); await page.waitForTimeout(300);
  assert.equal(await page.isVisible('#fsDemoScene'), false);
  assert.equal(await page.$$eval('#fsDemoQs [aria-pressed="true"]', x => x.length), 0);

  // 읽은 파일 보기: 위쪽 '파일 52개'를 누르면 폴더별 목록, 파일을 펼치면 탭·칸 제목
  await page.click('#fsFolderInfo [data-fs-files]');
  await page.waitForSelector('#fsFiles:not([hidden])');
  assert.equal(await page.$$eval('#fsFiles .file', x => x.length), 52);
  assert.equal(await page.$$eval('#fsFiles details.dir', x => x.length), 10);
  assert.equal(await page.$eval('#fsFiles details.dir[data-dir="출고/2026-10"]', d => d.open), false, '파일이 많은 폴더는 접어 둠');
  assert.equal(await page.$eval('#fsFiles details.dir[data-dir="고객관리"]', d => d.open), true);
  assert.equal(await page.$eval('#fsFolderInfo [data-fs-files]', e => e.getAttribute('aria-expanded')), 'true');
  await page.click('#fsFiles details.file[data-path="고객관리/2019_계약관리.xlsx"] > summary');
  await page.waitForFunction(() => /상반기/.test(document.querySelector('#fsFiles details.file[data-path="고객관리/2019_계약관리.xlsx"] .shs').innerText));
  assert.match(await page.$eval('#fsFiles details.file[data-path="고객관리/2019_계약관리.xlsx"] .shs', e => e.innerText), /탭 상반기 · \d+줄 · 칸: /);
  await page.click('#fsDemoBar [data-fs-files]'); // 체험 띠의 '엑셀·CSV 52개'로 닫기
  assert.equal(await page.isVisible('#fsFiles'), false);

  // 체험은 아무것도 저장하지 않음 — 폴더 기억·저장본(OPFS·IndexedDB) 모두 없음
  const stored = await page.evaluate(async () => {
    const kv = await new Promise(r => { const q = indexedDB.open('emv_folder', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => { const t = q.result.transaction('kv'); const s = t.objectStore('kv'); const a = s.get('dir'), b = s.get('store'); t.oncomplete = () => r([a.result || null, b.result || null]); }; });
    let opfs = false; try { await (await navigator.storage.getDirectory()).getFileHandle('folder-search.db'); opfs = true; } catch (e) {}
    return { dir: !!kv[0], store: !!kv[1], opfs };
  });
  assert.deepEqual(stored, { dir: false, store: false, opfs: false });

  // [내 폴더 연결하기] → 체험 끝, 진짜 폴더 연결 안내
  await page.click('#fsDemoExit');
  await page.waitForSelector('#fsConnect:not([hidden])');
  assert.equal(await page.isVisible('#fsDemoBar'), false);
  assert.equal(new URL(page.url()).search, '', '주소에서 demo가 빠짐');

  // 앱 띠의 "어디에 쓰나요" → 소개 페이지
  assert.equal(await page.$eval('a[href="../"]', e => e.textContent.includes('업종별 장면')), true);

  // 예전 주소(?sample=1) → 앱으로. 공개판은 폴더 찾아보기만이라 파일 모아보기 대신 가짜 회사 폴더로(2026-11-10)
  await page.goto(base + '?sample=1');
  await page.waitForFunction(() => window.__fsTest && window.__fsTest.state().demo && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  assert.match(page.url(), /\/app\/\?sample=1$/);
  assert.equal(await page.isVisible('#view'), false, '공개판: 파일 모아보기 화면은 안 열림');
  // 공개판 처음 화면: 파일 모아보기(납품본 조회 화면에서 온 것)로 들어가는 곳이 안 보임 — 의뢰인 동의 전까지
  await page.goto(base + 'app/');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('folderOnly')), true);
  for (const sel of ['#drop', '.sampleRow', '.entry.on', '.rules', '#fillMergedIntro'])
    assert.equal(await page.isVisible(sel), false, '공개판에서 숨김: ' + sel);
  assert.equal(await page.isVisible('#openFolderBtn'), true);
  assert.match(await page.$eval('#intro h1', e => e.innerText), /^폴더 속 엑셀 수백 개에서, 찾던 그 줄을 바로$/);
  // 떨어뜨린 파일도 받지 않음
  await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File(['a,b\n1,2'], '흉내.csv', { type: 'text/csv' })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true })); });
  await page.waitForTimeout(500);
  assert.equal(await page.isVisible('#view') || await page.isVisible('#confirm') || await page.isVisible('#progress'), false, '공개판: 떨어뜨린 파일로 파일 모아보기가 열리지 않음');
  await page.click('#demoEntryBtn');
  await page.waitForFunction(() => window.__fsTest && window.__fsTest.state().demo && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  // 소개 페이지에도 파일 모아보기 소개(부록)가 없음
  await page.goto(base);
  assert.equal(await page.$('#merge'), null);
  assert.equal(await page.$('a[href*="sample"]'), null);

  // ---- 휴대폰: 소개 페이지·체험 화면이 화면 밖으로 안 삐져나감 ----
  // persistent context에서는 기기 흉내를 못 바꿔서 따로 띄움
  const b2 = await chromium.launch();
  const m = await b2.newContext({ ...devices['Pixel 7'] });
  await m.addInitScript(() => { navigator.share = async d => { window.__shared = d; }; });
  const mp = await m.newPage();
  mp.on('pageerror', e => errors.push(e.message));
  const sticking = () => mp.evaluate(() => { const W = document.documentElement.clientWidth; const bad = []; document.querySelectorAll('body *').forEach(e => { if (e.closest('.tw, .tabs, .fsTableWrap, #fsDemoQs')) return; const r = e.getBoundingClientRect(); if (r.width && r.right > W + 1) bad.push((e.id || e.className || e.tagName) + ':' + Math.round(r.right)); }); return bad.slice(0, 5); });
  await mp.goto(base);
  assert.deepEqual(await sticking(), [], '소개 페이지');
  // 휴대폰 소개 페이지(2026-11-10 점검): 업종 탭이 옆으로 숨지 않음, '전체'는 사건 3개 + [사건 4개 더 보기], 장면 단추는 누르기 쉽게
  assert.ok(await mp.$eval('.tabs', e => e.scrollWidth <= e.clientWidth + 1), '업종 탭이 화면 밖으로 숨지 않음');
  // 휴대폰은 폴더 연결이 안 됨 → 첫 화면에 '내 엑셀로 써 보기' 대신 PC 안내 + [PC로 주소 보내기](앱 주소)
  assert.equal(await mp.isVisible('.hero a.btn[href="app/"]'), false, '휴대폰: 내 엑셀로 써 보기 숨김');
  assert.match(await mp.$eval('.hero .pcNote', e => e.innerText), /내 엑셀 폴더 연결은 PC의 크롬·엣지에서 돼요/);
  await mp.click('#sendPc');
  assert.equal(await mp.evaluate(() => window.__shared && window.__shared.url), base + 'app/', '소개 페이지: 앱 주소를 PC로');
  const shown = () => mp.$$eval('.scene', x => x.filter(e => e.offsetParent).length);
  assert.equal(await shown(), 3, "휴대폰 '전체'는 사건 3개 먼저");
  assert.equal(await mp.$eval('.moreScenes', e => e.innerText.trim()), '사건 4개 더 보기 ↓');
  assert.ok(await mp.evaluate(() => document.documentElement.scrollHeight) < 7600, '휴대폰 소개 페이지 길이(전 9,900px)');
  assert.ok(await mp.$$eval('.scene .try', x => x.filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 44)), '이 장면 직접 해 보기: 누르는 곳 44px 이상');
  await mp.click('.moreScenes');
  assert.equal(await shown(), 7);
  assert.equal(await mp.isVisible('.moreScenes'), false);
  await mp.click('.tabs button[data-ind="shop"]'); assert.equal(await shown(), 1);
  await mp.click('.tabs button[data-ind="all"]'); assert.equal(await shown(), 7, '한 번 펼치면 계속 펼침');
  await mp.goto(base + 'cards/');
  assert.equal(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '카드 페이지: 가로로 밀리지 않음(카드 넘기기 줄만 옆으로)');
  assert.ok(await mp.$eval('#try', e => e.getBoundingClientRect().height) >= 40, '카드 페이지 직접 해 보기: 누르기 쉽게');
  await mp.goto(base + 'app/?demo=1&q=1250000');
  await mp.waitForFunction(() => window.__fsTest && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  await mp.waitForTimeout(300);
  assert.deepEqual(await sticking(), [], '체험 화면');
  assert.equal(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '체험 화면: 가로로 밀리지 않음(장면 단추 줄만 옆으로 밀림)');
  // 휴대폰은 체험 띠가 길어서, 장면 링크로 오면 장면 한 줄로 내려가 결과 줄이 첫 화면에 보이게
  await mp.waitForTimeout(800);
  assert.ok(await mp.evaluate(() => { const r = document.querySelector('#fsSummary').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), '휴대폰: 결과 줄이 첫 화면에 보임');
  // 휴대폰은 위쪽을 짧게(2026-11-10): 짧은 안내, 장면 단추 한 줄(옆으로 밀기), 내려가지 않아도 결과가 보임
  assert.equal(await mp.evaluate(() => scrollY), 0, '휴대폰: 화면을 내리지 않아도 결과 줄이 보임');
  assert.equal(await mp.isVisible('#fsDemoBar .mLong'), false, '휴대폰: 체험 띠는 짧은 글');
  assert.match(await mp.$eval('#fsDemoBar .dmHow', e => e.innerText), /장면을 눌러 보세요/);
  assert.equal(await mp.$$eval('#fsDemoQs button', x => new Set(x.map(b => b.offsetTop)).size), 1, '휴대폰: 장면 단추는 한 줄');
  assert.equal(await mp.isVisible('#offlineBtn'), false, '휴대폰: 오프라인용 내려받기는 숨김');
  assert.equal(await mp.isVisible('#fsRescan'), false, '가짜 폴더에선 다시 확인 없음');
  assert.equal(await mp.isVisible('#fsDemoExit'), false, '휴대폰: 내 폴더 연결하기 대신');
  assert.match(await mp.$eval('#fsDemoBar .dmTop', e => e.innerText), /내 엑셀 폴더는 PC에서 연결해요/);
  await mp.evaluate(() => { window.__shared = null; });
  await mp.click('#fsDemoSend');
  assert.equal(await mp.evaluate(() => window.__shared && window.__shared.url), base + 'app/', '체험 띠: 체험 장면이 아니라 앱 첫 화면 주소');
  // 가장 작은 휴대폰(320×568)도 내리지 않고 결과 줄, 검색창은 한 줄 통째로
  const se = await b2.newContext({ ...devices['iPhone SE'] });
  const sp = await se.newPage();
  sp.on('pageerror', e => errors.push(e.message));
  await sp.goto(base + 'app/?demo=1&q=TS-88412');
  await sp.waitForFunction(() => window.__fsTest && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  await sp.waitForTimeout(800);
  assert.ok(await sp.evaluate(() => { const r = document.querySelector('#fsSummary').getBoundingClientRect(); return scrollY === 0 && r.bottom <= innerHeight; }), '320×568: 결과 줄이 첫 화면에');
  assert.ok(await sp.$eval('#fsQ', e => e.getBoundingClientRect().width) > 250, '320×568: 검색창이 눌리지 않음');
  await se.close();
  // 진짜 휴대폰에는 폴더 고르기 기능이 없음(안드로이드 크롬 포함) → 처음 화면 '폴더 찾아보기'를 누르면 "PC에서" 안내 + 주소 보내기
  const m2 = await b2.newContext({ ...devices['Pixel 7'] });
  await m2.addInitScript(() => { delete window.showDirectoryPicker; navigator.share = async d => { window.__shared = d; }; });
  const mp2 = await m2.newPage();
  mp2.on('pageerror', e => errors.push(e.message));
  await mp2.goto(base + 'app/');
  assert.match(await mp2.$eval('#openFolderBtn', e => e.innerText), /폴더 연결은 PC에서 돼요/, '처음 화면 카드에 미리 알림');
  await mp2.click('#openFolderBtn');
  await mp2.waitForSelector('#fsConnect:not([hidden])');
  assert.equal(await mp2.isVisible('#fsQ'), false, '폴더 연결이 안 되는 곳에선 검색창 숨김');
  assert.match(await mp2.$eval('#fsConnectText', e => e.innerText), /휴대폰·태블릿에서는 폴더 연결이 안 돼요. PC의 크롬이나 엣지/);
  assert.equal(await mp2.isVisible('#fsConnectBtn'), false, '휴대폰에서는 누를 수 없는 [폴더 연결]을 안 보임');
  await mp2.click('#fsSendLink');
  assert.equal(await mp2.evaluate(() => window.__shared && window.__shared.url), base + 'app/', '체험 장면이 아니라 앱 첫 화면 주소를 보냄');
  await mp2.click('#fsDemoTry');
  await mp2.waitForFunction(() => window.__fsTest && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  assert.equal(await mp2.isVisible('#fsDemoBar'), true, '여기서 다시 가짜 회사 폴더 체험');
  // 폴더 연결이 안 되는 PC 브라우저(파이어폭스·사파리 등)는 예전처럼 "크롬이나 엣지" 안내
  const d2 = await b2.newContext();
  await d2.addInitScript(() => { delete window.showDirectoryPicker; });
  const dp2 = await d2.newPage();
  dp2.on('pageerror', e => errors.push(e.message));
  await dp2.goto(base + 'app/?demo=1');
  await dp2.waitForFunction(() => window.__fsTest && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  await dp2.click('#fsDemoExit');
  await dp2.waitForSelector('#fsConnect:not([hidden])');
  assert.equal(await dp2.$eval('#fsFolderInfo', e => e.innerText.trim()), '', '체험을 끝내면 위쪽 줄의 가짜 폴더 정보도 지움');
  assert.equal(await dp2.isVisible('#fsQ'), false, '폴더 연결이 안 되는 곳에선 검색창 숨김');
  assert.equal(await dp2.isVisible('#openFolderBtn .phoneOnly'), false);
  assert.match(await dp2.$eval('#fsConnectText', e => e.innerText), /이 브라우저는 폴더 연결을 지원하지 않아요. 크롬이나 엣지/);
  assert.equal(await dp2.isVisible('#fsSendLink'), false);
  await b2.close();

  // ---- 파일 더블클릭(file://)으로 연 앱에서도 체험됨 ----
  const fp = await ctx.newPage();
  fp.on('pageerror', e => errors.push(e.message));
  await fp.goto('file://' + encodeURI(path.join(PUB, 'app', 'index.html')) + '?demo=1&q=' + encodeURIComponent('한빛샘플'));
  await fp.waitForFunction(() => window.__fsTest && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  await fp.waitForTimeout(300);
  assert.match(await fp.$eval('#fsSummary', e => e.innerText), /^일치 2줄 · 파일 2개 · 가장 최근 2021-09-02 · 가장 오래된 2019-05-14/);

  assert.deepEqual(errors, []);
  await ctx.close();
  server.close();
  nfs.rmSync(userDir, { recursive: true, force: true });
  console.log('소개 페이지·체험 확인 통과');
}

main().catch(e => { console.error(e); process.exit(1); });
