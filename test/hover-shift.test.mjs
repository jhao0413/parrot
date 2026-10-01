/**
 * E2E 验证：加载扩展 → 打开本地英文页 → 悬停段落 → 按 Shift → 断言译文节点出现。
 * 覆盖：语义标签段落（p）与 div 正文段落（选择器兜底路径）。
 * 前置：/tmp/cft-o 下有 Chrome for Testing（支持 --load-extension）。
 * 运行：node test/hover-shift.test.mjs
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const page1 = `<!doctype html><html lang="en"><body>
  <p id="target-p">The quick brown fox jumps over the lazy dog. This paragraph is used to test hover shift translation.</p>
  <div id="target-div">Hello world, this line is plain text inside a bare div element without any semantic paragraph tag.</div>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page1);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: '/tmp/cft-o/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: false, // MV3 扩展需要 headed（新 headless 也支持，但稳妥起见）
  args: [
    '--disable-extensions-except=/Users/jhao/Projects/parrot/.output/chrome-mv3',
    '--load-extension=/Users/jhao/Projects/parrot/.output/chrome-mv3',
    '--enable-unsafe-extension-loading', // Chrome 137+ 需要
    '--no-first-run',
    '--window-size=900,700',
  ],
});

async function check(page, selector) {
  const el = await page.$(selector);
  const box = await el.boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await sleep(300);
  // 记录 loading 期间占位节点的位置与 display（行内、不换行）
  await page.evaluate(() => {
    window.__loadingSeen = [];
    const mo = new MutationObserver(() => {
      for (const n of document.querySelectorAll('[data-mt-trans].parrot-loading')) {
        window.__loadingSeen.push({
          insideParagraph: n.parentElement?.hasAttribute('data-mt-p') ?? false,
          display: getComputedStyle(n).display,
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.keyboard.down('Shift');
  await page.keyboard.up('Shift');
  await sleep(200);
  const loadingSeen = await page.evaluate(() => window.__loadingSeen);
  await sleep(1500);
  const final = await page.evaluate((sel) => {
    const p = document.querySelector(sel);
    const next = p.nextElementSibling;
    return {
      paraAttr: p.getAttribute('data-mt-p'),
      transAttr: next?.getAttribute('data-mt-trans') ?? null,
      transText: next?.getAttribute('data-mt-trans') ? next.textContent : null,
      transBlock: next ? getComputedStyle(next).display : null,
      paraTextIntact: !p.querySelector('[data-mt-trans]'), // 段内不应残留译文节点
    };
  }, selector);
  return { loadingSeen, ...final };
}

try {
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 5000 }).catch(() => null);
  if (!sw) throw new Error('扩展未加载：service worker 不存在');

  const page = await browser.newPage();
  page.on('console', (m) => console.log('[console]', m.text()));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await sleep(1000); // 等 content script 注入 + 初始化

  const pResult = await check(page, '#target-p');
  console.log('P   :', JSON.stringify(pResult));
  const divResult = await check(page, '#target-div');
  console.log('DIV :', JSON.stringify(divResult));

  const inlineOk = (r) =>
    r.loadingSeen.some((s) => s.insideParagraph && s.display === 'inline-block');
  const pass =
    pResult.transText && divResult.transText &&
    pResult.transBlock === 'block' && divResult.transBlock === 'block' &&
    pResult.paraTextIntact && divResult.paraTextIntact &&
    inlineOk(pResult) && inlineOk(divResult);
  console.log(pass ? '✅ 通过：loading 行内贴段末，译文块级在段后' : '❌ 未通过');
  process.exitCode = pass ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
