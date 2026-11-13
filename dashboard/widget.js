// Dash: a dashboard widget for the Scriptable app. Use the LARGE widget size.
// Tap a habit to mark it. Tap the focus ring to start or stop a focus session.

// ---------- settings ----------
const HABITS = [ // name, SF Symbol name, color. Maximum 6.
  { name: 'Water', icon: 'drop.fill', color: '#38bdf8' },
  { name: 'Read', icon: 'book.fill', color: '#fbbf24' },
  { name: 'Move', icon: 'figure.walk', color: '#4ade80' },
  { name: 'Calm', icon: 'leaf.fill', color: '#c084fc' },
  { name: 'Sleep', icon: 'moon.fill', color: '#818cf8' },
];
const STEP_GOAL = 10000;            // steps for each day
const FOCUS_GOAL = 120;             // focus minutes for each day
const STEPS_SHORTCUT = 'Dash Steps'; // name of the shortcut that sends the step count

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

// ---------- data ----------
const fm = FileManager.local(), file = fm.joinPath(fm.documentsDirectory(), 'dash-data.json');
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(), today = key(now);
let db = { days: {}, focusStart: null };
try { if (fm.fileExists(file)) db = JSON.parse(fm.readString(file)) } catch (e) {}
db.days = db.days || {};
const rec = db.days[today] = Object.assign({ habits: {}, focus: 0, sessions: 0, steps: null }, db.days[today]);
const save = () => { const keep = Object.keys(db.days).sort().slice(-120), days = {}; for (const k of keep) days[k] = db.days[k]; db.days = days; fm.writeString(file, JSON.stringify(db)) };
const streak = name => { const d = new Date(now); let n = 0; if (!rec.habits[name]) d.setDate(d.getDate() - 1); while (db.days[key(d)] && db.days[key(d)].habits && db.days[key(d)].habits[name]) { n++; d.setDate(d.getDate() - 1) } return n };
const toggleHabit = name => { rec.habits[name] = !rec.habits[name]; save() };
const toggleFocus = () => {
  if (db.focusStart) { rec.focus += clamp(Math.round((Date.now() - db.focusStart) / 60000), 1, 600); rec.sessions++; db.focusStart = null }
  else db.focusStart = Date.now();
  save();
};
const num = v => typeof v === 'number' ? Math.round(v) : parseInt(String(v).replace(/[.,]0+$/, '').replace(/\D/g, ''), 10);
const setSteps = v => { // a number, a text, or a list of numbers (the list is added together)
  const n = Array.isArray(v) ? v.map(num).filter(x => !isNaN(x)).reduce((a, b) => a + b, 0) : num(v);
  if (!isNaN(n)) { rec.steps = n; rec.stepsAt = Date.now(); save() }
  return n;
};

// ---------- drawing tools ----------
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const col = (c, a = 1) => new Color('#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''), a);
const canvas = (w, h) => { const g = new DrawContext(); g.size = new Size(w, h); g.opaque = false; g.respectScreenScale = true; return g };
const disc = (g, x, y, r, c, a = 1, rx = r) => { g.setFillColor(col(c, a)); g.fillEllipse(new Rect(x - rx, y - r, rx * 2, r * 2)) };
const glow = (g, x, y, r0, r1, c, a, wide = 1) => { for (let k = 14; k >= 1; k--) { const r = lerp(r0, r1, (k / 14) ** 1.7); disc(g, x, y, r, c, a / 14, r * wide) } };
const round = (g, x, y, w, h, r, c, a) => { const p = new Path(); p.addRoundedRect(new Rect(x, y, w, h), r, r); g.addPath(p); g.setFillColor(col(c, a)); g.fillPath() };
const centered = (g, t, font, y, w, c, a = 1) => { g.setFont(font); g.setTextColor(col(c, a)); g.setTextAlignedCenter(); g.drawTextInRect(t, new Rect(0, y, w, 40)) };
const WHITE = [255, 255, 255];
const hour = now.getHours() + now.getMinutes() / 60;
const THEME = hour >= 5 && hour < 11 ? { a: [255, 170, 100], blobs: [[255, 140, 80], [80, 130, 255], [255, 90, 150]], base: [[16, 18, 52], [38, 22, 62]] }
  : hour < 17 && hour >= 11 ? { a: [90, 220, 235], blobs: [[0, 190, 215], [70, 110, 255], [150, 90, 255]], base: [[8, 20, 52], [16, 14, 56]] }
  : hour < 21 && hour >= 17 ? { a: [255, 150, 110], blobs: [[255, 100, 60], [225, 55, 160], [105, 70, 255]], base: [[24, 12, 44], [14, 10, 44]] }
  : { a: [150, 160, 255], blobs: [[70, 80, 255], [160, 60, 225], [0, 150, 205]], base: [[6, 8, 28], [14, 10, 42]] };

function background() {
  const W = 380, H = 400, g = canvas(W, H); g.opaque = true;
  for (let k = 0; k < 50; k++) { g.setFillColor(col(mix(THEME.base[0], THEME.base[1], k / 49))); g.fillRect(new Rect(0, k * 8, W, 8)) }
  let seed = now.getDate() * 97 + 13; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 };
  const [b1, b2, b3] = THEME.blobs;
  glow(g, W * .92, H * .04, 20, 250, b1, .85, 1.25);
  glow(g, W * .02, H * .5, 10, 210, b2, .6);
  glow(g, W * .7, H * 1.02, 20, 230, b3, .7, 1.5);
  glow(g, W * .92, H * .04, 4, 70, mix(b1, WHITE, .5), .5);
  for (const [x, y, r] of [[.92, .04, 150], [.92, .04, 215], [.92, .04, 285], [.02, .5, 150]]) { const p = new Path(); p.addEllipse(new Rect(W * x - r, H * y - r, r * 2, r * 2)); g.addPath(p); g.setStrokeColor(new Color('#ffffff', .055)); g.setLineWidth(1); g.strokePath() }
  for (let k = 0; k < 90; k++) disc(g, rnd() * W, rnd() * H, rnd() * rnd() * 1.4 + .3, WHITE, .12 + rnd() * .4);
  for (let k = 0; k < 40; k++) { g.setFillColor(col([4, 6, 24], .3 * (k / 39) ** 2)); g.fillRect(new Rect(0, H - 160 + k * 4, W, 4)) }
  return g.getImage();
}
// a progress ring on a glass card
function ringCard(frac, c1, c2, value, label, sub, on) {
  const w = 96, h = 100, g = canvas(w, h), cx = w / 2, cy = 42, r = 28, th = 7.5;
  round(g, 0, 0, w, h, 22, WHITE, .09);
  const edge = new Path(); edge.addRoundedRect(new Rect(.5, .5, w - 1, h - 1), 22, 22); g.addPath(edge); g.setStrokeColor(new Color('#ffffff', .16)); g.setLineWidth(1); g.strokePath();
  const tr = new Path(); tr.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); g.addPath(tr); g.setStrokeColor(new Color('#ffffff', .13)); g.setLineWidth(th); g.strokePath();
  const f = clamp(frac), pt = t => { const a = -Math.PI / 2 + t * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] };
  if (f > 0) {
    for (let t = 0; t <= f; t += .02) { const [x, y] = pt(t); disc(g, x, y, th * 1.25, mix(c1, c2, t), .07) }
    for (let t = 0; t <= f; t += .004) { const [x, y] = pt(t); disc(g, x, y, th / 2, mix(c1, c2, t / Math.max(f, .3))) }
    const [ex, ey] = pt(f); disc(g, ex, ey, th * .95, c2, .35); disc(g, ex, ey, th * .32, WHITE, .95);
  }
  centered(g, value, Font.heavyRoundedSystemFont(value.length > 4 ? 13 : 16), cy - (value.length > 4 ? 9 : 11), w, WHITE);
  centered(g, label, Font.heavyRoundedSystemFont(9.5), 77, w, on ? c2 : WHITE, on ? 1 : .9);
  if (sub) centered(g, sub, Font.semiboldRoundedSystemFont(8), cy + 8, w, WHITE, .6);
  return g.getImage();
}
function badge(color, done, n) {
  const s = 46, g = canvas(s, s), c = rgb(color), m = s / 2;
  if (done) { glow(g, m, m, 14, 23, c, .5); disc(g, m, m, 18, c); disc(g, m - 3, m - 4, 13, mix(c, WHITE, .5), .4) }
  else { disc(g, m, m, 18, WHITE, .07); const p = new Path(); p.addEllipse(new Rect(m - 17.5, m - 17.5, 35, 35)); g.addPath(p); g.setStrokeColor(col(c, .55)); g.setLineWidth(1.5); g.strokePath() }
  if (n >= 2) { disc(g, s - 9, s - 9, 8.5, [10, 12, 36]); disc(g, s - 9, s - 9, 7, c, done ? 1 : .45); g.setFont(Font.heavyRoundedSystemFont(8.5)); g.setTextColor(col([10, 12, 36])); g.setTextAlignedCenter(); g.drawTextInRect(String(Math.min(n, 99)), new Rect(s - 18, s - 14.5, 18, 12)) }
  return g.getImage();
}
function leaf() {
  const w = 58, h = 62, g = canvas(w, h), df = new DateFormatter();
  round(g, 0, 0, w, h, 16, WHITE, .12); round(g, 0, 0, w, 22, 11, THEME.a, 1); g.setFillColor(col(THEME.a)); g.fillRect(new Rect(0, 11, w, 11));
  df.dateFormat = 'MMM'; centered(g, df.string(now).toUpperCase(), Font.heavyRoundedSystemFont(11), 4, w, [10, 12, 36]);
  centered(g, String(now.getDate()), Font.heavyRoundedSystemFont(28), 24, w, WHITE);
  return g.getImage();
}

// ---------- widget ----------
function build() {
  const w = new ListWidget(), self = 'scriptable:///run/' + encodeURIComponent(Script.name());
  w.backgroundImage = background(); w.setPadding(14, 15, 14, 15); w.url = self;
  if (config.runsInWidget && config.widgetFamily !== 'large') { const t = w.addText('Dash needs the large widget size.'); t.textColor = Color.white(); t.font = Font.boldRoundedSystemFont(13); return w }
  const df = new DateFormatter(), accent = col(THEME.a);
  // header: day, time, calendar leaf
  const head = w.addStack(); head.centerAlignContent();
  const left = head.addStack(); left.layoutVertically();
  df.dateFormat = 'EEEE'; const dn = left.addText(df.string(now).toUpperCase()); dn.font = Font.heavyRoundedSystemFont(13); dn.textColor = accent;
  const tm = left.addDate(now); tm.applyTimeStyle(); tm.font = Font.heavyRoundedSystemFont(38); tm.textColor = Color.white(); tm.minimumScaleFactor = .6; tm.lineLimit = 1;
  const line = left.addStack(); line.centerAlignContent();
  if (db.focusStart) {
    const dot = line.addText('● FOCUS  '); dot.font = Font.heavyRoundedSystemFont(11); dot.textColor = new Color('#fb7185');
    const tt = line.addDate(new Date(db.focusStart)); tt.applyTimerStyle(); tt.font = Font.boldRoundedSystemFont(11); tt.textColor = Color.white();
  } else {
    const start = new Date(now.getFullYear(), 0, 1), doy = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 864e5) + 1, left2 = (new Date(now.getFullYear() + 1, 0, 1) - start) / 864e5 - doy;
    const t = line.addText(`Day ${doy}  ·  ${Math.round(left2)} days left in ${now.getFullYear()}`); t.font = Font.semiboldRoundedSystemFont(11); t.textColor = new Color('#ffffff', .7);
  }
  head.addSpacer();
  head.addImage(leaf()).imageSize = new Size(58, 62);
  w.addSpacer(10);
  // rings: steps, focus, habits
  const done = HABITS.filter(h => rec.habits[h.name]).length, live = db.focusStart ? Math.round((Date.now() - db.focusStart) / 60000) : 0, mins = rec.focus + live;
  const steps = rec.steps, fmtSteps = steps == null ? '--' : steps >= 10000 ? (steps / 1000).toFixed(1) + 'k' : String(steps).replace(/\B(?=(\d{3})+$)/g, ',');
  const fmtMin = mins >= 60 ? Math.floor(mins / 60) + 'h' + String(mins % 60).padStart(2, '0') : mins + 'm';
  const rings = w.addStack();
  const add = (img, url) => { const i = rings.addImage(img); i.imageSize = new Size(96, 100); i.url = url };
  add(ringCard((steps || 0) / STEP_GOAL, [52, 211, 153], [34, 211, 238], fmtSteps, 'STEPS', steps == null ? 'tap to set up' : rec.stepsAt ? 'at ' + (df.dateFormat = 'H:mm', df.string(new Date(rec.stepsAt))) : 'of ' + STEP_GOAL / 1000 + 'k'), 'shortcuts://run-shortcut?name=' + encodeURIComponent(STEPS_SHORTCUT));
  rings.addSpacer();
  add(ringCard(mins / FOCUS_GOAL, [251, 146, 60], [251, 113, 133], fmtMin, db.focusStart ? 'FOCUS ON' : 'FOCUS', rec.sessions + ' done', !!db.focusStart), self + '?focus=1');
  rings.addSpacer();
  add(ringCard(done / HABITS.length, [129, 140, 248], [192, 132, 252], done + '/' + HABITS.length, 'HABITS', done === HABITS.length ? 'all done' : 'today'), self);
  w.addSpacer(10);
  // habits
  const row = w.addStack(); row.addSpacer(2);
  HABITS.slice(0, 6).forEach((h, k) => {
    if (k) row.addSpacer();
    const cell = row.addStack(); cell.layoutVertically(); cell.url = self + '?habit=' + encodeURIComponent(h.name);
    const on = !!rec.habits[h.name], b = cell.addStack(); b.size = new Size(46, 46); b.backgroundImage = badge(h.color, on, streak(h.name)); b.centerAlignContent();
    b.addSpacer(); const sym = SFSymbol.named(h.icon) || SFSymbol.named('circle.fill'); sym.applyFont(Font.boldSystemFont(17));
    const im = b.addImage(sym.image); im.imageSize = new Size(19, 19); im.tintColor = on ? new Color('#0a0c24') : new Color('#ffffff', .8); b.addSpacer();
    cell.addSpacer(3);
    const lab = cell.addStack(); lab.size = new Size(46, 12); const t = lab.addText(h.name); t.font = Font.boldRoundedSystemFont(9.5); t.textColor = new Color('#ffffff', on ? 1 : .65); t.lineLimit = 1; t.minimumScaleFactor = .7;
  });
  row.addSpacer(2);
  w.addSpacer();
  // quote of the day
  const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5), [qt, who] = QUOTES[(doy + now.getFullYear()) % QUOTES.length];
  const q = w.addStack(); q.layoutVertically(); q.backgroundColor = new Color('#ffffff', .09); q.cornerRadius = 16; q.setPadding(9, 12, 9, 12);
  const qtx = q.addText('“' + qt + '”'); qtx.font = new Font('Georgia-Italic', 12.5); qtx.textColor = Color.white(); qtx.lineLimit = 3; qtx.minimumScaleFactor = .75;
  q.addSpacer(3);
  const ql = q.addStack(); const au = ql.addText(who.toUpperCase()); au.font = Font.heavyRoundedSystemFont(8.5); au.textColor = accent; ql.addSpacer();
  w.refreshAfterDate = new Date(Math.min(Date.now() + 15 * 60000, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() + 2000));
  return w;
}

async function menu() {
  for (;;) {
    const a = new Alert(); a.title = 'Dash'; a.message = 'Update today.';
    HABITS.forEach(h => a.addAction((rec.habits[h.name] ? '✓  ' : '○  ') + h.name));
    a.addAction(db.focusStart ? 'Stop focus session' : 'Start focus session'); a.addAction('Enter steps'); a.addAction('Show widget'); a.addCancelAction('Done');
    const i = await a.presentSheet(), n = HABITS.length;
    if (i < 0) return;
    if (i < n) toggleHabit(HABITS[i].name);
    else if (i === n) toggleFocus();
    else if (i === n + 1) { const s = new Alert(); s.title = 'Steps today'; s.addTextField('Steps', rec.steps == null ? '' : String(rec.steps)); s.addAction('Save'); s.addCancelAction('Cancel'); if (await s.presentAlert() === 0) setSteps(s.textFieldValue(0)) }
    else { await build().presentLarge(); return }
  }
}

// ---------- start ----------
const q = args.queryParameters || {};
const sent = args.shortcutParameter != null ? args.shortcutParameter : args.plainTexts && args.plainTexts.length ? args.plainTexts[0] : null;
if (sent != null) Script.setShortcutOutput(String(setSteps(sent))); // from the steps shortcut (Parameter or Texts field)
else if (q.habit) toggleHabit(q.habit);
else if (q.focus) toggleFocus();
else if (config.runsInApp) await menu();
if (config.runsInWidget) Script.setWidget(build());
Script.complete();
