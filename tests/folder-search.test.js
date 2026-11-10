// 폴더 찾아보기 자동 확인.
// 실행: LANG=C.UTF-8 node tests/folder-search.test.js   (Playwright + Chromium 필요)
// 헤드리스 크롬은 폴더 고르기 창을 못 띄우므로, 가짜 폴더 핸들을 넘긴다(window.__fsTest.useDir). 나머지(훑기·읽기·바뀐 것만
// 다시 읽기·찾기·저장본·다시 열기)는 화면 코드 그대로 돈다. 가짜 데이터만 쓴다.
// 1부: http://localhost — 브라우저 파일 시스템(OPFS) 안에 가짜 폴더를 만들고, 저장본도 OPFS에.
// 2부: 파일 더블클릭(file://) — 크롬이 OPFS를 막으므로 저장본이 IndexedDB로 가는지. 가짜 폴더는 메모리 속 흉내 핸들.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const http = require('http');
const nfs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const url = p => 'file://' + encodeURI(p);
const day = n => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// OPFS 안 'emv-test-folder'에 파일 쓰기. spec: { path, sheets: [[이름, aoa]] } | { path, csv } | { path, bytes: 'garbage' }
async function writeFiles(page, specs) {
  await page.evaluate(async specs => {
    const X = __xlsxFactory();
    const root = await navigator.storage.getDirectory();
    let base = await root.getDirectoryHandle('emv-test-folder', { create: true });
    for (const f of specs) {
      const parts = f.path.split('/');
      let d = base;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      let data;
      if (f.csv) data = new TextEncoder().encode('﻿' + f.csv);
      else if (f.bytes) data = new TextEncoder().encode('이건 엑셀이 아니에요');
      else {
        const wb = X.utils.book_new();
        f.sheets.forEach(([name, aoa]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa.map(r => r.map(v => typeof v === 'string' && v.startsWith('@D') ? new Date(v.slice(2) + 'T00:00:00') : v))), name));
        data = X.write(wb, { type: 'array', bookType: 'xlsx' });
      }
      const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
      await w.write(data); await w.close();
    }
  }, specs);
}
async function removeFile(page, p) {
  await page.evaluate(async p => {
    const root = await navigator.storage.getDirectory();
    let d = await root.getDirectoryHandle('emv-test-folder');
    const parts = p.split('/');
    for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x);
    await d.removeEntry(parts[parts.length - 1]);
  }, p);
}

async function main() {
  // 보통 프로필로 띄운다 — 시크릿(임시) 프로필에서는 OPFS 폴더 핸들을 IndexedDB에 넣고 새로 고치면 크롬이 페이지를 닫아 버림(헤드리스 크롬 153에서 확인)
  const userDir = nfs.mkdtempSync(path.join(require('os').tmpdir(), 'emv-fs-'));
  const ctx = await chromium.launchPersistentContext(userDir, { acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { errors.push('alert/confirm 창이 떴음: ' + d.message()); d.dismiss(); });
  const text = sel => page.$eval(sel, e => e.innerText);
  const idle = () => page.waitForFunction(() => !window.__fsTest.state().syncing, null, { timeout: 60000 });
  const search = async q => { await page.fill('#fsQ', q); await page.press('#fsQ', 'Enter'); await page.waitForTimeout(400); };
  const dates = () => page.$$eval('#fsResults tbody td.fsD', x => x.map(e => e.textContent));

  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT) || !nfs.existsSync(f) || nfs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' });
    nfs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = server.address().port;
  await page.goto('http://localhost:' + port + '/index.html');
  await page.evaluate(async () => { // 지난 실행이 남긴 것 정리
    const root = await navigator.storage.getDirectory();
    for (const n of ['emv-test-folder', 'folder-search.db']) { try { await root.removeEntry(n, { recursive: true }); } catch (e) {} }
  });

  // 제목 형식이 제각각인 가짜 폴더
  await writeFiles(page, [
    // 맨 위에 한 칸짜리 제목, 셋째 줄이 진짜 제목 줄. 날짜는 엑셀 날짜 서식
    { path: '출고/출고_최근.xlsx', sheets: [['출고', [
      ['최근 출고 내역'], [],
      ['출고일', '송장번호', '상품코드', '업체명', '수량'],
      ['@D' + day(3), 'INV-1001', 'abc-100', '(주)테스트상사', 2],
      ['@D' + day(20), 'INV-1002', 'XYZ-200', '샘플물산', 1],
      ['@D' + day(200), 'INV-1003', 'ABC-100', '주식회사 테스트 상사', 5],
    ]]] },
    // 다른 제목, 날짜는 글자(2021.03.05), 금액에 쉼표 글자
    { path: '업체/업체이력.xlsx', sheets: [
      ['이력', [['일자', '거래처', '품목', '금액'], ['2021.03.05', '테스트상사㈜', '샘플품목A', '1,250,000'], ['2024.07.01', '다른회사', '샘플품목B', '300']]],
      ['메모', [['메모'], ['테스트상사 담당 바뀜']]],
    ] },
    // CSV, 날짜는 20230115 숫자 꼴
    { path: '옛자료/주문_2023.csv', csv: '주문일,주문번호,고객,비고\n20230115,A-1,테스트 상사,옛 주문\n20230116,A-2,샘플고객,\n' },
    // 날짜 칸이 없는 탭 → 파일 수정일로
    { path: '날짜없음.xlsx', sheets: [['목록', [['코드', '이름'], ['abc-100', '샘플상품']]]] },
    { path: '출고/출고_백업.xlsx', sheets: [['출고', [['출고일', '상품코드'], ['@D' + day(1), 'abc-100']]]] }, // 이름에 "백업" → 건너뜀
    { path: '~$열린파일.xlsx', sheets: [['a', [['x'], ['abc-100']]]] },                              // 임시 파일 → 건너뜀
    { path: '깨진파일.xlsx', bytes: true },                                                            // 못 읽음 → 알림
  ]);

  // 오프라인용 내려받기: zip을 풀어 file://로 열면 인터넷 없이 동작
  assert.equal(await page.isVisible('#offlineBtn'), true, '웹 주소로 열면 단추가 보임');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#offlineBtn')]);
  assert.equal(dl.suggestedFilename(), '엑셀모아보기_오프라인.zip');
  const zb = nfs.readFileSync(await dl.path());
  const offDir = nfs.mkdtempSync(path.join(require('os').tmpdir(), 'emv-off-'));
  for (let p = 0; zb.readUInt32LE(p) === 0x04034b50;) { // 압축 없는 zip이라 직접 풂
    const size = zb.readUInt32LE(p + 18), nlen = zb.readUInt16LE(p + 26);
    const name = zb.slice(p + 30, p + 30 + nlen).toString('utf8');
    nfs.mkdirSync(path.dirname(path.join(offDir, name)), { recursive: true });
    nfs.writeFileSync(path.join(offDir, name), zb.slice(p + 30 + nlen, p + 30 + nlen + size));
    p += 30 + nlen + size;
  }
  assert.deepEqual(nfs.readdirSync(path.join(offDir, '엑셀모아보기')).sort(), ['index.html', 'vendor', '여는 법.txt']);
  const off = await ctx.newPage();
  await off.goto(url(path.join(offDir, '엑셀모아보기', 'index.html')));
  assert.equal(await off.evaluate(() => BUNDLES_OK), true, '풀어 연 화면에서 라이브러리 읽힘');
  assert.equal(await off.isVisible('#offlineBtn'), false, '파일로 연 화면에선 단추 숨김');
  await off.close();
  nfs.rmSync(offDir, { recursive: true, force: true });

  await page.click('#openFolderBtn');
  assert.equal(await page.isVisible('#folder'), true);
  await page.waitForSelector('#fsConnect:not([hidden])', { timeout: 5000 }); // 처음엔 폴더 연결 안내
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); await window.__fsTest.useDir(await root.getDirectoryHandle('emv-test-folder')); });
  await idle();
  const info = await text('#fsFolderInfo');
  assert.match(info, /파일 4개/, info);
  assert.match(await text('#fsProblems'), /못 읽은 파일 1개/);
  await page.click('#fsProblems summary');
  assert.match(await text('#fsProblems'), /깨진파일\.xlsx/);
  // 읽은 파일 보기: '파일 4개'를 누르면 폴더별 목록 — 못 읽은 파일도 이유와 함께, 파일을 펼치면 탭·칸 제목
  await page.click('#fsFolderInfo [data-fs-files]');
  await page.waitForSelector('#fsFiles:not([hidden])');
  assert.equal(await page.$$eval('#fsFiles .file', x => x.length), 5); // 읽은 4 + 못 읽은 1
  assert.match(await text('#fsFiles'), /읽은 파일 4개\s*못 읽은 파일 1개/);
  assert.match(await page.$eval('#fsFiles div.file', e => e.innerText), /깨진파일\.xlsx\s*못 읽음/);
  const firstFile = await page.$eval('#fsFiles details.file', d => d.dataset.path);
  await page.click('#fsFiles details.file > summary');
  await page.waitForFunction(p => !/불러오는 중/.test(document.querySelector('#fsFiles details.file[data-path="' + p + '"] .shs').innerText), firstFile);
  assert.match(await page.$eval('#fsFiles details.file .shs', e => e.innerText), /탭 .+ · \d+줄/, firstFile);
  await page.click('#fsFilesClose');
  assert.equal(await page.isVisible('#fsFiles'), false);

  // 기본: 띄어 쓴 그대로 한 덩어리로 찾음(사용자 결정 2026-11-09). (주)·㈜·주식회사는 무시
  await search('테스트상사');
  let sum = await text('#fsSummary');
  assert.match(sum, /일치 3줄/, sum); // (주)테스트상사·테스트상사㈜·메모 "테스트상사 담당 바뀜"
  await search('테스트 상사');
  assert.match(await text('#fsSummary'), /일치 2줄/); // 주식회사 테스트 상사·csv "테스트 상사"
  await search('abc-100+테스트');
  assert.match(await text('#fsSummary'), /일치 2줄/); // +로 이으면 모두 들어간 줄

  // 설정에서 띄어쓰기 무시를 켜면 (주)·㈜·주식회사·띄어쓰기 다 같은 업체로. 최신순.
  await page.click('#fsSettingsBtn');
  await page.check('#fsSettings input[data-k="space"]');
  await page.waitForTimeout(800);
  await page.click('#fsSettingsBtn');
  await search('테스트상사');
  sum = await text('#fsSummary');
  assert.match(sum, /일치 5줄/, sum);
  assert.match(sum, /파일 3개/, sum);
  assert.match(sum, new RegExp('가장 최근 ' + day(0))); // 메모 탭(날짜 칸 없음)은 파일 수정일 = 오늘
  assert.match(sum, /가장 오래된 2021-03-05/);
  let ds = await dates();
  assert.deepEqual(ds, [...ds].sort().reverse(), '최신순이어야 함: ' + ds);
  assert.equal(ds[0], day(0));
  assert.equal(ds[1], day(3));
  // 탭마다 원래 제목 그대로
  const heads = await page.$$eval('.fsGroup thead tr', x => x.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  assert.ok(heads.some(h => /출고일 행 출고일 송장번호 상품코드 업체명 수량/.test(h)), heads.join(' | '));
  assert.ok(heads.some(h => /일자 행 일자 거래처 품목 금액/.test(h)), heads.join(' | '));
  assert.ok(heads.some(h => /파일 날짜 행 메모/.test(h)), heads.join(' | ')); // 메모 탭도 정리 없이 찾음
  assert.ok((await page.$$('.fsTable td.hit')).length >= 5, '찾은 칸 강조');

  // 대소문자·AND
  await search('ABC-100');
  assert.match(await text('#fsSummary'), /일치 3줄/);
  await search('abc-100+테스트');
  assert.match(await text('#fsSummary'), /일치 2줄/);
  // 숫자 쉼표
  await search('1250000');
  assert.match(await text('#fsSummary'), /일치 1줄/);
  // CSV 날짜 20230115
  await search('옛 주문');
  assert.match(await text('#fsSummary'), /가장 최근 2023-01-15/);

  // 기간 빠른 단추
  await search('테스트상사');
  await page.click('#fsPeriod [data-period="30"]'); await page.waitForTimeout(400);
  sum = await text('#fsSummary');
  assert.match(sum, /일치 2줄/, sum); // 3일 전 출고 + 메모 탭(파일 수정일)
  assert.match(sum, /기간 밖에 3줄 더/, sum);
  await page.click('#fsPeriod [data-period="all"]'); await page.waitForTimeout(400);
  assert.match(await text('#fsSummary'), /일치 5줄/);

  // 줄 상세·출처
  await page.click('#fsResults tbody tr >> nth=1'); // 첫 줄은 메모 탭(오늘), 둘째 줄이 3일 전 출고
  const det = await text('#detailBody');
  assert.match(det, /emv-test-folder\/출고\/출고_최근\.xlsx › 출고 · 4행/, det);
  assert.match(det, /"출고일" 칸/);
  await page.click('#detailClose');

  // 설정: 띄어쓰기 무시를 끄면 "테스트 상사"는 띄어 쓴 것만
  await page.click('#fsSettingsBtn');
  await page.uncheck('#fsSettings input[data-k="space"]');
  await page.waitForTimeout(800);
  await search('테스트상사');
  sum = await text('#fsSummary');
  assert.match(sum, /일치 3줄/, sum); // "주식회사 테스트 상사"·"테스트 상사"(csv) 빠짐
  await page.click('#fsDefaults'); await page.waitForTimeout(800);
  await search('테스트상사');
  assert.match(await text('#fsSummary'), /일치 3줄/); // 기본값 = 띄어쓰기 살림
  assert.match(await text('#fsStoreInfo'), /저장본 [\d.]+MB/);
  await page.click('#fsSettingsBtn');

  // 바뀐 것만 다시 읽기: 고친 파일·새 파일·지운 파일
  await writeFiles(page, [
    { path: '업체/업체이력.xlsx', sheets: [['이력', [['일자', '거래처', '품목', '금액'], ['2021.03.05', '테스트상사㈜', '샘플품목A', '1,250,000']]]] }, // 메모 탭 없앰
    { path: '출고/2026/새출고.xlsx', sheets: [['Sheet1', [['출고 일자', '품목코드', '거래처명'], ['@D' + day(1), 'NEW-1', '테스트상사']]]] },
  ]);
  await removeFile(page, '옛자료/주문_2023.csv');
  await page.click('#fsRescan');
  await page.waitForTimeout(300);
  await idle();
  await page.waitForFunction(() => /새 파일 1/.test(document.querySelector('#fsStatusText').innerText));
  const st = await text('#fsStatusText');
  assert.match(st, /새 파일 1 · 고친 파일 1 · 없어진 파일 1개/, st);
  await search('테스트상사');
  sum = await text('#fsSummary');
  assert.match(sum, /일치 3줄/, sum); // (주)테스트상사·테스트상사㈜·새출고 (메모 탭 없앰, csv 지움)
  assert.equal((await dates())[0], day(1));

  // 저장본으로 다시 열기: 새로 고침 → 폴더 찾아보기 → 바뀐 게 없으면 다시 읽지 않고 바로 찾기
  await page.evaluate(() => window.__fsTest.save());
  await page.reload();
  await page.click('#openFolderBtn');
  await idle();
  await page.waitForFunction(() => window.__fsTest.state().lastCheck);
  assert.equal(await page.isVisible('#fsConnect'), false, '기억한 폴더로 바로 열림');
  assert.match(await text('#fsFolderInfo'), /파일 4개/);
  assert.equal(await page.isVisible('#fsStatus'), false, '바뀐 게 없으면 상태 줄도 안 뜸');
  await search('테스트상사');
  assert.match(await text('#fsSummary'), /일치 3줄/);

  // 결과 상한
  await writeFiles(page, [{ path: '많음.xlsx', sheets: [['a', [['날짜', '코드']].concat(Array.from({ length: 1500 }, (_, i) => ['@D' + day(i % 300), 'MANY-' + i]))]] }]);
  await page.click('#fsSettingsBtn');
  await page.selectOption('#fsSettings select[data-k="cap"]', '1000');
  await page.click('#fsSettingsBtn');
  await page.click('#fsRescan'); await page.waitForTimeout(300); await idle();
  await search('many');
  sum = await text('#fsSummary');
  assert.match(sum, /일치 1,500줄/, sum);
  assert.match(sum, /최신 1,000줄만 보여요/, sum);
  assert.equal((await dates()).length, 300, '300줄씩 그림');
  await page.click('#fsMoreBtn');
  assert.equal((await dates()).length, 600);
  await page.click('#fsSettingsBtn'); await page.click('#fsDefaults'); await page.waitForTimeout(500);

  // 저장본 지우기
  await page.click('#fsStoreDel'); await page.waitForTimeout(500);
  assert.match(await text('#fsFolderInfo'), /줄 0개/);
  assert.equal(await page.evaluate(async () => { try { await (await navigator.storage.getDirectory()).getFileHandle('folder-search.db'); return true; } catch (e) { return false; } }), false);

  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(); await root.removeEntry('emv-test-folder', { recursive: true }); });
  assert.deepEqual(errors, []);
  server.close();

  // ---- 2부: 파일 더블클릭(file://) ----
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push(e.message));
  p2.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // 메모리 속 흉내 폴더(파일 수정 시각 고정 — 다시 열었을 때 "안 바뀜"으로 보이게)
  const useMock = () => p2.evaluate(async () => {
    const X = __xlsxFactory();
    const mk = aoa => { const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), 'a'); return X.write(wb, { type: 'array', bookType: 'xlsx' }); };
    const tree = { '거래.xlsx': new File([mk([['거래일', '업체'], ['2026.01.02', '(주)테스트상사']])], '거래.xlsx', { lastModified: 1700000000000 }),
      '하위': { '옛것.csv': new File(['날짜,업체\n2020-05-05,테스트 상사\n'], '옛것.csv', { lastModified: 1600000000000 }) } };
    const dir = (name, t) => ({ kind: 'directory', name, queryPermission: async () => 'granted',
      async *entries() { for (const [n, v] of Object.entries(t)) yield [n, v instanceof File ? { kind: 'file', name: n, getFile: async () => v } : dir(n, v)]; } });
    await window.__fsTest.useDir(dir('흉내폴더', tree));
  });
  await p2.goto(url(path.join(ROOT, 'index.html')));
  await p2.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('emv_folder'); q.onsuccess = q.onerror = q.onblocked = r; }));
  assert.equal(await p2.evaluate(async () => { try { await navigator.storage.getDirectory(); return 'opfs'; } catch (e) { return 'blocked'; } }), 'blocked', 'file://에서는 OPFS가 막혀 있어야 이 확인이 의미 있음');
  await useMock();
  await p2.waitForFunction(() => window.__fsTest.state().lastCheck);
  await p2.fill('#fsQ', '상사'); await p2.press('#fsQ', 'Enter'); await p2.waitForTimeout(400);
  assert.match(await p2.$eval('#fsSummary', e => e.innerText), /일치 2줄 · 파일 2개 · 가장 최근 2026-01-02 · 가장 오래된 2020-05-05/);
  assert.equal(await p2.evaluate(() => new Promise(r => { const q = indexedDB.open('emv_folder'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('store'); g.onsuccess = () => r(g.result ? g.result.size : 0); }; })) > 0, true, '저장본이 IndexedDB에');
  await p2.reload();
  await p2.click('#openFolderBtn');
  await p2.waitForTimeout(500);
  assert.match(await p2.$eval('#fsFolderInfo', e => e.innerText), /파일 2개 ▾ · 줄 2개/, '저장본을 불러옴');
  await useMock();
  await p2.waitForFunction(() => window.__fsTest.state().lastCheck);
  assert.equal(await p2.isVisible('#fsStatus'), false, '안 바뀐 파일은 다시 안 읽음');
  assert.deepEqual(errors, []);
  await ctx.close();
  nfs.rmSync(userDir, { recursive: true, force: true });
  console.log('폴더 찾아보기 확인 통과');
}

main().catch(e => { console.error(e); process.exit(1); });
