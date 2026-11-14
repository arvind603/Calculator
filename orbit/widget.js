// Orbit: your day and your year at a glance. For the Scriptable app.
// It works in the small, medium and large widget sizes. There is nothing to set up.
// The ring is a 24-hour clock: noon is at the top and midnight is at the bottom.
// The ring colors show night, twilight and daylight for your location. The bead shows the time now.

const QUOTES = [
  ['Waste no more time arguing what a good man should be. Be one.', 'Marcus Aurelius'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['The journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant'],
  ['Well begun is half done.', 'Aristotle'],
  ['No man is free who is not master of himself.', 'Epictetus'],
  ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['Genius is one percent inspiration and ninety-nine percent perspiration.', 'Thomas Edison'],
  ['If I have seen further, it is by standing on the shoulders of giants.', 'Isaac Newton'],
  ['Imagination is more important than knowledge.', 'Albert Einstein'],
  ['The best way out is always through.', 'Robert Frost'],
  ['How we spend our days is, of course, how we spend our lives.', 'Annie Dillard'],
  ['Arise, awake, and stop not till the goal is reached.', 'Swami Vivekananda'],
  ['Where there is love there is life.', 'Mahatma Gandhi'],
  ['Fall seven times, stand up eight.', 'Japanese proverb'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
  ['Lost time is never found again.', 'Benjamin Franklin'],
  ['To improve is to change; to be perfect is to change often.', 'Winston Churchill'],
  ['The harder the conflict, the more glorious the triumph.', 'Thomas Paine'],
  ['Do the thing and you will have the power.', 'Ralph Waldo Emerson'],
  ['Nothing great was ever achieved without enthusiasm.', 'Ralph Waldo Emerson'],
  ['Not all those who wander are lost.', 'J. R. R. Tolkien'],
  ['There is no substitute for hard work.', 'Thomas Edison'],
  ['Either write something worth reading or do something worth writing.', 'Benjamin Franklin'],
  ['Dwell on the beauty of life. Watch the stars, and see yourself running with them.', 'Marcus Aurelius'],
  ['Begin at once to live, and count each separate day as a separate life.', 'Seneca'],
  ['First say to yourself what you would be; and then do what you have to do.', 'Epictetus'],
  ['While we are postponing, life speeds by.', 'Seneca'],
  ['What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['A man who dares to waste one hour of time has not discovered the value of life.', 'Charles Darwin'],
  ['Tomorrow is often the busiest day of the week.', 'Spanish proverb'],
  ['Courage is grace under pressure.', 'Ernest Hemingway'],
  ['Hope is a waking dream.', 'Aristotle'],
];

// ---------- tools ----------
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t) };
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const col = (c, a = 1) => new Color('#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''), a);
const ramp = (stops, x) => { let k = 0; while (k < stops.length - 2 && x > stops[k + 1][0]) k++; const [x0, c0] = stops[k], [x1, c1] = stops[k + 1]; return mix(c0, c1, clamp((x - x0) / (x1 - x0))) };
const canvas = (w, h, opaque = false) => { const g = new DrawContext(); g.size = new Size(w, h); g.opaque = opaque; g.respectScreenScale = true; return g };
const disc = (g, x, y, r, c, a = 1, rx = r) => { g.setFillColor(col(c, a)); g.fillEllipse(new Rect(x - rx, y - r, rx * 2, r * 2)) };
const glow = (g, x, y, r0, r1, c, a, wide = 1) => { for (let k = 14; k >= 1; k--) { const r = lerp(r0, r1, (k / 14) ** 1.7); disc(g, x, y, r, c, a / 14, r * wide) } };
const WHITE = [255, 255, 255], INK = [10, 12, 36], RAD = Math.PI / 180;
const fam = config.widgetFamily || 'large', now = new Date();

// ---------- place ----------
const fm = FileManager.local(), cache = fm.joinPath(fm.cacheDirectory(), 'orbit.json');
async function place() {
  try { Location.setAccuracyToThreeKilometers(); const l = await Location.current(), p = { lat: l.latitude, lon: l.longitude }; fm.writeString(cache, JSON.stringify(p)); return p } catch (e) {}
  for (const f of [cache, fm.joinPath(fm.cacheDirectory(), 'skies.json')]) try { if (fm.fileExists(f)) { const j = JSON.parse(fm.readString(f)), p = j.loc || j; if (p.lat != null) return p } } catch (e) {}
  return { lat: 20, lon: -now.getTimezoneOffset() / 4, guess: true }; // estimate from the time zone
}

// ---------- sun and moon ----------
// Sun position for the calendar date of d. All times are in milliseconds.
function sun(d, lat, lon) {
  const n = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12) / 864e5 + 2440587.5 - 2451545 + .0008, js = n - lon / 360;
  const M = ((357.5291 + .98560028 * js) % 360 + 360) % 360, C = 1.9148 * Math.sin(M * RAD) + .02 * Math.sin(2 * M * RAD) + .0003 * Math.sin(3 * M * RAD);
  const L = (M + C + 180 + 102.9372) % 360, jt = 2451545 + js + .0053 * Math.sin(M * RAD) - .0069 * Math.sin(2 * L * RAD);
  const dec = Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD)), noon = (jt - 2440587.5) * 864e5, phi = lat * RAD;
  const half = alt => { const c = (Math.sin(alt * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)); return c >= 1 ? 0 : c <= -1 ? 432e5 : Math.acos(c) / (2 * Math.PI) * 864e5 };
  const h = half(-.833), altAt = t => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos((t - noon) / 864e5 * 2 * Math.PI)) / RAD;
  return { noon, rise: noon - h, set: noon + h, length: 2 * h, altAt, never: h === 0, always: h === 432e5 };
}
const phase = (((now / 1000 - 947182440) / 2551443) % 1 + 1) % 1, lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
const moonName = phase < .03 || phase > .97 ? 'New moon' : phase < .22 ? 'Waxing crescent' : phase < .28 ? 'First quarter' : phase < .47 ? 'Waxing gibbous' : phase < .53 ? 'Full moon' : phase < .72 ? 'Waning gibbous' : phase < .78 ? 'Last quarter' : 'Waning crescent';

const loc = await place(), S = sun(now, loc.lat, loc.lon), dayMs = 864e5;
const yest = sun(new Date(now.getTime() - dayMs), loc.lat, loc.lon), tomo = sun(new Date(now.getTime() + dayMs), loc.lat, loc.lon);
const alt = S.altAt(now.getTime()), dayK = smooth((alt + 6) / 18), tw = 1 - clamp(Math.abs(alt) / 12);
const ACCENT = mix(mix([150, 165, 255], [120, 215, 255], dayK), [255, 170, 120], tw);
const SKY = [[-90, [16, 20, 56]], [-18, [24, 30, 82]], [-8, [72, 62, 160]], [-3, [200, 92, 150]], [0, [255, 128, 88]], [5, [255, 198, 98]], [12, [150, 212, 255]], [40, [74, 164, 255]], [90, [60, 150, 255]]];

// ---------- pictures ----------
function background() {
  const W = fam === 'small' ? 200 : 380, H = fam === 'large' ? 400 : 200, g = canvas(W, H, true);
  const top = mix(mix([6, 8, 30], [14, 62, 150], dayK), [46, 32, 104], tw * .6), bot = mix(mix([16, 14, 50], [30, 104, 186], dayK), [176, 78, 96], tw * .6);
  const n = H / 4; for (let k = 0; k < n; k++) { g.setFillColor(col(mix(top, bot, k / (n - 1)))); g.fillRect(new Rect(0, k * 4, W, 4)) }
  let seed = now.getDate() * 131 + 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 };
  glow(g, W * .95, 0, 20, H * .75 + 60, mix([84, 104, 255], [120, 214, 255], dayK), .55, 1.3);
  glow(g, 0, H, 10, H * .6 + 60, mix(mix([120, 60, 220], [40, 120, 255], dayK), [255, 110, 90], tw), .5, 1.4);
  for (const r of [.5, .78, 1.08, 1.4]) { const q = r * 300, p = new Path(); p.addEllipse(new Rect(W * .95 - q, -q, q * 2, q * 2)); g.addPath(p); g.setStrokeColor(new Color('#ffffff', .05)); g.setLineWidth(1); g.strokePath() }
  const stars = (1 - dayK * .85) * W * H / 1500; for (let k = 0; k < stars; k++) disc(g, rnd() * W, rnd() * H, rnd() * rnd() * 1.3 + .3, WHITE, (.12 + rnd() * .5) * (1 - dayK * .6));
  return g.getImage();
}
// the 24-hour ring
function dial(s) {
  const g = canvas(s, s), c = s / 2, th = s * .06, R = c - th * 1.95, mid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const pos = (t, r) => { const a = Math.PI / 2 + (t - mid) / dayMs * 2 * Math.PI; return [c + r * Math.cos(a), c + r * Math.sin(a)] };
  for (let k = 0; k < 96; k++) { const t = mid + k / 96 * dayMs, a = S.altAt(t); if (a > -4) { const [x, y] = pos(t, R); disc(g, x, y, th * 1.15, ramp(SKY, a), .05) } }
  for (let k = 0; k < 480; k++) { const t = mid + k / 480 * dayMs, [x, y] = pos(t, R); disc(g, x, y, th / 2, ramp(SKY, S.altAt(t))) }
  for (let h = 0; h < 24; h++) { if (h === 6 || h === 18) continue; const [x, y] = pos(mid + h / 24 * dayMs, R - th * 1.15); disc(g, x, y, h % 12 ? .8 : 1.7, WHITE, h % 12 ? .3 : .7) }
  if (!S.never && !S.always) for (const t of [S.rise, S.set]) { const [x, y] = pos(t, R + th * .95); disc(g, x, y, 1.9, WHITE, .95) }
  const [x, y] = pos(now.getTime(), R), up = alt > -.833, bead = up ? [255, 220, 110] : [232, 238, 255];
  glow(g, x, y, th * .6, th * 1.9, bead, .7); disc(g, x, y, th * .98, INK); disc(g, x, y, th * .74, bead); disc(g, x - th * .16, y - th * .16, th * .4, WHITE, .65);
  return g.getImage();
}
function moon(s) {
  const g = canvas(s, s), c = s / 2, r = s / 2 - 1, k = Math.cos(2 * Math.PI * phase), side = (phase < .5 ? 1 : -1) * (loc.lat < 0 ? -1 : 1), pts = [];
  disc(g, c, c, r, WHITE, .2);
  for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + Math.PI * i / 20; pts.push([c + side * r * Math.cos(a), c + r * Math.sin(a)]) }
  for (let i = 20; i >= 0; i--) { const a = -Math.PI / 2 + Math.PI * i / 20; pts.push([c + side * r * k * Math.cos(a), c + r * Math.sin(a)]) }
  const p = new Path(); p.move(new Point(pts[0][0], pts[0][1])); for (const q of pts.slice(1)) p.addLine(new Point(q[0], q[1])); p.closeSubpath(); g.addPath(p); g.setFillColor(col([244, 246, 255])); g.fillPath();
  return g.getImage();
}
// the year: one row for each month, one dot for each day
function yearGrid(w) {
  const rh = 8.6, h = rh * 12, g = canvas(w, h), x0 = 13, cw = (w - x0 - 2) / 31, y = now.getFullYear(), r = Math.min(3.1, cw * .34);
  const HUE = [[0, [96, 165, 250]], [3, [52, 211, 153]], [6, [250, 204, 21]], [9, [251, 113, 133]], [11, [192, 132, 252]]];
  g.setFont(Font.heavyRoundedSystemFont(6.5));
  for (let m = 0; m < 12; m++) {
    const c = ramp(HUE, m), cy = m * rh + rh / 2, n = new Date(y, m + 1, 0).getDate();
    g.setTextColor(col(m === now.getMonth() ? c : WHITE, m === now.getMonth() ? 1 : .45)); g.drawText('JFMAMJJASOND'[m], new Point(1, cy - 4.4));
    for (let d = 1; d <= n; d++) {
      const cx = x0 + (d - .5) * cw, past = m < now.getMonth() || (m === now.getMonth() && d < now.getDate()), today = m === now.getMonth() && d === now.getDate();
      if (today) { glow(g, cx, cy, r, r * 3.2, c, .8); disc(g, cx, cy, r * 1.25, WHITE) } else disc(g, cx, cy, r, past ? c : WHITE, past ? .92 : .15);
    }
  }
  return g.getImage();
}

// ---------- widget ----------
const df = new DateFormatter(), clock = t => { df.useNoDateStyle(); df.useShortTimeStyle(); return df.string(new Date(t)) }, fmt = f => { df.dateFormat = f; return df.string(now) };
const accent = col(ACCENT), soft = new Color('#ffffff', .72);
const text = (st, s, font, color) => { const t = st.addText(s); t.font = font; t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = .6; return t };
const icon = (st, name, size, color) => { const y = SFSymbol.named(name); if (!y) return; y.applyFont(Font.boldSystemFont(size)); const i = st.addImage(y.image); i.imageSize = new Size(size + 3, size); i.tintColor = color; st.addSpacer(4) };
const mid = (st, fn) => { const r = st.addStack(); r.addSpacer(); fn(r); r.addSpacer() }; // center one line

function addDial(st, s) {
  const d = st.addStack(); d.size = new Size(s, s); d.backgroundImage = dial(s); d.layoutVertically(); d.setPadding(0, s * .19, 0, s * .19);
  d.addSpacer();
  mid(d, r => text(r, fmt('EEE').toUpperCase(), Font.heavyRoundedSystemFont(s * .078), accent));
  mid(d, r => { const t = r.addDate(now); t.applyTimeStyle(); t.font = Font.heavyRoundedSystemFont(s * .125); t.textColor = Color.white(); t.lineLimit = 1; t.minimumScaleFactor = .5 });
  mid(d, r => text(r, fmt('d MMM').toUpperCase(), Font.boldRoundedSystemFont(s * .078), soft));
  d.addSpacer();
}
function addFacts(st) {
  const f = st.addStack(); f.layoutVertically();
  const t = now.getTime(), next = S.never || S.always ? null : t < S.rise ? ['SUNRISE IN', S.rise] : t < S.set ? ['SUNSET IN', S.set] : ['SUNRISE IN', tomo.rise];
  if (next) {
    text(f, next[0], Font.heavyRoundedSystemFont(10), accent);
    const r = f.addDate(new Date(next[1])); r.applyRelativeStyle(); r.font = Font.heavyRoundedSystemFont(23); r.textColor = Color.white(); r.lineLimit = 1; r.minimumScaleFactor = .6;
  } else { text(f, S.always ? 'MIDNIGHT SUN' : 'POLAR NIGHT', Font.heavyRoundedSystemFont(10), accent); text(f, S.always ? 'No sunset today' : 'No sunrise today', Font.heavyRoundedSystemFont(19), Color.white()) }
  f.addSpacer(6);
  const row = () => { const r = f.addStack(); r.centerAlignContent(); f.addSpacer(4); return r }, small = Font.semiboldRoundedSystemFont(11.5);
  if (next) { const r = row(); icon(r, 'sunrise.fill', 11, accent); text(r, clock(S.rise), small, Color.white()); r.addSpacer(10); icon(r, 'sunset.fill', 11, accent); text(r, clock(S.set), small, Color.white()) }
  const len = Math.round(S.length / 6e4), diff = Math.round((S.length - yest.length) / 1e3), r2 = row();
  icon(r2, 'sun.max.fill', 11, accent); text(r2, `${Math.floor(len / 60)}h ${String(len % 60).padStart(2, '0')}m daylight`, small, Color.white());
  if (Math.abs(diff) >= 1 && next) { r2.addSpacer(6); text(r2, (diff > 0 ? '+' : '−') + (Math.abs(diff) >= 60 ? Math.floor(Math.abs(diff) / 60) + 'm ' : '') + Math.abs(diff) % 60 + 's', Font.boldRoundedSystemFont(10), diff > 0 ? new Color('#4ade80') : new Color('#fda4af')) }
  const r3 = row(); r3.addImage(moon(13)).imageSize = new Size(13, 13); r3.addSpacer(5); text(r3, `${moonName}  ·  ${Math.round(lit * 100)}%`, small, Color.white());
  if (loc.guess) text(f, 'Location is off: times are estimates.', Font.semiboldRoundedSystemFont(9), new Color('#fda4af'));
}

const sw = Device.screenSize().width, short = sw >= 428 ? 170 : sw >= 414 ? 165 : sw >= 390 ? 158 : sw >= 375 ? 155 : 141; // widget height for this iPhone
const w = new ListWidget(); w.backgroundImage = background();
if (fam === 'small') { w.setPadding(8, 8, 8, 8); w.addSpacer(); mid(w, r => addDial(r, short - 14)); w.addSpacer() }
else if (fam.startsWith('accessory')) { const t = w.addDate(now); t.applyTimeStyle(); t.font = Font.heavyRoundedSystemFont(18) }
else {
  w.setPadding(13, 12, 13, 16);
  const topRow = w.addStack(); topRow.centerAlignContent(); addDial(topRow, short - 26); topRow.addSpacer(14); addFacts(topRow); topRow.addSpacer();
  if (fam === 'large') {
    const cw = (sw >= 428 ? 364 : sw >= 414 ? 360 : sw >= 390 ? 338 : sw >= 375 ? 329 : 292) - 28;
    const y = now.getFullYear(), days = Math.round((new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / dayMs), doy = Math.round((new Date(y, now.getMonth(), now.getDate()) - new Date(y, 0, 1)) / dayMs) + 1;
    w.addSpacer();
    const hd = w.addStack(); text(hd, String(y), Font.heavyRoundedSystemFont(10), accent); hd.addSpacer(); text(hd, `Day ${doy}  ·  ${days - doy} left  ·  ${Math.round(doy / days * 100)}%`, Font.boldRoundedSystemFont(10), soft);
    w.addSpacer(5);
    w.addImage(yearGrid(cw)).imageSize = new Size(cw, 8.6 * 12);
    w.addSpacer();
    const [qt, who] = QUOTES[(doy + y) % QUOTES.length], q = w.addStack(); q.layoutVertically(); q.backgroundColor = new Color('#ffffff', .09); q.cornerRadius = 15; q.setPadding(7, 11, 7, 11);
    const qx = q.addText('“' + qt + '”'); qx.font = new Font('Georgia-Italic', 11.5); qx.textColor = Color.white(); qx.lineLimit = 2; qx.minimumScaleFactor = .7;
    q.addSpacer(2); const ql = q.addStack(); text(ql, who.toUpperCase(), Font.heavyRoundedSystemFont(8), accent); ql.addSpacer();
  }
}
const flips = [S.rise, S.set, tomo.rise].filter(t => t > Date.now()).map(t => t + 3e4);
w.refreshAfterDate = new Date(Math.min(Date.now() + 15 * 6e4, ...flips));
if (config.runsInWidget) Script.setWidget(w); else if (fam === 'small') await w.presentSmall(); else if (fam === 'medium') await w.presentMedium(); else await w.presentLarge();
Script.complete();
