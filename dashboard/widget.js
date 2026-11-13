// Dash: a dashboard widget for the Scriptable app. Use the LARGE widget size.
// It shows the day, the date, the live time, your checklist from the Reminders app, and a daily quote.
// All the data updates automatically. Tick items in the Reminders app: the widget follows.

// ---------- settings ----------
const LIST = '';   // name of one Reminders list to show. Empty: all lists.

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
const now = new Date(), sameDay = d => d && d.toDateString() === now.toDateString();
let tasks = [], more = 0, total = 0, doneN = 0, problem = '', next = null;
try {
  const cals = LIST ? [await Calendar.forRemindersByTitle(LIST)] : [];
  const open = await Reminder.allIncomplete(cals), done = await Reminder.completedToday(cals);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let due = open.filter(r => r.dueDate && r.dueDate < endOfDay);       // due today or late
  if (!due.length && !done.length) due = open.filter(r => !r.dueDate);  // no dates in use: show the open items
  due.sort((a, b) => (a.dueDate || endOfDay) - (b.dueDate || endOfDay));
  tasks = due.concat(done); total = tasks.length; doneN = done.length;
} catch (e) { problem = 'Open Scriptable and run Dash one time to allow access to Reminders.' }
try {
  const ev = (await CalendarEvent.today([])).filter(e => !e.isAllDay && e.endDate > now).sort((a, b) => a.startDate - b.startDate);
  if (ev.length) next = ev[0];
} catch (e) {}

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
function ringCard(frac, c1, c2, value, label) {
  const w = 96, h = 74, g = canvas(w, h), cx = w / 2, cy = 30, r = 21, th = 6.5;
  round(g, 0, 0, w, h, 20, WHITE, .09);
  const edge = new Path(); edge.addRoundedRect(new Rect(.5, .5, w - 1, h - 1), 20, 20); g.addPath(edge); g.setStrokeColor(new Color('#ffffff', .16)); g.setLineWidth(1); g.strokePath();
  const tr = new Path(); tr.addEllipse(new Rect(cx - r, cy - r, r * 2, r * 2)); g.addPath(tr); g.setStrokeColor(new Color('#ffffff', .13)); g.setLineWidth(th); g.strokePath();
  const f = clamp(frac), pt = t => { const a = -Math.PI / 2 + t * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] };
  if (f > 0) {
    for (let t = 0; t <= f; t += .02) { const [x, y] = pt(t); disc(g, x, y, th * 1.25, mix(c1, c2, t), .07) }
    for (let t = 0; t <= f; t += .005) { const [x, y] = pt(t); disc(g, x, y, th / 2, mix(c1, c2, t / Math.max(f, .3))) }
    const [ex, ey] = pt(f); disc(g, ex, ey, th * .95, c2, .35); disc(g, ex, ey, th * .32, WHITE, .95);
  }
  centered(g, value, Font.heavyRoundedSystemFont(value.length > 3 ? 10.5 : 12.5), cy - (value.length > 3 ? 7 : 8.5), w, WHITE);
  centered(g, label, Font.heavyRoundedSystemFont(9), 57, w, WHITE, .9);
  return g.getImage();
}
function tick(c, done) {
  const s = 16, g = canvas(s, s);
  if (done) { disc(g, 8, 8, 7.5, c); const p = new Path(); p.move(new Point(4.6, 8.3)); p.addLine(new Point(7.1, 10.7)); p.addLine(new Point(11.5, 5.6)); g.addPath(p); g.setStrokeColor(new Color('#0a0c24')); g.setLineWidth(1.9); g.strokePath() }
  else { disc(g, 8, 8, 7.5, c, .14); const p = new Path(); p.addEllipse(new Rect(1.2, 1.2, 13.6, 13.6)); g.addPath(p); g.setStrokeColor(col(c)); g.setLineWidth(1.6); g.strokePath() }
  return g.getImage();
}
function leaf() {
  const w = 54, h = 56, g = canvas(w, h), df = new DateFormatter();
  round(g, 0, 0, w, h, 15, WHITE, .12); round(g, 0, 0, w, 20, 10, THEME.a, 1); g.setFillColor(col(THEME.a)); g.fillRect(new Rect(0, 10, w, 10));
  df.dateFormat = 'MMM'; centered(g, df.string(now).toUpperCase(), Font.heavyRoundedSystemFont(10.5), 3.5, w, [10, 12, 36]);
  centered(g, String(now.getDate()), Font.heavyRoundedSystemFont(25), 22, w, WHITE);
  return g.getImage();
}

// ---------- widget ----------
function build() {
  const w = new ListWidget();
  w.backgroundImage = background(); w.setPadding(14, 15, 14, 15); w.url = 'x-apple-reminderkit://';
  if (config.runsInWidget && config.widgetFamily !== 'large') { const t = w.addText('Dash needs the large widget size.'); t.textColor = Color.white(); t.font = Font.boldRoundedSystemFont(13); return w }
  const df = new DateFormatter(), accent = col(THEME.a), time = d => { df.useNoDateStyle(); df.useShortTimeStyle(); return df.string(d) };
  // header: day, live time, next event, calendar leaf
  const head = w.addStack(); head.centerAlignContent();
  const left = head.addStack(); left.layoutVertically();
  df.dateFormat = 'EEEE'; const dn = left.addText(df.string(now).toUpperCase()); dn.font = Font.heavyRoundedSystemFont(12); dn.textColor = accent;
  const tm = left.addDate(now); tm.applyTimeStyle(); tm.font = Font.heavyRoundedSystemFont(34); tm.textColor = Color.white(); tm.minimumScaleFactor = .6; tm.lineLimit = 1;
  const start = new Date(now.getFullYear(), 0, 1), doy = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 864e5) + 1, daysLeft = Math.round((new Date(now.getFullYear() + 1, 0, 1) - start) / 864e5) - doy;
  const sub = left.addText(next ? (next.startDate <= now ? 'Now:  ' : 'Next:  ') + next.title + (next.startDate > now ? '  ·  ' + time(next.startDate) : '') : `Day ${doy}  ·  ${daysLeft} days left in ${now.getFullYear()}`);
  sub.font = Font.semiboldRoundedSystemFont(10.5); sub.textColor = new Color('#ffffff', .75); sub.lineLimit = 1;
  head.addSpacer();
  head.addImage(leaf()).imageSize = new Size(54, 56);
  w.addSpacer(7);
  // rings: checklist, day, battery
  const dayF = (now.getHours() * 60 + now.getMinutes()) / 1440, bat = Device.batteryLevel();
  const rings = w.addStack(), add = img => { rings.addImage(img).imageSize = new Size(96, 74) };
  add(ringCard(total ? doneN / total : 0, [129, 140, 248], [192, 132, 252], doneN + '/' + total, 'DONE TODAY'));
  rings.addSpacer();
  add(ringCard(dayF, [251, 146, 60], [251, 113, 133], Math.round(dayF * 100) + '%', 'DAY GONE'));
  rings.addSpacer();
  add(ringCard(bat, [52, 211, 153], [34, 211, 238], Math.round(bat * 100) + '%', Device.isCharging() ? 'CHARGING' : 'BATTERY'));
  w.addSpacer(7);
  // checklist from the Reminders app
  const sh = Device.screenSize().height, rows = sh >= 880 ? 5 : 4;
  const box = w.addStack(); box.layoutVertically(); box.backgroundColor = new Color('#ffffff', .09); box.cornerRadius = 18; box.setPadding(8, 12, 8, 12);
  const top = box.addStack(); const tl = top.addText('CHECKLIST'); tl.font = Font.heavyRoundedSystemFont(9.5); tl.textColor = accent; top.addSpacer();
  const show = tasks.slice(0, rows), extra = total - show.length;
  const cnt = top.addText(problem ? '' : extra > 0 ? `+${extra} more` : total ? `${total - doneN} to do` : ''); cnt.font = Font.boldRoundedSystemFont(9.5); cnt.textColor = new Color('#ffffff', .65);
  if (!show.length) { box.addSpacer(5); const t = box.addText(problem || 'Nothing to do today. Add items in the Reminders app.'); t.font = Font.semiboldRoundedSystemFont(11); t.textColor = new Color('#ffffff', .8) }
  for (const r of show) {
    box.addSpacer(5);
    const row = box.addStack(); row.centerAlignContent();
    const c = r.calendar && r.calendar.color ? rgb('#' + r.calendar.color.hex.slice(-6)) : THEME.a, late = !r.isCompleted && r.dueDate && r.dueDate < now && (r.dueDateIncludesTime || !sameDay(r.dueDate));
    row.addImage(tick(c, r.isCompleted)).imageSize = new Size(15, 15); row.addSpacer(8);
    const t = row.addText(r.title || ''); t.font = Font.semiboldRoundedSystemFont(12); t.lineLimit = 1; t.textColor = r.isCompleted ? new Color('#ffffff', .45) : Color.white();
    row.addSpacer();
    const side = r.isCompleted ? 'done' : late ? 'late' : r.dueDate && r.dueDateIncludesTime ? time(r.dueDate) : '';
    if (side) { const d = row.addText(side); d.font = Font.boldRoundedSystemFont(9.5); d.lineLimit = 1; d.textColor = late ? new Color('#fb7185') : new Color('#ffffff', .55) }
  }
  w.addSpacer();
  // quote of the day
  const n = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5), [qt, who] = QUOTES[(n + now.getFullYear()) % QUOTES.length];
  const q = w.addStack(); q.layoutVertically(); q.backgroundColor = new Color('#ffffff', .09); q.cornerRadius = 16; q.setPadding(7, 12, 7, 12);
  const qtx = q.addText('“' + qt + '”'); qtx.font = new Font('Georgia-Italic', 12); qtx.textColor = Color.white(); qtx.lineLimit = 2; qtx.minimumScaleFactor = .7;
  q.addSpacer(2);
  const ql = q.addStack(); const au = ql.addText(who.toUpperCase()); au.font = Font.heavyRoundedSystemFont(8.5); au.textColor = accent; ql.addSpacer();
  w.refreshAfterDate = new Date(Math.min(Date.now() + 10 * 60000, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() + 2000));
  return w;
}

const widget = build();
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentLarge();
Script.complete();
