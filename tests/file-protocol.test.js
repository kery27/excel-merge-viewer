// 파일 더블클릭(file://)으로 열었을 때 동작 확인 — 서버 없이 index.html을 직접 연다.
// 실행: node tests/file-protocol.test.js   (Playwright + Chromium 필요)
// 가짜 데이터만 쓴다. 엑셀 파일은 페이지 안에서 vendor의 SheetJS로 만들어 드래그 앤 드롭처럼 넣는다.
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const url = p => 'file://' + encodeURI(p);

// 페이지 안에서 가짜 xlsx/csv를 만들어 drop 이벤트로 넣기
async function drop(page, specs) {
  await page.evaluate(specs => {
    const X = window.XLSX || __xlsxFactory();
    const dt = new DataTransfer();
    specs.forEach(f => {
      let data;
      if (f.csv) data = new TextEncoder().encode('﻿' + f.csv);
      else {
        const wb = X.utils.book_new();
        f.sheets.forEach(([name, aoa]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), name));
        data = X.write(wb, { type: 'array', bookType: 'xlsx' });
      }
      dt.items.add(new File([data], f.name));
    });
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, specs);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { errors.push('alert/confirm 창이 떴음: ' + d.message()); d.dismiss(); }); // 웹(iframe)에선 안 뜨므로 쓰면 안 됨
  const text = sel => page.$eval(sel, e => e.innerText);
  const count = async () => Number((await text('#count')).match(/^([\d,]+)건/)[1].replace(/,/g, ''));
  const settle = () => page.waitForTimeout(500);

  await page.goto(url(path.join(ROOT, 'index.html')));

  // 합치기: 칸 순서가 달라도 합치고, 제목이 다른 탭·빈 탭은 빼고 알려 준다
  const H = ['주문번호', '주문일', '고객', '금액'];
  await drop(page, [
    { name: '2026년.xlsx', sheets: [
      ['1월', [H, ['A1', '2026-01-01', '테스트회사1', 1000], ['A2', '2026-01-02', '테스트회사2', 2000]]],
      ['2월', [['금액', '고객', '주문일', '주문번호'], [3000, '테스트회사3', '2026-02-01', 'A3']]],
      ['메모', [['메모'], ['아무 내용']]],
      ['빈탭', []],
    ] },
    { name: '2025년.xlsx', sheets: [['Sheet1', [H, ['B1', '2025-12-01', '샘플회사1', 9000], ['B2', '2025-12-02', '샘플회사2', 500]]]] },
    { name: '2024년.csv', csv: H.join(',') + '\nC1,2024-05-05,CSV회사,700\n' },
  ]);
  await page.waitForSelector('#view:not([hidden])', { timeout: 30000 });
  await settle();
  let summary = await text('#summary');
  assert.match(summary, /파일 3개 · 탭 4개에서 6건/);
  assert.match(summary, /합치지 않은 탭·파일 2개/);
  await page.click('#summary summary');
  summary = await text('#summary');
  assert.match(summary, /메모 — 제목 줄이 달라서/);
  assert.match(summary, /빈탭 — 데이터가 없는 탭/);
  assert.equal(await count(), 6);

  // 검색 · 칸 필터 · 정렬
  await page.fill('#search', '테스트회사3'); await settle();
  assert.equal(await count(), 1);
  assert.match(await text('#body'), /A3/); // 칸 순서가 다른 탭도 제자리에 들어감
  await page.click('#clearBtn'); await settle();
  const filters = await page.$$('#head input');
  await filters[2].fill('샘플'); await settle();
  assert.equal(await count(), 2);
  await page.click('#clearBtn'); await settle();
  const titles = await page.$$('#head .hc[data-i] .t');
  await titles[3].click(); await titles[3].click(); await settle(); // 금액 내림차순
  assert.match((await text('#body')).split('\n').slice(0, 6).join(' '), /B1/);
  await page.click('#clearBtn'); await settle();

  // 파일별 보기
  const opts = await page.$$eval('#srcSel option', o => o.map(x => x.textContent));
  assert.ok(opts.some(o => o.startsWith('2026년.xlsx 전체 (3건)')));
  assert.ok(opts.some(o => o.includes('탭 2월 (1건)')));

  // 같은 이름 파일을 다시 넣으면 교체
  await drop(page, [{ name: '2025년.xlsx', sheets: [['Sheet1', [H, ['B9', '2025-12-31', '교체확인회사', 1]]]] }]);
  await page.waitForFunction(() => /5건/.test(document.querySelector('#summary').innerText), null, { timeout: 30000 });
  await settle();
  await page.fill('#search', '샘플회사'); await settle();
  assert.equal(await count(), 0);
  await page.fill('#search', '교체확인'); await settle();
  assert.equal(await count(), 1);

  // 가짜 데이터로 체험
  await page.click('#resetBtn');
  await page.click('#resetNo');
  assert.equal(await page.$eval('#view', e => e.hidden), false); // 취소하면 그대로
  await page.click('#resetBtn');
  await page.click('#resetYes');
  await page.waitForSelector('#intro:not([hidden])');
  await page.selectOption('#sampleSize', '10000');
  await page.click('#sampleBtn');
  await page.waitForSelector('#view:not([hidden])', { timeout: 60000 });
  assert.match(await text('#summary'), /10,000건/);
  assert.deepEqual(errors, []);

  // vendor 폴더 없이 index.html만 연 경우(압축 파일 안에서 바로 연 경우 등) 안내가 뜬다
  const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'emv-'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(lone, 'index.html'));
  const p2 = await browser.newPage();
  await p2.goto(url(path.join(lone, 'index.html')));
  assert.match(await p2.$eval('#drop', e => e.innerText), /vendor 폴더/);
  assert.equal(await p2.$eval('#sampleBtn', e => e.disabled), true);
  fs.rmSync(lone, { recursive: true, force: true });

  await browser.close();
  console.log('file:// 확인 통과');
}

main().catch(e => { console.error(e); process.exit(1); });
