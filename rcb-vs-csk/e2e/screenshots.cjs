// Saves screenshots of the main screens at phone and desktop size into e2e/out.
// Run with: npm run screenshots
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startServer, GL_ARGS } = require('./server.cjs');

const SIZES = [
  ['phone', 390, 780],
  ['desktop', 1280, 720],
];

async function capture(browser, url, name, w, h, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: name === 'phone' });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(out, `${name}-${n}.png`) });
  const info = () => page.evaluate(() => window.__game.info());
  const scale = (s) => page.evaluate((v) => (window.__game.timeScale = v), s);
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 120000, polling: 50 });
  await page.goto(url);
  await page.waitForFunction(() => window.__game);
  await page.waitForTimeout(1200);
  await shot('01-menu');
  await page.click('[data-act="xi"]');
  await shot('02-xi');
  await page.click('[data-act="xiSave"]');
  await page.click('[data-act="help"]');
  await shot('03-help');
  await page.click('[data-act="closeSheet"]');
  await page.click('[data-opt="overs:2"]');
  await page.click('[data-act="start"]');

  // Batting: before the ball.
  await until(() => window.__game.info().phase === 'runup');
  await page.waitForTimeout(700);
  await scale(0);
  await shot('04-bat-ready');
  // Freeze when the ball is in the zone, then hit a lofted shot.
  await page.evaluate(() => {
    const g = window.__game;
    g.timeScale = 1;
    window.__stage = 0;
    g.onStep = () => {
      const i = g.info();
      if (window.__stage === 0 && i.inZone) {
        window.__stage = 1;
        g.timeScale = 0;
      }
    };
  });
  await until(() => window.__stage === 1);
  await page.waitForTimeout(250);
  await shot('05-ball-in-zone');
  await page.click('[data-shot="loft"]');
  const i = await info();
  await page.evaluate(() => (window.__game.onStep = null));
  await page.mouse.click(i.batter.x + i.labelRadius * 0.8, i.batter.y + i.labelRadius * 0.5);
  await scale(1);
  await page.waitForTimeout(500);
  await scale(0);
  await page.waitForTimeout(200);
  await shot('06-after-hit');
  await scale(1);
  await page.waitForTimeout(1300);
  await scale(0);
  await page.waitForTimeout(200);
  await shot('07-ball-in-field');
  await scale(1);
  await until(() => window.__game.info().state === 'result');
  await page.waitForTimeout(400);
  await shot('08-result');
  // Pause menu.
  await until(() => ['prepare', 'ball'].includes(window.__game.info().state));
  await page.click('[data-act="pause"]');
  await shot('09-pause');
  await page.click('[data-act="resume"]');
  // Play the rest of the innings fast with automatic taps.
  await page.evaluate(() => {
    const g = window.__game;
    g.timeScale = 8;
    const canvas = document.getElementById('scene');
    let n = 0;
    g.onStep = () => {
      const i = g.info();
      if (!i.userBats) return;
      if (i.canSwing && i.inZone) {
        n++;
        const a = n * 1.9;
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: i.batter.x + Math.sin(a) * i.labelRadius, clientY: i.batter.y + Math.cos(a) * i.labelRadius, pointerId: 1, bubbles: true }));
      }
      if (i.canRun && i.runHint === 'safe') g.sim.callRun();
    };
  });
  await until(() => window.__game.info().state === 'break');
  await shot('10-innings-break');
  await scale(1);
  await page.click('[data-act="next"]');
  await until(() => window.__game.info().state === 'pickBowler');
  await page.waitForTimeout(300);
  await shot('11-pick-bowler');
  await page.click('[data-bowler]:not([disabled])');
  await page.waitForTimeout(2000);
  await shot('12-bowl-aim');
  await page.click('[data-act="bowl"]');
  await page.waitForTimeout(350);
  await shot('13-bowl-meter');
  await page.click('[data-act="bowl"]');
  await until(() => window.__game.info().phase === 'flight');
  await scale(0);
  await page.waitForTimeout(200);
  await shot('14-bowl-flight');
  // Finish the match fast.
  await scale(8);
  for (;;) {
    const s = (await info()).state;
    if (s === 'end') break;
    if (s === 'pickBowler') await page.click('[data-bowler]:not([disabled])');
    else if (s === 'bowlAim' || s === 'bowlMeter') await page.click('[data-act="bowl"]');
    else await page.waitForTimeout(100);
  }
  await shot('15-match-result');
  await page.evaluate(() => document.querySelector('.screen').scrollTo(0, 99999));
  await shot('16-match-result-bottom');
  if (errors.length) console.log(name, 'console errors:', errors);
  await page.close();
}

(async () => {
  const out = process.env.OUT || path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ args: GL_ARGS });
  try {
    for (const [name, w, h] of SIZES) {
      if (process.argv[2] && process.argv[2] !== name) continue;
      await capture(browser, server.url, name, w, h, out);
      console.log('saved', name);
    }
  } finally {
    await browser.close();
    server.stop();
  }
})();
