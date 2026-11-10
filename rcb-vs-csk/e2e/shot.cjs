// Usage: node e2e/shot.cjs <url> <out.png> [width] [height] [waitMs]
const { chromium } = require('playwright');
(async () => {
  const [url, out, w = '900', h = '600', wait = '900'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(url);
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out });
  await browser.close();
})();
