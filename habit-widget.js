// Habit Streaks: a home screen widget for the Scriptable app.
//
// Medium widget: one habit. Ring to mark today, streak numbers, week of days.
// Large widget:  all habits. Name on the left, days of the week on the right.
// Small widget:  one habit. Tap to mark today.
//
// Type the habit name in the widget "Parameter" field. A new name makes a new habit.
// Run the script in the app to add, rename, recolor, or remove habits.

const FILE = "habit-streaks.json";
const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const INK = new Color("#15110a");
const INK_SOFT = new Color("#15110a", 0.66);
const INK_FAINT = new Color("#15110a", 0.2);
const PALETTE = {
  sun: ["#fade45", "#f7b7a6"],
  mint: ["#c3ee8f", "#7fdccf"],
  sky: ["#9ad8ff", "#bdb3ff"],
  rose: ["#ffb0c4", "#ffcd8a"],
  lilac: ["#d9b9ff", "#ffb5dc"],
};
const COLOR_NAMES = Object.keys(PALETTE);

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const today = () => addDays(new Date(), 0);
const dayNum = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
};

function streaks(done) {
  const days = Object.keys(done).map(dayNum).sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const n of days) {
    run = n === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = n;
  }
  const set = new Set(days);
  let t = dayNum(keyOf(today()));
  if (!set.has(t)) t--; // today is not marked yet: the streak is still alive
  let cur = 0;
  while (set.has(t)) { cur++; t--; }
  return { cur, best };
}

// ---------- storage ----------
let fm;
try {
  fm = FileManager.iCloud();
  fm.documentsDirectory();
} catch (e) {
  fm = FileManager.local();
}
const PATH = fm.joinPath(fm.documentsDirectory(), FILE);

async function load() {
  if (!fm.fileExists(PATH)) return { habits: [] };
  try { await fm.downloadFileFromiCloud(PATH); } catch (e) {}
  try {
    const data = JSON.parse(fm.readString(PATH));
    if (data && Array.isArray(data.habits)) return data;
  } catch (e) {}
  return { habits: [] };
}
const save = (data) => fm.writeString(PATH, JSON.stringify(data));

function nextColor(data) {
  const used = data.habits.map((h) => h.color);
  return COLOR_NAMES.find((c) => !used.includes(c)) || COLOR_NAMES[data.habits.length % COLOR_NAMES.length];
}
function addHabit(data, name) {
  const h = { name: name.trim(), color: nextColor(data), done: {} };
  data.habits.push(h);
  save(data);
  return h;
}
const findHabit = (data, name) =>
  data.habits.find((h) => h.name.toLowerCase() === String(name).trim().toLowerCase());

function toggle(data, h, key) {
  if (h.done[key]) delete h.done[key];
  else h.done[key] = 1;
  save(data);
}

// ---------- drawing ----------
function canvas(px) {
  const c = new DrawContext();
  c.size = new Size(px, px);
  c.opaque = false;
  c.respectScreenScale = false;
  return c;
}
function check(c, px, color, width) {
  const p = new Path();
  p.move(new Point(px * 0.3, px * 0.53));
  p.addLine(new Point(px * 0.44, px * 0.67));
  p.addLine(new Point(px * 0.71, px * 0.35));
  c.addPath(p);
  c.setStrokeColor(color);
  c.setLineWidth(width);
  c.strokePath();
}
function ringImage(done, accent) {
  const px = 240, lw = 20;
  const c = canvas(px);
  if (done) {
    c.setFillColor(INK);
    c.fillEllipse(new Rect(0, 0, px, px));
    check(c, px, accent, 22);
  } else {
    c.setStrokeColor(INK);
    c.setLineWidth(lw);
    c.strokeEllipse(new Rect(lw / 2, lw / 2, px - lw, px - lw));
  }
  return c.getImage();
}
function dotImage(state, isToday, accent) {
  // state: "on" = done, "off" = not done, "future" = day is not here yet
  const px = 96;
  const c = canvas(px);
  const inset = isToday ? 15 : 6;
  const r = new Rect(inset, inset, px - 2 * inset, px - 2 * inset);
  if (state === "future") {
    c.setStrokeColor(INK_FAINT);
    c.setLineWidth(5);
    c.strokeEllipse(r);
  } else {
    c.setFillColor(state === "on" ? INK : INK_FAINT);
    c.fillEllipse(r);
    if (state === "on") check(c, px, accent, isToday ? 8 : 10);
  }
  if (isToday) {
    c.setStrokeColor(INK);
    c.setLineWidth(6);
    c.strokeEllipse(new Rect(4, 4, px - 8, px - 8));
  }
  return c.getImage();
}

// ---------- widget parts ----------
function runUrl(h, key) {
  let base;
  try { base = URLScheme.forRunningScript(); } catch (e) {}
  if (!base) base = "scriptable:///run/" + encodeURIComponent(Script.name());
  return `${base}?habit=${encodeURIComponent(h.name)}&day=${key}`;
}
function gradient(colorName) {
  const [a, b] = PALETTE[colorName] || PALETTE.sun;
  const g = new LinearGradient();
  g.colors = [new Color(a), new Color(b)];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0.4);
  g.endPoint = new Point(1, 0.6);
  return g;
}
const accentOf = (h) => new Color((PALETTE[h.color] || PALETTE.sun)[0]);

function centered(parent, add) {
  const s = parent.addStack();
  s.layoutHorizontally();
  s.addSpacer();
  const el = add(s);
  s.addSpacer();
  return el;
}
function label(parent, text, font, color, lines) {
  const t = parent.addText(text);
  t.font = font;
  t.textColor = color;
  t.lineLimit = lines || 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function weekRow(parent, h, dot, gap, letterSize) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.spacing = gap;
  const t = today();
  const tKey = keyOf(t);
  const start = addDays(t, -t.getDay());
  for (let i = 0; i < 7; i++) {
    const k = keyOf(addDays(start, i));
    const col = row.addStack();
    col.layoutVertically();
    col.spacing = 3;
    const state = k > tKey ? "future" : h.done[k] ? "on" : "off";
    const img = col.addImage(dotImage(state, k === tKey, accentOf(h)));
    img.imageSize = new Size(dot, dot);
    if (letterSize) {
      const s = col.addStack();
      s.size = new Size(dot, 0);
      s.layoutHorizontally();
      s.addSpacer();
      label(s, LETTERS[i], Font.boldSystemFont(letterSize), k === tKey ? INK : INK_SOFT);
      s.addSpacer();
    }
    if (state !== "future") col.url = runUrl(h, k);
  }
  return row;
}

function stat(parent, value, text) {
  const col = parent.addStack();
  col.layoutVertically();
  centered(col, (s) => label(s, String(value), Font.blackSystemFont(38), INK));
  centered(col, (s) => label(s, text, Font.semiboldSystemFont(11), INK_SOFT));
  return col;
}

// ---------- widgets ----------
function mediumWidget(h) {
  const w = new ListWidget();
  w.backgroundGradient = gradient(h.color);
  w.setPadding(14, 14, 14, 14);
  const tKey = keyOf(today());
  const done = !!h.done[tKey];
  const s = streaks(h.done);

  const row = w.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const left = row.addStack();
  left.layoutVertically();
  left.size = new Size(112, 0);
  left.url = runUrl(h, tKey);
  centered(left, (st) => {
    const img = st.addImage(ringImage(done, accentOf(h)));
    img.imageSize = new Size(58, 58);
    return img;
  });
  left.addSpacer(8);
  centered(left, (st) => label(st, h.name, Font.boldSystemFont(15), INK, 2)).centerAlignText();
  left.addSpacer(2);
  centered(left, (st) => label(st, done ? "Done today" : "Tap to mark done", Font.semiboldSystemFont(10), INK_SOFT));

  row.addSpacer(8);
  const rule = row.addStack();
  rule.size = new Size(1.5, 96);
  rule.backgroundColor = INK_FAINT;
  rule.cornerRadius = 1;
  row.addSpacer(8);

  const right = row.addStack();
  right.layoutVertically();
  const stats = right.addStack();
  stats.layoutHorizontally();
  stat(stats, s.cur, "Day Streak");
  stat(stats, s.best, "Best Streak");
  right.addSpacer(8);
  centered(right, (st) => weekRow(st, h, 19, 3, 9));
  return w;
}

function smallWidget(h) {
  const w = new ListWidget();
  w.backgroundGradient = gradient(h.color);
  w.setPadding(14, 12, 14, 12);
  const tKey = keyOf(today());
  const done = !!h.done[tKey];
  const s = streaks(h.done);
  w.url = runUrl(h, tKey);
  centered(w, (st) => {
    const img = st.addImage(ringImage(done, accentOf(h)));
    img.imageSize = new Size(62, 62);
    return img;
  });
  w.addSpacer(8);
  centered(w, (st) => label(st, h.name, Font.boldSystemFont(15), INK, 2)).centerAlignText();
  w.addSpacer(2);
  centered(w, (st) => label(st, `${s.cur} day streak`, Font.semiboldSystemFont(11), INK_SOFT));
  return w;
}

function largeWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = Color.dynamic(new Color("#e6ecf4"), new Color("#0b0f18"));
  w.setPadding(16, 14, 14, 14);
  const fg = Color.dynamic(new Color("#131926"), new Color("#eef1f7"));
  const muted = Color.dynamic(new Color("#5a6477"), new Color("#8f99ad"));

  const head = w.addStack();
  head.layoutHorizontally();
  head.bottomAlignContent();
  label(head, "Habits", Font.blackSystemFont(22), fg);
  head.addSpacer();
  const df = new DateFormatter();
  df.dateFormat = "EEEE d MMM";
  label(head, df.string(new Date()), Font.semiboldSystemFont(11), muted);
  w.addSpacer(10);

  const shown = data.habits.slice(0, 5);
  shown.forEach((h, i) => {
    if (i) w.addSpacer(7);
    const s = streaks(h.done);
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.backgroundGradient = gradient(h.color);
    row.cornerRadius = 18;
    row.setPadding(8, 12, 8, 10);
    const left = row.addStack();
    left.layoutVertically();
    label(left, h.name, Font.boldSystemFont(14), INK);
    label(left, `${s.cur} day streak · best ${s.best}`, Font.semiboldSystemFont(10), INK_SOFT);
    row.addSpacer();
    weekRow(row, h, 21, 3, 8);
  });
  w.addSpacer();
  if (data.habits.length > shown.length) {
    centered(w, (st) => label(st, `+${data.habits.length - shown.length} more habits`, Font.semiboldSystemFont(10), muted));
  }
  return w;
}

function emptyWidget() {
  const w = new ListWidget();
  w.backgroundGradient = gradient("sun");
  centered(w, (st) => label(st, "No habits yet", Font.boldSystemFont(16), INK));
  w.addSpacer(4);
  centered(w, (st) => label(st, "Type a habit name in the widget Parameter.", Font.semiboldSystemFont(11), INK_SOFT, 3)).centerAlignText();
  return w;
}

function buildWidget(data, family, param) {
  let w;
  const name = (param || "").trim();
  if (family === "large" || family === "extraLarge") {
    if (name && !findHabit(data, name)) addHabit(data, name);
    w = data.habits.length ? largeWidget(data) : emptyWidget();
  } else {
    let h = name ? findHabit(data, name) || addHabit(data, name) : data.habits[0];
    if (!h) w = emptyWidget();
    else w = family === "small" ? smallWidget(h) : mediumWidget(h);
  }
  const t = addDays(today(), 1); // draw again after midnight
  t.setSeconds(5);
  w.refreshAfterDate = t;
  return w;
}

// ---------- in-app menu ----------
async function askText(title, value) {
  const a = new Alert();
  a.title = title;
  a.addTextField("Habit name", value || "");
  a.addAction("Save");
  a.addCancelAction("Cancel");
  if ((await a.presentAlert()) === -1) return null;
  const text = (a.textFieldValue(0) || "").trim();
  return text || null;
}
async function pick(title, message, options, destructive) {
  const a = new Alert();
  a.title = title;
  if (message) a.message = message;
  options.forEach((o) => (o === destructive ? a.addDestructiveAction(o) : a.addAction(o)));
  a.addCancelAction("Close");
  return a.presentSheet();
}

async function habitMenu(data, h) {
  for (;;) {
    const s = streaks(h.done);
    const done = !!h.done[keyOf(today())];
    const i = await pick(h.name, `Day streak ${s.cur} · Best streak ${s.best}`, [
      done ? "Unmark today" : "Mark today done",
      "Change a day in the last 14 days",
      "Rename",
      `Change color (${h.color})`,
      "Show widget",
      "Remove habit",
    ], "Remove habit");
    if (i === -1) return;
    if (i === 0) toggle(data, h, keyOf(today()));
    if (i === 1) {
      const df = new DateFormatter();
      df.dateFormat = "EEE d MMM";
      const days = [...Array(14)].map((_, n) => addDays(today(), -n));
      const j = await pick("Change a day", null, days.map((d) => `${h.done[keyOf(d)] ? "● " : "○ "}${df.string(d)}`));
      if (j !== -1) toggle(data, h, keyOf(days[j]));
    }
    if (i === 2) {
      const name = await askText("Rename habit", h.name);
      if (name) { h.name = name; save(data); }
    }
    if (i === 3) {
      h.color = COLOR_NAMES[(COLOR_NAMES.indexOf(h.color) + 1) % COLOR_NAMES.length];
      save(data);
    }
    if (i === 4) await mediumWidget(h).presentMedium();
    if (i === 5) {
      const sure = await pick(`Remove "${h.name}"?`, "The streak history is deleted.", ["Remove"], "Remove");
      if (sure === 0) {
        data.habits = data.habits.filter((x) => x !== h);
        save(data);
        return;
      }
    }
  }
}

async function mainMenu(data) {
  for (;;) {
    const names = data.habits.map((h) => h.name);
    const i = await pick("Habits", "Select a habit, or add a new one.", [...names, "+ New habit", "Show all habits widget"]);
    if (i === -1) return;
    if (i < names.length) await habitMenu(data, data.habits[i]);
    else if (i === names.length) {
      const name = await askText("New habit");
      if (name && !findHabit(data, name)) addHabit(data, name);
    } else await buildWidget(data, "large").presentLarge();
  }
}

// ---------- run ----------
async function main() {
  const data = await load();
  const q = args.queryParameters || {};

  if (q.habit && q.day) {
    // A tap on the widget: change that day, then go back to the home screen.
    const h = findHabit(data, q.habit);
    if (h && /^\d{4}-\d{2}-\d{2}$/.test(q.day) && q.day <= keyOf(today())) toggle(data, h, q.day);
    App.close();
  } else if (config.runsInWidget) {
    Script.setWidget(buildWidget(data, config.widgetFamily, args.widgetParameter));
  } else {
    await mainMenu(data);
  }
  Script.complete();
}

await main();
