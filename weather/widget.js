// Skies widget for the Scriptable app (iPhone home screen).
// Widget parameter (optional): "lat,lon,Name" for a fixed place. Without it, the widget uses your location.
const UNIT = 'C';          // 'C' or 'F'
const APP_URL = '';        // optional: address of the Skies web app. A tap on the widget opens it.

const fam = config.widgetFamily || 'medium';
const W = fam === 'small' ? 170 : 360, H = fam === 'large' ? 376 : 170;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t) };
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const col = (c, a = 1) => new Color('#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''), a);
const deg = c => Math.round(UNIT === 'C' ? c : c * 9 / 5 + 32) + '°';
const WMO = {0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow',80:'Showers',81:'Showers',82:'Heavy showers',85:'Snow showers',86:'Snow showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};
const fm = FileManager.local(), cache = fm.joinPath(fm.cacheDirectory(), 'skies.json');

async function place() {
  const p = (args.widgetParameter || '').split(',');
  if (p.length >= 2 && !isNaN(+p[0])) return { lat: +p[0], lon: +p[1], name: (p[2] || '').trim() };
  let l;
  try { Location.setAccuracyToThreeKilometers(); l = await Location.current() }
  catch (e) { // The widget cannot always get the location. Use the last known place.
    if (fm.fileExists(cache)) return JSON.parse(fm.readString(cache)).loc;
    throw new Error('Location is not available. Open Scriptable and run Skies one time.');
  }
  let name = '';
  try { name = (await Location.reverseGeocode(l.latitude, l.longitude))[0].locality || '' } catch (e) {}
  return { lat: +l.latitude.toFixed(3), lon: +l.longitude.toFixed(3), name };
}
async function getData() {
  try {
    const loc = await place();
    const base = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&timezone=auto&timeformat=unixtime`;
    const d = await new Request(base + '&forecast_days=3&current=temperature_2m,weather_code,cloud_cover,precipitation&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset').loadJSON();
    if (!d.current) throw new Error('no data');
    let m = null;
    try { m = await new Request(base + '&forecast_days=1&hourly=temperature_2m&models=ecmwf_ifs025,gfs_seamless,icon_seamless,gem_seamless').loadJSON() } catch (e) {}
    const out = { d, m, loc, at: Date.now() };
    fm.writeString(cache, JSON.stringify(out));
    return out;
  } catch (e) {
    if (fm.fileExists(cache)) return JSON.parse(fm.readString(cache));
    throw e;
  }
}
function spread(o, now) {
  const h = o.m && o.m.hourly; if (!h) return null;
  const i = clamp(Math.round((now - h.time[0]) / 3600), 0, h.time.length - 1);
  const v = Object.keys(h).filter(k => k.startsWith('temperature_2m_')).map(k => h[k][i]).filter(x => x != null);
  if (v.length < 2) return null;
  v.push(o.d.current.temperature_2m);
  return Math.max(...v) - Math.min(...v);
}
function draw(o) {
  const d = o.d, c = d.current, now = Date.now() / 1000, sr = d.daily.sunrise, ss = d.daily.sunset;
  let i = 0; while (i < sr.length - 2 && sr[i + 1] <= now) i++;
  let day = false, f;
  if (now < sr[i]) f = clamp((now - (ss[i] - 86400)) / (sr[i] - ss[i] + 86400));
  else if (now < ss[i]) { day = true; f = (now - sr[i]) / (ss[i] - sr[i]) }
  else f = clamp((now - ss[i]) / (sr[i + 1] - ss[i]));
  const arc = Math.sin(Math.PI * f), alt = day ? arc : -arc, dayK = smooth((alt + .1) / .45), tw = 1 - clamp(Math.abs(alt) / .4);
  const code = c.weather_code, cloud = (c.cloud_cover || 0) / 100, wet = code >= 51 && code !== 77;
  const snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const ri = wet || snow ? clamp(Math.max(.3, Math.sqrt((c.precipitation || 0) * 4 / 6))) : 0;
  const bright = lerp(.3, 1, dayK), grey = cloud * lerp(.55, .9, ri);

  const g = new DrawContext(); g.size = new Size(W, H); g.opaque = true; g.respectScreenScale = true;
  // sky
  let top = mix([7, 10, 38], [22, 112, 255], dayK), bot = mix([44, 40, 110], [168, 224, 255], dayK);
  bot = mix(bot, [255, 176, 92], tw * .9);
  const gT = [70, 80, 98].map(v => v * bright), gB = [158, 168, 182].map(v => v * bright);
  top = mix(top, gT, grey); bot = mix(bot, gB, grey);
  const hz = H * .72, N = 48;
  g.setFillColor(col(bot)); g.fillRect(new Rect(0, 0, W, H));
  for (let k = 0; k < N; k++) { g.setFillColor(col(mix(top, bot, smooth(k / (N - 1))))); g.fillRect(new Rect(0, k * hz / N, W, hz / N + 1)) }
  // stars
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 };
  const sa = (1 - dayK) * (1 - cloud * .85);
  if (sa > .05) { g.setFillColor(new Color('#ffffff', sa)); for (let k = 0; k < 40; k++) { const r = rnd() * 1.2 + .5; g.fillEllipse(new Rect(rnd() * W, rnd() * hz * .8, r, r)) } }
  // sun or moon
  const R = H * (fam === 'large' ? .1 : .16), bx = W * (.14 + .72 * f), by = hz + R - arc * (hz * .78 + R), veil = 1 - grey * .75;
  const body = day ? mix([255, 120, 60], [255, 226, 120], smooth(arc * 1.6)) : [226, 232, 250];
  for (let k = 5; k >= 1; k--) { const r = R * (1 + k * .35); g.setFillColor(col(body, .09 * veil)); g.fillEllipse(new Rect(bx - r, by - r, r * 2, r * 2)) }
  g.setFillColor(col(body, veil)); g.fillEllipse(new Rect(bx - R, by - R, R * 2, R * 2));
  g.setFillColor(col(mix(body, [255, 255, 255], .6), veil * .8)); g.fillEllipse(new Rect(bx - R * .7, by - R * .7, R * 1.1, R * 1.1));
  // clouds
  const cT = mix([255, 255, 255], [150, 158, 174], ri * .8).map(v => v * lerp(.42, 1, dayK));
  const cS = mix([206, 222, 244], [92, 100, 120], ri * .85).map(v => v * lerp(.36, 1, dayK));
  for (let k = 0; k < 6; k++) {
    const x = W * (.42 + rnd() * .6), y = hz * (.2 + rnd() * .45), r = H * (.06 + rnd() * .06) * (1 + cloud * .4), s = smooth((cloud - k / 7) / .2);
    if (s < .05) continue;
    for (const [dy, cc] of [[r * .12, cS], [0, cT]]) {
      const p = new Path();
      for (const [dx, ey, rr] of [[-1.1, .25, .6], [-.45, -.2, .85], [.35, -.05, .75], [1.05, .28, .57]]) p.addEllipse(new Rect(x + (dx - rr) * r * s, y + dy + (ey - rr) * r * s, rr * 2 * r * s, rr * 2 * r * s));
      p.addRect(new Rect(x - 1.1 * r * s, y + dy + .25 * r * s, 2.15 * r * s, .6 * r * s));
      g.addPath(p); g.setFillColor(col(cc)); g.fillPath();
    }
  }
  // hills and house
  const cold = Math.max(snow ? 1 : 0, smooth(-c.temperature_2m / 4)), tint = cc => mix(cc, [236, 242, 250], cold * .85).map(v => v * bright);
  const hy = (x, base, amp, fr, ph) => base - amp * (Math.sin(x / W * fr + ph) * .6 + Math.sin(x / W * fr * 2.3 + ph * 1.7) * .4);
  const hill = (base, amp, fr, ph, cc) => { const p = new Path(); p.move(new Point(0, H)); for (let x = 0; x <= W + 6; x += 6) p.addLine(new Point(x, hy(x, base, amp, fr, ph))); p.addLine(new Point(W, H)); p.closeSubpath(); g.addPath(p); g.setFillColor(col(cc)); g.fillPath() };
  hill(hz, H * .06, 5, 1, mix(tint([118, 176, 196]), bot, .45));
  hill(hz + H * .07, H * .055, 7, 3, tint([70, 168, 128]));
  const hx = W * .78, hb = hy(hx, hz + H * .07, H * .055, 7, 3), u = H * .045;
  g.setFillColor(col(tint([250, 236, 214]))); g.fillRect(new Rect(hx - u, hb - u * 1.3, u * 2, u * 1.5));
  const roof = new Path(); roof.move(new Point(hx - u * 1.35, hb - u * 1.25)); roof.addLine(new Point(hx, hb - u * 2.5)); roof.addLine(new Point(hx + u * 1.35, hb - u * 1.25)); roof.closeSubpath();
  g.addPath(roof); g.setFillColor(col(tint([226, 84, 72]))); g.fillPath();
  g.setFillColor(col(mix([70, 96, 128].map(v => v * bright), [255, 214, 110], 1 - dayK))); g.fillRect(new Rect(hx - u * .3, hb - u * .95, u * .6, u * .6));
  hill(hz + H * .17, H * .05, 4, 5, tint([44, 146, 104]));
  // rain or snow
  if (ri > 0) {
    g.setStrokeColor(col(snow ? [255, 255, 255] : [200, 226, 255], snow ? .95 : .6)); g.setFillColor(new Color('#ffffff', .95)); g.setLineWidth(1.4);
    for (let k = 0; k < ri * W * .35; k++) {
      const x = rnd() * W, y = rnd() * H;
      if (snow) g.fillEllipse(new Rect(x, y, 3, 3));
      else { const p = new Path(); p.move(new Point(x, y)); p.addLine(new Point(x - 3, y + 11)); g.addPath(p); g.strokePath() }
    }
  }
  // text
  const pad = 14, small = fam === 'small', sp = spread(o, now), j = Math.max(0, d.hourly.time.findIndex(t => t > now));
  // Each label has a dark copy below it. This keeps the text clear on bright clouds.
  const label = (t, font, x, y) => { g.setFont(font); g.setTextColor(new Color('#06103a', .35)); g.drawText(t, new Point(x, y + 1.5)); g.setTextColor(Color.white()); g.drawText(t, new Point(x, y)) };
  label(o.loc.name || 'Skies', Font.boldRoundedSystemFont(13), pad, 10);
  label(deg(c.temperature_2m), Font.heavyRoundedSystemFont(small ? 52 : 58), pad - 2, 28);
  label(WMO[code] || '', Font.boldRoundedSystemFont(15), pad, small ? 92 : 98);
  const span = sp == null ? '' : '  ±' + Math.max(.5, Math.round((UNIT === 'C' ? sp : sp * 1.8))  / 2) + '°';
  label(`H ${deg(d.daily.temperature_2m_max[0])}  L ${deg(d.daily.temperature_2m_min[0])}${span}`, Font.semiboldRoundedSystemFont(11), pad, small ? 112 : 118);
  const age = Math.round((Date.now() - o.at) / 60000);
  if (age > 90) { g.setFont(Font.semiboldRoundedSystemFont(11)); g.setTextColor(new Color('#ffd166')); g.drawText(`Old data: ${Math.round(age / 60)} h`, new Point(pad, H - 22)) }
  if (!small) { // next hours
    const n = 5, x0 = W * .46, cw = (W - x0 - 8) / n, y0 = fam === 'large' ? 20 : 14, df = new DateFormatter(); df.dateFormat = 'ha';
    g.setFillColor(new Color('#080c28', .38)); const p = new Path(); p.addRoundedRect(new Rect(x0 - 4, y0, W - x0 - 6, 82), 16, 16); g.addPath(p); g.fillPath();
    g.setTextAlignedCenter();
    for (let k = 0; k < n; k++) {
      const q = j + k * 2, x = x0 + k * cw; if (q >= d.hourly.time.length) break;
      g.setTextColor(new Color('#ffffff', .75)); g.setFont(Font.semiboldRoundedSystemFont(10)); g.drawTextInRect(df.string(new Date(d.hourly.time[q] * 1000)), new Rect(x - 4, y0 + 10, cw, 14));
      g.setTextColor(Color.white()); g.setFont(Font.boldRoundedSystemFont(15)); g.drawTextInRect(deg(d.hourly.temperature_2m[q]), new Rect(x - 4, y0 + 30, cw, 20));
      const pp = d.hourly.precipitation_probability[q] || 0;
      g.setTextColor(new Color('#8fd3ff', pp >= 20 ? 1 : 0.01)); g.setFont(Font.semiboldRoundedSystemFont(10)); g.drawTextInRect(pp + '%', new Rect(x - 4, y0 + 56, cw, 14));
    }
  }
  return g.getImage();
}

const w = new ListWidget();
try {
  const o = await getData();
  if (fam.startsWith('accessory')) { const t = w.addText(deg(o.d.current.temperature_2m)); t.font = Font.heavyRoundedSystemFont(22); w.addText(WMO[o.d.current.weather_code] || '').font = Font.systemFont(10) }
  else w.backgroundImage = draw(o);
} catch (e) {
  w.backgroundColor = new Color('#0b1030'); const t = w.addText('Skies: ' + e.message); t.textColor = Color.white(); t.font = Font.systemFont(12);
}
if (APP_URL) w.url = APP_URL;
w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
if (config.runsInWidget) Script.setWidget(w); else if (fam === 'small') await w.presentSmall(); else if (fam === 'large') await w.presentLarge(); else await w.presentMedium();
Script.complete();
