// Headless browser test: plays a full 2-over match (bat first, then bowl).
// It taps in every direction, checks that each clean shot goes in the tapped
// direction, and checks that there are no console errors.
// Run with: npm run e2e
const { chromium } = require('playwright');
const { startServer, GL_ARGS } = require('./server.cjs');

const DIRS = [
  ['straight', 0, 1],
  ['off or leg (left)', -1, 0],
  ['leg or off (right)', 1, 0],
  ['behind', 0, -1],
  ['front left', -1, 1],
  ['front right', 1, 1],
  ['back left', -1, -1],
  ['back right', 1, -1],
];

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, hasTouch: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('page error: ' + e.message));
  try {
    await page.goto(server.url + '?test=1');
    await page.waitForFunction(() => window.__game && window.__game.info().state === 'menu');

    // Menu: 2 overs, bat first, normal.
    await page.click('[data-opt="overs:2"]');
    await page.click('[data-opt="first:bat"]');
    await page.click('[data-act="start"]');
    await page.waitForFunction(() => window.__game.info().innings === 1);

    // In-page controller for batting. It taps the canvas with real pointer events
    // at the moment the ball is in the timing zone, and presses RUN on safe calls.
    await page.evaluate((dirs) => {
      const g = window.__game;
      g.timeScale = 5;
      const log = (window.__log = { taps: [], balls: [], runPresses: 0 });
      let ball = -1;
      let tapped = false;
      let seenDone = true;
      const canvas = document.getElementById('scene');
      const runBtn = document.querySelector('[data-q="run"]');
      g.onStep = () => {
        const i = g.info();
        if (!i.userBats) return;
        if (i.state === 'ball' && i.phase === 'runup' && seenDone) {
          seenDone = false;
          tapped = false;
          ball++;
        }
        if (i.state === 'ball' && i.canSwing && i.inZone && !tapped) {
          tapped = true;
          const d = dirs[ball % dirs.length];
          const r = i.labelRadius;
          const x = i.batter.x + d[1] * r;
          const y = i.batter.y + d[2] * r;
          canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true }));
          canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', bubbles: true }));
          log.taps.push({ ball, dir: d[0], expected: Math.atan2(d[1], d[2]), hand: i.strikerHand });
        }
        if (i.state === 'ball' && i.canRun && i.runHint === 'safe') {
          runBtn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, bubbles: true, cancelable: true }));
          log.runPresses++;
        }
        if (i.state === 'result' && !seenDone) {
          seenDone = true;
          log.balls.push({ ball, tapped, ...i.last });
        }
      };
    }, DIRS);

    // Drive the rest of the match from outside the page.
    const start = Date.now();
    let bowled = 0;
    let sawBreak = false;
    for (;;) {
      if (Date.now() - start > 9 * 60 * 1000) throw new Error('Timeout: the match did not finish');
      const i = await page.evaluate(() => window.__game.info());
      if (i.state === 'end') break;
      if (i.state === 'break') {
        sawBreak = true;
        await page.click('[data-act="next"]');
      } else if (i.state === 'pickBowler') {
        await page.click('[data-bowler]:not([disabled])');
      } else if (i.state === 'bowlAim') {
        // Change the variation on some balls, tap the pitch, then start the meter.
        if (bowled % 3 === 1) await page.click('[data-var]:nth-child(2)');
        const b = i.batter;
        await page.mouse.click(b.x + ((bowled % 3) - 1) * 6, b.y + 70 + (bowled % 4) * 22);
        await page.click('[data-act="bowl"]');
      } else if (i.state === 'bowlMeter') {
        await page.waitForTimeout(60 + (bowled % 5) * 25);
        await page.click('[data-act="bowl"]');
        bowled++;
      } else {
        await page.waitForTimeout(120);
      }
    }

    const final = await page.evaluate(() => window.__game.info());
    const log = await page.evaluate(() => window.__log);
    const text = await page.evaluate(() => document.querySelector('.result-line')?.textContent ?? '');
    const cards = await page.evaluate(() => document.querySelectorAll('table.sc').length);
    const wagon = await page.evaluate(() => document.querySelectorAll('.wagon svg').length);
    const potm = await page.evaluate(() => !!document.querySelector('.potm'));

    // ---- Checks ----
    if (!final.complete) fail('match is not complete');
    if (!final.result || !text.includes(final.result)) fail(`result screen text is wrong: "${text}"`);
    if (!sawBreak) fail('innings break screen did not show');
    if (cards < 2 || wagon < 1 || !potm) fail(`result screen is not complete (tables ${cards}, wagon ${wagon}, potm ${potm})`);
    if (bowled < 1) fail('no ball was bowled by the player');
    if (log.taps.length < 8 && log.balls.length >= 8) fail(`only ${log.taps.length} taps`);
    const seen = new Set(log.taps.map((t) => t.dir));
    if (log.balls.length >= 8) for (const d of DIRS) if (!seen.has(d[0])) fail(`direction not tapped: ${d[0]}`);

    let clean = 0;
    console.log('Batting (ball, tapped direction, shot, result):');
    for (const t of log.taps) {
      const b = log.balls.find((x) => x.ball === t.ball);
      if (!b) continue;
      const aimedOk = b.aimed !== null && Math.abs(Math.atan2(Math.sin(b.aimed - t.expected), Math.cos(b.aimed - t.expected))) < 0.02;
      if (b.type && !aimedOk) fail(`ball ${t.ball}: aimed angle ${b.aimed} does not match the tap (${t.expected})`);
      let dev = null;
      if (b.contact === 'clean') {
        clean++;
        dev = Math.abs(Math.atan2(Math.sin(b.angle - t.expected), Math.cos(b.angle - t.expected)));
        if (dev > 0.6) fail(`ball ${t.ball}: shot went ${dev.toFixed(2)} rad away from the tapped direction (${t.dir})`);
      }
      console.log(`  ${String(t.ball + 1).padStart(2)}  ${t.hand}H  ${t.dir.padEnd(18)} ${(b.name ?? '-').padEnd(15)} ${b.contact ?? '-'}/${b.timing ?? '-'}  ${dev === null ? '' : 'off by ' + ((dev * 180) / Math.PI).toFixed(0) + ' deg  '}=> ${b.text}`);
    }
    if (log.taps.length && clean < Math.min(4, log.taps.length - 2)) fail(`only ${clean} clean hits from ${log.taps.length} taps in the zone`);
    console.log(`Taps: ${log.taps.length}, clean hits: ${clean}, run presses: ${log.runPresses}, balls bowled by the player: ${bowled}`);
    console.log(`Result: ${final.result}`);
    if (errors.length) fail('console errors:\n  ' + errors.join('\n  '));
    else console.log('Console errors: none');
    if (!process.exitCode) console.log('PASS');
  } catch (e) {
    fail(e.stack || String(e));
    if (errors.length) console.error('console errors:\n  ' + errors.join('\n  '));
  } finally {
    await browser.close();
    server.stop();
  }
})();
