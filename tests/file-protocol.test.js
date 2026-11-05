// 파일 더블클릭(file://)으로 열었을 때 동작 확인 — 서버 없이 index.html을 직접 연다.
// 실행: node tests/file-protocol.test.js   (Playwright + Chromium 필요. 한글 파일 이름을 넘기므로 UTF-8 로케일에서 — 리눅스면 LANG=C.UTF-8)
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
      if (f.b64) data = Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)); // 미리 만들어 둔 파일(tests/fixtures)
      else if (f.csv) data = new TextEncoder().encode('﻿' + f.csv);
      else {
        const wb = X.utils.book_new();
        f.sheets.forEach(([name, aoa]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), name));
        data = X.write(wb, { type: 'array', bookType: f.bookType || 'xlsx' });
      }
      dt.items.add(new File([data], f.name));
    });
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, specs);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { errors.push('alert/confirm 창이 떴음: ' + d.message()); d.dismiss(); }); // 웹(iframe)에선 안 뜨므로 쓰면 안 됨
  const text = sel => page.$eval(sel, e => e.innerText);
  const count = async () => Number((await text('#count')).match(/^([\d,]+)건/)[1].replace(/,/g, ''));
  const settle = () => page.waitForTimeout(500);

  await page.goto(url(path.join(ROOT, 'index.html')));
  // 숨겨야 할 것(알림·확인 막대·위 버튼)이 처음 화면에 보이면 안 됨
  for (const sel of ['#notice', '#resetConfirm', '#topActions', '#colorPop']) assert.equal(await page.isVisible(sel), false, sel + ' 가 보임');

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

  // 처음부터: 취소하면 그대로, 지우기를 누르면 처음 화면
  const reset = async () => {
    await page.click('#resetBtn');
    await page.click('#resetYes');
    await page.waitForSelector('#intro:not([hidden])');
  };
  await page.click('#resetBtn');
  await page.click('#resetNo');
  assert.equal(await page.$eval('#view', e => e.hidden), false);
  await reset();

  // 셀 색깔: 표에 원본 색을 칠하고, 칸마다 쓰인 색으로 거른다 (tests/make-color-fixture.py로 만든 파일)
  const fx = n => ({ name: n, b64: fs.readFileSync(path.join(__dirname, 'fixtures', n)).toString('base64') });
  await drop(page, [fx('색.xlsx'), fx('무색.xlsx'),
    { name: '옛형식.xls', bookType: 'biff8', sheets: [['Sheet1', [['번호', '상태', '금액', '메모'], [10, '정상', 1000, 'y']]]] }]);
  await page.waitForSelector('#view:not([hidden])', { timeout: 30000 });
  await settle();
  summary = await text('#summary');
  assert.match(summary, /10건/);
  assert.match(summary, /색칠된 칸 7개/); // 제목 줄 색, 값 없는 칸 색은 빼고
  assert.match(summary, /색 정보 안내 2개/); // 조건부 서식, .xls
  assert.deepEqual(await page.$$eval('.cbtn', b => b.map(x => x.dataset.ci)), ['1', '2']); // 상태(배경색)·금액(글자색)만
  const styles = await page.$$eval('#body .c[style]', c => c.map(x => x.getAttribute('style')));
  assert.ok(styles.some(x => x.includes('background:#ccc1da')), '테마색+밝기'); // 강조4(8064A2) 60% 밝게
  assert.ok(styles.some(x => x.includes('background:#ccffcc')), '옛 색 번호 42');
  assert.ok(styles.some(x => x.includes('color:#0070c0')), '글자색 rgb');
  assert.ok(styles.some(x => x.includes('color:#c0504d')), '글자색 테마');
  await page.click('.cbtn[data-ci="1"]');
  await page.check('#colorPop input[value="#ff0000"]'); await settle();
  assert.equal(await count(), 3); // 1월 2개 + 칸 순서가 다른 2월 1개
  assert.match(await text('#body'), /2월/);
  await page.check('#colorPop input[value=""]'); await settle();
  assert.equal(await count(), 8); // 빨강 또는 색 없음
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#colorPop'), false);
  assert.match(await page.$eval('.cbtn[data-ci="1"]', e => e.className), /\bon\b/);
  await page.click('#clearBtn'); await settle();
  assert.equal(await count(), 10);
  await reset();

  // 가짜 데이터로 체험(배송상태·금액에 색이 칠해져 있음)
  await page.selectOption('#sampleSize', '10000');
  await page.click('#sampleBtn');
  await page.waitForSelector('#view:not([hidden])', { timeout: 60000 });
  assert.match(await text('#summary'), /10,000건/);
  assert.match(await text('#summary'), /색칠된 칸/);
  assert.equal(await page.$$eval('.cbtn', b => b.length), 2);

  // 저장 · 다시 열기: 파일로(비밀번호 없이/있게), 이 브라우저에
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emv-save-'));
  const download = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#saveFile')]);
    const f = path.join(tmp, dl.suggestedFilename());
    await dl.saveAs(f);
    return f;
  };
  await page.click('#saveBtn');
  const plain = await download();
  assert.match(path.basename(plain), /^엑셀모아보기_.*\.db$/);
  await page.check('#pwOn');
  await page.fill('#pw1', 'ab'); await page.fill('#pw2', 'ab');
  await page.click('#saveFile');
  assert.match(await text('#saveMsg'), /4글자 이상/);
  await page.fill('#pw1', 'test1234'); await page.fill('#pw2', 'test1234');
  const locked = await download();
  assert.match(path.basename(locked), /_비밀번호\.db$/);
  await page.click('#saveLocal');
  await page.waitForFunction(() => /저장했어요|못했어요/.test(document.querySelector('#saveMsg').textContent));
  assert.match(await text('#saveMsg'), /브라우저에 저장했어요/);

  const reopened = async () => {
    await page.waitForSelector('#view:not([hidden])', { timeout: 30000 });
    await settle();
    assert.match(await text('#summary'), /10,000건/);
    assert.match(await text('#summary'), /연 시간/);
    assert.equal(await page.$$eval('.cbtn', b => b.length), 2); // 색 정보도 같이 돌아옴
    await page.click('.cbtn');
    await page.locator('#colorPop input').first().check(); await settle();
    assert.ok((await count()) > 0 && (await count()) < 10000);
    await page.keyboard.press('Escape');
  };
  // 새로 열면 [이어서 보기]
  await page.goto(url(path.join(ROOT, 'index.html')));
  await page.waitForSelector('#resume:not([hidden])');
  assert.match(await text('#resumeInfo'), /파일 2개 · 10,000건/);
  await page.click('#resumeBtn');
  await reopened();
  // 저장본 파일 열기
  await page.goto(url(path.join(ROOT, 'index.html')));
  await page.setInputFiles('#fileInput', plain);
  await reopened();
  // 비밀번호 파일: 틀리면 다시 묻고, 맞으면 열림
  await page.goto(url(path.join(ROOT, 'index.html')));
  await page.setInputFiles('#fileInput', locked);
  await page.waitForSelector('#pwDlg:not([hidden])');
  await page.fill('#pwIn', 'wrong'); await page.click('#pwOk');
  await page.waitForFunction(() => /맞지 않아요/.test(document.querySelector('#pwErr').textContent));
  await page.fill('#pwIn', 'test1234'); await page.click('#pwOk');
  await reopened();
  // 엑셀 모아보기 저장본이 아닌 .db
  const bogus = path.join(tmp, '아무파일.db');
  fs.writeFileSync(bogus, 'not a database');
  await page.setInputFiles('#fileInput', bogus);
  await page.waitForSelector('#notice:not([hidden])');
  assert.match(await text('#noticeText'), /저장본이 아니에요/);
  // [지우기]하면 [이어서 보기]가 사라짐
  await page.goto(url(path.join(ROOT, 'index.html')));
  await page.waitForSelector('#resume:not([hidden])');
  await page.click('#resumeDel');
  await page.waitForSelector('#resume', { state: 'hidden' });

  // 직원용 파일: 직원마다 고른 줄·칸만 담은 저장본. 뺀 칸·다른 직원 줄은 파일 바이트에도 없어야 함
  await page.selectOption('#sampleSize', '10000');
  await page.click('#sampleBtn');
  await page.waitForSelector('#view:not([hidden])', { timeout: 60000 });
  await page.click('#staffBtn');
  await page.waitForSelector('#staffPanel:not([hidden])');
  await page.selectOption('#roleCol', '담당자');
  const r1 = page.locator('.role').nth(0);
  await r1.locator('.rname').fill('김테스트');
  await r1.locator('input[data-f="pw"]').fill('staff1');
  await r1.locator('input[data-kind="v"][value="샘플담당자A"]').check();
  await r1.locator('input[data-kind="c"][value="고객명"]').uncheck();
  assert.match(await r1.locator('.sum').textContent(), /칸 10개 · 비밀번호 있음/);
  await page.click('#roleAdd');
  const r2 = page.locator('.role').nth(1);
  await r2.locator('.rname').fill('이샘플');
  await r2.locator('.vfind').fill('B');
  await r2.locator('button[data-act="vall"]').click(); // 찾기로 좁힌 값만 모두 선택
  await r2.locator('button[data-act="cnone"]').click();
  for (const c of ['주문일', '금액', '배송상태', '담당자']) await r2.locator('input[data-kind="c"][value="' + c + '"]').check();
  assert.match(await r2.locator('.sum').textContent(), /칸 4개 · 비밀번호 없음/);
  const [zdl] = await Promise.all([page.waitForEvent('download'), page.click('#roleZip')]);
  assert.match(zdl.suggestedFilename(), /^직원용파일_.*\.zip$/);
  const zipBytes = fs.readFileSync(await zdl.path());
  // 압축 없는 zip이라 파일 이름 뒤에 내용이 그대로 — 이름(UTF-8 표시)과 내용을 직접 꺼냄
  const unzip = buf => {
    const out = {};
    for (let p = 0; buf.readUInt32LE(p) === 0x04034b50;) {
      assert.equal(buf.readUInt16LE(p + 6) & 0x800, 0x800); // 한글 이름 = UTF-8
      const size = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26);
      const name = buf.slice(p + 30, p + 30 + nlen).toString('utf8');
      out[name] = buf.slice(p + 30 + nlen, p + 30 + nlen + size);
      p += 30 + nlen + size;
    }
    return out;
  };
  const staffFiles = unzip(zipBytes);
  const names = Object.keys(staffFiles);
  assert.equal(names.length, 2);
  const kim = names.find(n => n.includes('김테스트')), lee = names.find(n => n.includes('이샘플'));
  assert.equal(staffFiles[kim].slice(0, 13).toString(), 'EXCELMOA-ENC1'); // 비밀번호 → 통째로 암호화
  const leeBytes = staffFiles[lee];
  assert.equal(leeBytes.slice(0, 15).toString(), 'SQLite format 3');
  for (const leak of ['테스트고객', 'ORD-', '샘플담당자A', '샘플담당자C', '카드']) assert.ok(!leeBytes.includes(Buffer.from(leak)), '직원 파일에 빠져야 할 값이 있음: ' + leak);
  // 설정은 다시 열어도 기억
  await page.click('#staffClose');
  await page.click('#staffBtn');
  assert.deepEqual(await page.$$eval('.role .rname', x => x.map(e => e.value)), ['김테스트', '이샘플']);
  // 직원이 자기 파일을 열면: 정해진 줄·칸만, 직원용 파일 표시, [직원용 파일] 버튼 없음
  fs.writeFileSync(path.join(tmp, 'kim.db'), staffFiles[kim]);
  fs.writeFileSync(path.join(tmp, 'lee.db'), leeBytes);
  await page.goto(url(path.join(ROOT, 'index.html')));
  await page.setInputFiles('#fileInput', path.join(tmp, 'kim.db'));
  await page.waitForSelector('#pwDlg:not([hidden])');
  await page.fill('#pwIn', 'staff1'); await page.click('#pwOk');
  await page.waitForSelector('#view:not([hidden])');
  await settle();
  assert.match(await text('#summary'), /직원용 파일 김테스트/);
  assert.equal(await page.isVisible('#staffBtn'), false);
  assert.ok(!(await page.$$eval('#head .hc .t', x => x.map(e => e.textContent))).includes('고객명'));
  await page.fill('#search', '샘플담당자B'); await settle();
  assert.equal(await count(), 0);
  await page.goto(url(path.join(ROOT, 'index.html')));
  await page.setInputFiles('#fileInput', path.join(tmp, 'lee.db'));
  await page.waitForSelector('#view:not([hidden])');
  await settle();
  assert.match(await text('#summary'), /직원용 파일 이샘플/);
  assert.equal(await page.$$eval('#head .hc[data-i]', x => x.length), 4);
  assert.equal(await page.$$eval('.cbtn', x => x.length), 2); // 남긴 칸(금액·배송상태)의 색은 그대로
  await page.fill('#search', '테스트고객'); await settle();
  assert.equal(await count(), 0);

  fs.rmSync(tmp, { recursive: true, force: true });
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
