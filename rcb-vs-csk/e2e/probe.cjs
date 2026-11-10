// Development probe: plays a few balls and saves screenshots. Usage: node e2e/probe.cjs [w] [h] [first]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [w = '390', h = '780', first = 'bat', tag = 'p'] = process.argv.slice(2);
  const out = process.env.OUT || path.join(__dirname, 'out');
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGE: ' + e.message));
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => window.__game);
  await page.waitForTimeout(1500);
  const shot = async (n) => page.screenshot({ path: path.join(out, `${tag}-${n}.png`) });
  await shot('01-menu');
  if (first === 'bowl') await page.click('[data-opt="first:bowl"]');
  await page.click('[data-opt="overs:2"]');
  await page.click('[data-act="start"]');
  await page.waitForTimeout(1600);
  await shot('02-start');
  const info = () => page.evaluate(() => window.__game.info());
  console.log(JSON.stringify(await info()).slice(0, 400));
  if (first === 'bat') {
    await page.waitForFunction(() => window.__game.info().phase === 'runup', null, { timeout: 20000 });
    await page.waitForTimeout(900);
    await shot('03-runup');
    // Tap in the zone, to the off side.
    await page.evaluate(() => new Promise((res) => {
      const g = window.__game;
      g.onStep = () => {
        if (g.info().inZone) {
          const i = g.info();
          const c = document.getElementById('scene');
          c.dispatchEvent(new PointerEvent('pointerdown', { clientX: i.batter.x - 90, clientY: i.batter.y + 30, pointerId: 1, bubbles: true }));
          g.onStep = null;
          res();
        }
      };
    }));
    await shot('04-hit');
    await page.waitForTimeout(450);
    await shot('05-after');
    await page.waitForTimeout(900);
    await shot('06-field');
    await page.waitForFunction(() => window.__game.info().state === 'result', null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await shot('07-result');
    console.log(JSON.stringify((await info()).last));
  } else {
    await shot('03-pick');
    await page.click('[data-bowler]:not([disabled])');
    await page.waitForTimeout(1800);
    await shot('04-aim');
    await page.click('[data-act="bowl"]');
    await page.waitForTimeout(400);
    await shot('05-meter');
    await page.click('[data-act="bowl"]');
    await page.waitForTimeout(1500);
    await shot('06-runup');
    await page.waitForFunction(() => window.__game.info().phase === 'flight', null, { timeout: 30000 });
    await page.waitForTimeout(350);
    await shot('07-flight');
    await page.waitForFunction(() => window.__game.info().state === 'result', null, { timeout: 30000 });
    await shot('08-result');
    console.log(JSON.stringify((await info()).last));
  }
  const i = await info();
  console.log('fps', i.fps.toFixed(1), 'calls', i.render.calls, 'tris', i.render.triangles);
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
