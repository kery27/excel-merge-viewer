// 크몽 세팅용 판(scripts/make-kmong.sh → dist/kmong/) 확인: 들어간 파일 · 바깥 주소 없음 · 파일로 열면 바로 찾기 화면 · 가짜 회사 폴더로 찾기
// 실행: LANG=C.UTF-8 node tests/kmong-build.test.js   (Playwright + Chromium 필요)
// 시험이라 커밋 안 한 수정까지 넣어 만든다(ALLOW_DIRTY=1). 실제로 줄 판은 커밋한 뒤 bash scripts/make-kmong.sh 로.
const { chromium } = require('playwright');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'kmong');
const DIR = path.join(OUT, '엑셀찾기');

(async () => {
  const log = execFileSync('bash', ['scripts/make-kmong.sh'], { cwd: ROOT, env: { ...process.env, ALLOW_DIRTY: '1' }, encoding: 'utf8' });
  assert.match(log, /만듦: dist\/kmong\/엑셀찾기\//);

  // ---- 들어간 파일 ----
  const list = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : list.push(path.relative(DIR, p).split(path.sep).join('/')); } })(DIR);
  assert.deepStrictEqual(list.sort(), ['icon.png', 'index.html', 'vendor/sqljs/LICENSE', 'vendor/sqljs/sqljs-bundle.js', 'vendor/xlsx/LICENSE', 'vendor/xlsx/xlsx-bundle.js', '엑셀찾기.ico', '여는 법.txt'].sort());

  // ---- 바깥으로 이끄는 것이 없음 (크몽: 연락처·홈페이지 주소 금지) ----
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const guide = fs.readFileSync(path.join(DIR, '여는 법.txt'), 'utf8');
  for (const [name, text] of [['index.html', html], ['여는 법.txt', guide]]) {
    assert.doesNotMatch(text, /https?:\/\//, name + '에 바깥 주소가 없음');
    assert.doesNotMatch(text, /johnsongarage|instagram|mailto:|tel:|010-\d/i, name + '에 연락처가 없음');
  }
  assert.ok(!html.includes('<div class="siteBar"'), '체험판 띠(문의 링크)가 없음');
  assert.ok(html.includes('<html lang="ko" class="folderOnly startFolder">'));
  assert.ok(html.includes('<title>엑셀 찾기</title>'));

  // ---- 여는 법: 윈도 메모장용 BOM + CRLF, 버전 줄 ----
  const raw = fs.readFileSync(path.join(DIR, '여는 법.txt'));
  assert.deepStrictEqual([...raw.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'BOM');
  assert.ok(!/[^\r]\n/.test(raw.toString('utf8')), '줄바꿈은 모두 CRLF');
  assert.match(guide, /버전: \d{4}-\d{2}-\d{2} · [0-9a-f]{7,}/);
  assert.ok(!guide.includes('{{'), '채우지 않은 자리가 없음');
  assert.doesNotMatch(guide, /claude|nifty/i, '손님이 보는 글에 브랜치 이름이 없음');

  // ---- 아이콘 ----
  const ico = fs.readFileSync(path.join(DIR, '엑셀찾기.ico'));
  assert.deepStrictEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1], 'ICO 머리');
  assert.ok(ico.readUInt16LE(4) >= 5, '크기 여러 개');
  assert.deepStrictEqual([...fs.readFileSync(path.join(DIR, 'icon.png')).subarray(1, 4)], [0x50, 0x4E, 0x47], 'PNG');

  // ---- zip: 폴더째, 경로는 /, 한글 이름 ----
  const names = execFileSync('python3', ['-c', 'import zipfile,sys\nfor i in zipfile.ZipFile(sys.argv[1]).infolist(): print(i.filename)', path.join(OUT, '엑셀찾기.zip')], { encoding: 'utf8' }).trim().split('\n');
  assert.strictEqual(names.length, 8);
  assert.ok(names.every(n => n.startsWith('엑셀찾기/') && !n.includes('\\')), 'zip 경로');

  // ---- 파일로 열기(file://): 바로 찾기 화면 ----
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const requests = [];
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) requests.push(r.url()); });
  await page.goto('file://' + encodeURI(path.join(DIR, 'index.html')));
  await page.waitForSelector('#folder', { state: 'visible', timeout: 20000 });
  assert.strictEqual(await page.title(), '엑셀 찾기');
  assert.strictEqual(await page.isVisible('#intro'), false, '처음 화면을 건너뜀');
  await page.waitForSelector('#fsConnectBtn', { state: 'visible' });
  assert.strictEqual((await page.textContent('#fsConnectBtn')).trim(), '폴더 연결');
  assert.strictEqual(await page.$('.siteBar'), null);
  assert.strictEqual(await page.isVisible('#offlineBtn'), false, '파일로 열면 내려받기 단추는 숨김');
  assert.strictEqual(await page.$eval('link[rel="icon"]', e => e.getAttribute('href')), 'icon.png');

  // 처음 화면으로 가면 폴더 찾기만 보이고(파일 모아보기는 숨김), 가짜 회사 폴더 체험이 됨
  await page.click('#fsBack');
  await page.waitForSelector('#intro', { state: 'visible' });
  for (const sel of ['#drop', '.sampleRow', '.rules']) assert.strictEqual(await page.isVisible(sel), false, '숨김: ' + sel);
  assert.strictEqual(await page.isVisible('#openFolderBtn'), true);
  await page.click('#demoEntryBtn');
  await page.waitForFunction(() => window.__fsTest && window.__fsTest.state().demo && window.__fsTest.state().lastCheck, null, { timeout: 60000 });
  await page.fill('#fsQ', 'TS-88412');
  await page.press('#fsQ', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('#fsResults td')].some(td => td.textContent.includes('TS-88412')), null, { timeout: 20000 });
  assert.match(await page.textContent('#fsSummary'), /일치\s*2줄/);

  assert.deepStrictEqual(requests, [], '바깥으로 나가는 요청이 없음');
  assert.deepStrictEqual(errors, [], '오류 없음');
  await b.close();
  console.log('크몽용 판 확인 통과');
})().catch(e => { console.error(e); process.exit(1); });
