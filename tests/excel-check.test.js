// 엑셀 점검 자동 확인 — 수식 오류값·병합된 칸·안 보이는 글자를 빼지 않고 고쳐 넣고, 무엇을 고쳤는지 알리는지.
// 실행: LANG=C.UTF-8 node tests/excel-check.test.js   (Playwright + Chromium 필요). 가짜 데이터만.
// 파일 모아보기(끌어다 놓기)와 폴더 찾아보기(메모리 흉내 폴더) 둘 다, 파일 더블클릭(file://)으로 연 화면에서.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path'), os = require('os'), nfs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const url = p => 'file://' + encodeURI(p);

// 페이지 안에서 특수 칸이 든 xlsx를 만든다: 2행 업체명 #N/A, 3~5행 업체명 병합(값은 3행에만), 6행 업체명에 폭 없는 공백
const MAKE = () => {
  const X = __xlsxFactory();
  const ws = X.utils.aoa_to_sheet([
    ['일자', '업체명', '금액'],
    ['2026-01-01', '', 100],
    ['2026-01-02', '병합상사', 200],
    ['2026-01-03', '', 300],
    ['2026-01-04', '', 400],
    ['2026-01-05', '보이지​않는상사', 500],
  ]);
  ws.B2 = { t: 'e', v: 0x2A, w: '#N/A' };
  ws['!merges'] = [{ s: { r: 2, c: 1 }, e: { r: 4, c: 1 } }];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '거래');
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
};

async function main() {
  const userDir = nfs.mkdtempSync(path.join(os.tmpdir(), 'emv-ck-'));
  const ctx = await chromium.launchPersistentContext(userDir, {});
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const text = sel => page.$eval(sel, e => e.innerText);
  const settle = () => page.waitForTimeout(500);
  await page.goto(url(path.join(ROOT, 'index.html')));
  await page.evaluate(() => { localStorage.clear(); return new Promise(r => { const q = indexedDB.deleteDatabase('emv_folder'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await page.reload();

  // ---- 파일 모아보기: 채우기 끔(기본) ----
  const drop = () => page.evaluate(src => {
    const data = (0, eval)('(' + src + ')')();
    const dt = new DataTransfer(); dt.items.add(new File([data], '점검.xlsx'));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, MAKE.toString());
  assert.equal(await page.isChecked('#fillMergedIntro'), false);
  await drop();
  await page.waitForSelector('#view:not([hidden])', { timeout: 30000 }); await settle();
  await page.$$eval('#summary details', d => d.forEach(x => { x.open = true; }));
  let sm = await text('#summary');
  assert.match(sm, /확인할 것 1곳/, sm);
  assert.match(sm, /수식 오류값 1칸/);
  assert.match(sm, /병합된 칸 1곳\(첫 칸에만 값/);
  assert.match(sm, /안 보이는 글자가 든 칸 1칸/);
  assert.match(sm, /2행 업체명\(오류값\)/);
  assert.match(sm, /3행 업체명 \(3줄\)\(병합\)/);
  // 오류값은 빈 칸이 아니라 글자로, 흐리게
  assert.equal(await page.$eval('.trow .errv', e => e.textContent), '#N/A');
  // 안 보이는 글자가 섞여도 찾기에 걸림
  await page.fill('#search', '보이지않는상사'); await settle();
  assert.match(await text('#count'), /^1건/);
  await page.fill('#search', '병합상사'); await settle();
  assert.match(await text('#count'), /^1건/, '채우기 끔 → 병합 첫 칸만');
  // 찾기: 띄어 쓴 그대로 한 덩어리, +로 이으면 모두 들어간 줄
  await page.fill('#search', '병합 상사'); await settle();
  assert.match(await text('#count'), /^0건/);
  await page.fill('#search', '병합상사+200'); await settle();
  assert.match(await text('#count'), /^1건/);
  await page.fill('#search', '병합상사+300'); await settle();
  assert.match(await text('#count'), /^0건/);
  // 칸 필터 패널 "값 찾기"에서 엔터 = 찾은 값만 남기고 적용(엑셀처럼)
  await page.fill('#search', ''); await settle();
  await page.click('.filterBtn[data-k="금액"]'); await settle();
  await page.fill('#fpSearchInput', '200'); await page.press('#fpSearchInput', 'Enter'); await settle();
  assert.equal(await page.isHidden('#filterPanel'), true);
  assert.match(await text('#count'), /^1건/);
  await page.click('#clearBtn'); await settle();

  // ---- 채우기 켬: 처음부터 다시 넣으면 병합된 3줄 모두 업체명이 채워짐 ----
  await page.click('#resetBtn'); await page.click('#resetYes'); await settle();
  await page.check('#fillMergedIntro');
  await drop();
  await page.waitForSelector('#view:not([hidden])', { timeout: 30000 }); await settle();
  await page.fill('#search', '병합상사'); await settle();
  assert.match(await text('#count'), /^3건/);
  await page.$$eval('#summary details', d => d.forEach(x => { x.open = true; }));
  assert.match(await text('#summary'), /같은 값으로 2칸 채움/);

  // ---- 폴더 찾아보기: 같은 파일을 메모리 흉내 폴더로(채우기 켠 상태 그대로 — 설정 공용) ----
  await page.click('#resetBtn'); await page.click('#resetYes'); await settle();
  await page.click('#openFolderBtn');
  await page.evaluate(async src => {
    const data = (0, eval)('(' + src + ')')();
    // 거래명세서 꼴: 맨 위 한 칸 제목 + 칸 3개에 걸친 안내 글(거래처·기간·담당) + 빈 줄 + 표
    const X = __xlsxFactory();
    const wb2 = X.utils.book_new();
    X.utils.book_append_sheet(wb2, X.utils.aoa_to_sheet([
      ['거래명세서'],
      ['거래처: 안내상사', '', '기간: 2026년 11월', '', '담당: 샘플담당'],
      [],
      ['일자', '품목', '수량', '단가', '금액'],
      ['2026-11-02', '샘플품목A', 2, 1000, 2000],
      ['2026-11-05', '샘플품목B', 1, 3000, 3000],
    ]), '명세');
    const tree = { '점검.xlsx': new File([data], '점검.xlsx', { lastModified: 1700000000000 }),
      '명세서.xlsx': new File([X.write(wb2, { type: 'array', bookType: 'xlsx' })], '명세서.xlsx', { lastModified: 1700000000000 }) };
    const dir = (name, t) => ({ kind: 'directory', name, queryPermission: async () => 'granted',
      async *entries() { for (const [n, v] of Object.entries(t)) yield [n, { kind: 'file', name: n, getFile: async () => v }]; } });
    await window.__fsTest.useDir(dir('점검폴더', tree));
  }, MAKE.toString());
  await page.waitForFunction(() => window.__fsTest.state().lastCheck);
  const pb = await text('#fsProblems');
  assert.match(pb, /확인할 것 1개 파일/, pb);
  await page.click('#fsProblems summary');
  const pb2 = await text('#fsProblems');
  assert.match(pb2, /수식 오류값 1칸/);
  assert.match(pb2, /같은 값으로 2칸 채움/);
  assert.match(pb2, /거래 2행 업체명\(오류값\)/);
  await page.fill('#fsQ', '병합상사'); await page.press('#fsQ', 'Enter'); await settle();
  assert.match(await text('#fsSummary'), /일치 3줄/);
  // 제목 줄 고르기: 칸 3개에 걸친 안내 글이 아니라 4행 "일자·품목…"이 제목 줄
  await page.fill('#fsQ', '샘플품목A'); await page.press('#fsQ', 'Enter'); await settle();
  assert.match(await page.$eval('.fsGroup thead', e => e.innerText.replace(/\s+/g, ' ')), /일자 행 일자 품목 수량 단가 금액/);
  // 제목 줄 위 안내 글도 찾기에 걸리고, 날짜는 그 표의 가장 최근 날짜
  await page.fill('#fsQ', '안내상사'); await page.press('#fsQ', 'Enter'); await settle();
  assert.match(await text('#fsSummary'), /표 안에서는 일치하는 줄이 없고, 표 위 안내 글 1줄에서 찾았어요 · 파일 1개/); // 건수에 안내 글을 섞지 않음
  assert.equal(await page.$eval('#fsResults tbody td.fsD', e => e.textContent), '2026-11-05'); // 날짜는 그 표의 가장 최근 날짜
  assert.match(await text('.fsGroupHead'), /명세서\.xlsx › 명세 · 표 위쪽 안내 글/);
  assert.match(await text('#fsResults tbody'), /거래처: 안내상사 · 기간: 2026년 11월 · 담당: 샘플담당/);
  // 표 안과 안내 글 둘 다에 걸리면: 건수는 표 줄만, 안내 글은 따로
  await page.fill('#fsQ', '샘플'); await page.press('#fsQ', 'Enter'); await settle();
  assert.match(await text('#fsSummary'), /일치 2줄 · 표 위 안내 글 1줄 · 파일 1개 · 가장 최근 2026-11-05 · 가장 오래된 2026-11-02/);
  // 위쪽 "줄 N개"도 표 데이터만(점검.xlsx 5줄 + 명세서 2줄, 안내 글 2줄은 빼고)
  assert.match(await text('#fsFolderInfo'), /파일 2개 · 줄 7개/);
  await page.fill('#fsQ', '보이지않는상사'); await page.press('#fsQ', 'Enter'); await settle();
  assert.match(await text('#fsSummary'), /일치 1줄/);
  await page.fill('#fsQ', '100'); await page.press('#fsQ', 'Enter'); await settle();
  assert.equal(await page.$eval('#fsResults td.errv', e => e.textContent), '#N/A');
  // 설정에서 채우기를 끄면 전부 다시 읽어 병합 첫 칸만
  await page.click('#fsSettingsBtn');
  await page.uncheck('#fsSettings input[data-k="fillMerged"]');
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !window.__fsTest.state().syncing);
  assert.equal(await page.isChecked('#fillMergedIntro'), false, '두 입구 설정 공용');
  await page.fill('#fsQ', '병합상사'); await page.press('#fsQ', 'Enter'); await settle();
  assert.match(await text('#fsSummary'), /일치 1줄/);

  assert.deepEqual(errors, []);
  await ctx.close();
  nfs.rmSync(userDir, { recursive: true, force: true });
  console.log('엑셀 점검 확인 통과');
}

main().catch(e => { console.error(e); process.exit(1); });
