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
    const d = await new Request(base + '&forecast_days=4&current=temperature_2m,weather_code,cloud_cover,precipitation&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset').loadJSON();
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
  const sunAt = t => { let i = 0; while (i < sr.length - 2 && sr[i + 1] <= t) i++;
    if (t < sr[i]) return [false, clamp((t - (ss[i] - 86400)) / (sr[i] - ss[i] + 86400))];
    if (t < ss[i]) return [true, (t - sr[i]) / (ss[i] - sr[i])];
    return [false, clamp((t - ss[i]) / (sr[i + 1] - ss[i]))] };
  const [day, f] = sunAt(now), arc = Math.sin(Math.PI * f), alt = day ? arc : -arc;
  const dayK = smooth((alt + .1) / .45), tw = (1 - clamp(Math.abs(alt) / .42)) ** 1.5;
  const code = c.weather_code, cloud = (c.cloud_cover || 0) / 100, snow = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const wet = code >= 51 && !snow, storm = code >= 95, fog = code === 45 || code === 48;
  const ri = wet || snow ? clamp(Math.max(.35, Math.sqrt((c.precipitation || 0) * 4 / 6))) : 0;
  const grey = clamp(cloud * lerp(.45, .9, ri) + (fog ? .4 : 0)), cold = Math.max(snow ? 1 : 0, smooth(-c.temperature_2m / 4));
  const large = fam === 'large', small = fam === 'small', U = large ? 250 : 170, hz = H * (large ? .5 : .63);
  let seed = 20; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 };

  const g = new DrawContext(); g.size = new Size(W, H); g.opaque = true; g.respectScreenScale = true;
  const fill = (cc, a = 1) => g.setFillColor(col(cc, a));
  const rect = (x, y, w, h) => g.fillRect(new Rect(x, y, w, h));
  const disc = (x, y, r, rx = r) => g.fillEllipse(new Rect(x - rx, y - r, rx * 2, r * 2));
  const poly = (pts, cc, a = 1) => { const p = new Path(); p.move(new Point(pts[0][0], pts[0][1])); for (let k = 1; k < pts.length; k++) p.addLine(new Point(pts[k][0], pts[k][1])); p.closeSubpath(); g.addPath(p); fill(cc, a); g.fillPath() };
  const glow = (x, y, r0, r1, cc, a, wide = 1) => { fill(cc, a / 16); for (let k = 16; k >= 1; k--) { const r = lerp(r0, r1, (k / 16) ** 1.6); disc(x, y, r, r * wide) } };

  // ---- light and sky ----
  const lum = lerp(.26, 1, dayK), sunC = mix([255, 104, 48], [255, 238, 176], smooth(arc * 1.8)), moonC = [226, 232, 250];
  let sky = [[4, 6, 26], [12, 16, 56], [26, 30, 88], [52, 50, 122]].map((n, k) => mix(n, [[14, 86, 224], [50, 136, 250], [124, 194, 255], [200, 234, 255]][k], dayK));
  sky = sky.map((s, k) => mix(s, [[36, 30, 96], [124, 62, 146], [244, 112, 100], [255, 196, 112]][k], tw * [.55, .75, .9, .95][k]));
  sky = sky.map((s, k) => mix(s, [[78, 90, 110], [116, 128, 146], [156, 166, 180], [188, 196, 206]][k].map(v => v * lum), grey));
  const skyAt = u => { const st = [0, .42, .76, 1]; u = clamp(u); let k = 0; while (k < 2 && u > st[k + 1]) k++; return mix(sky[k], sky[k + 1], smooth((u - st[k]) / (st[k + 1] - st[k]))) };
  const N = 60; for (let k = 0; k < N; k++) { fill(skyAt(k / (N - 1))); rect(0, k * hz / N, W, hz / N + 1) }
  const horizon = sky[3], veil = 1 - grey * .8, lightC = day ? sunC : moonC;
  const tone = (cc, haze = 0) => mix(mix(cc.map(v => v * lum), [255, 150, 120], tw * .22 * (1 - grey)), horizon, haze);

  // ---- stars ----
  const sa = (1 - dayK) * (1 - grey);
  if (sa > .05) {
    for (let k = 0; k < (small ? 45 : 90); k++) { const x = rnd() * W, y = rnd() * hz * .92, r = rnd() * rnd() * 1.5 + .35; fill([255, 255, 255], sa * (.35 + rnd() * .65)); disc(x, y, r) }
    for (let k = 0; k < 4; k++) { const x = rnd() * W, y = rnd() * hz * .6, r = 3 + rnd() * 2; fill([255, 255, 255], sa * .7); rect(x - r, y - .4, r * 2, .8); rect(x - .4, y - r, .8, r * 2); disc(x, y, 1.1) }
  }
  // ---- sun or moon ----
  const R = U * (day ? .13 : .1), bx = W * (.16 + .68 * f), by = hz + R * 1.2 - arc * (hz * .74 + R * 1.2), up = by - R < hz;
  if (day) {
    glow(bx, by, R, R * 5.5, sunC, .5 * veil, 1 + tw * 1.4);
    glow(bx, by, R * .9, R * 2.2, mix(sunC, [255, 255, 255], .5), .7 * veil);
    fill(mix(sunC, [255, 255, 255], .35), veil); disc(bx, by, R);
    fill(mix(sunC, [255, 255, 255], .8), veil * .9); disc(bx - R * .12, by - R * .12, R * .72);
  } else {
    const ph = (((now - 947182440) / 2551443) % 1 + 1) % 1, kk = Math.min(.72, Math.cos(2 * Math.PI * ph)), side = ph < .5 ? 1 : -1, pts = [];
    glow(bx, by, R, R * 4.5, [170, 190, 255], .42 * veil);
    fill(moonC, .13 * veil); disc(bx, by, R); // the dark part of the moon
    for (let k = 0; k <= 24; k++) { const th = -Math.PI / 2 + Math.PI * k / 24; pts.push([bx + side * R * Math.cos(th), by + R * Math.sin(th)]) }
    for (let k = 24; k >= 0; k--) { const th = -Math.PI / 2 + Math.PI * k / 24; pts.push([bx + side * R * kk * Math.cos(th), by + R * Math.sin(th)]) }
    poly(pts, [246, 248, 255], veil);
  }
  // ---- water ----
  const M = 40; for (let k = 0; k < M; k++) { const v = k / (M - 1); fill(mix(skyAt(1 - v * .85), [6, 18, 46].map(x => x * lum), .22 + .4 * v)); rect(0, hz + k * (H - hz) / M, W, (H - hz) / M + 1) }
  // ---- mountains with a reflection ----
  const peaks = (n, lo, hi) => Array.from({ length: n }, (_, k) => { const h = U * lerp(lo, hi, rnd()); return { x: W * ((k + .5) / n + (rnd() - .5) * .7 / n), h, wl: h * lerp(1, 1.7, rnd()), wr: h * lerp(1, 1.7, rnd()), off: (rnd() - .5) * .6 * h } }).sort((a, b) => b.h - a.h);
  const range = (ps, base, haze, snowT) => {
    const hi = tone(mix(base, lightC, .3).map(v => v * 1.22), haze), lo = tone(base.map(v => v * .7), haze), water = mix(skyAt(.8), [6, 18, 46].map(x => x * lum), .35);
    for (const m of ps) { // reflection first
      const Y = y => hz + (hz - y) * .6, P = [m.x, Y(hz - m.h)], A = [m.x - m.wl, hz], B = [m.x + m.wr, hz], S = [m.x + m.off, hz], left = bx < m.x;
      poly([A, P, S], mix(left ? hi : lo, water, .62)); poly([S, P, B], mix(left ? lo : hi, water, .62));
    }
    for (const m of ps) {
      const P = [m.x, hz - m.h], A = [m.x - m.wl, hz], B = [m.x + m.wr, hz], S = [m.x + m.off, hz], left = bx < m.x, L = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
      poly([A, P, S], left ? hi : lo); poly([S, P, B], left ? lo : hi);
      if (snowT > 0) { const t = snowT, a = L(P, A, t), b = L(P, B, t), s = L(P, S, t * 1.25), wh = tone([250, 252, 255], haze * .6), bl = tone([176, 196, 232], haze * .6);
        const a2 = L(a, s, .5), b2 = L(b, s, .5); a2[1] -= m.h * t * .22; b2[1] -= m.h * t * .22;
        poly([P, a, a2, s], left ? wh : bl); poly([P, s, b2, b], left ? bl : wh) }
    }
  };
  range(peaks(small ? 4 : 7, .3, .52), [92, 112, 168], .5, lerp(.26, .62, cold));
  { const y0 = Math.round(hz) - 36; for (let k = 0; k < 18; k++) { fill(horizon, .5 * (k / 17) ** 2); rect(0, y0 + k * 2, W, 2) } } // haze
  range(peaks(small ? 5 : 9, .12, .24), mix([44, 84, 104], [150, 170, 200], cold * .5), .2, cold * .45);
  fill(mix(horizon, [255, 255, 255], .4), .5); rect(0, hz - .6, W, 1.2);
  // ---- light on the water ----
  if (up && veil > .25) for (let y = hz + 2; y < H; y += 2.6) { const v = (y - hz) / (H - hz), w = R * (.5 + v * 2.6) * (.35 + rnd()); fill(mix(lightC, [255, 255, 255], .4), (1 - v * .8) * (day ? .62 : .42) * veil); rect(bx + (rnd() - .5) * R * v * 2 - w / 2, y, w, 1.3) }
  for (let k = 0; k < (small ? 30 : 70); k++) { const v = rnd(), w = (5 + rnd() * 22) * (.4 + v); fill([255, 255, 255], .05 + .06 * rnd()); rect(rnd() * W, hz + 3 + v * (H - hz), w, 1) }
  // ---- clouds ----
  const cT = tone(mix([255, 255, 255], [128, 136, 152], Math.max(ri * .85, grey * .35))), cS = mix(tone(mix([186, 204, 236], [70, 78, 98], Math.max(ri * .9, grey * .4))), horizon, tw * .45), cH = mix(cT, [255, 255, 255], .5 * lum);
  const lobes = [[-1.25, .3, .55], [-.6, -.12, .8], [.1, -.38, .92], [.75, -.05, .72], [1.3, .32, .52]];
  const puff = (x, y, r) => {
    for (const [dy, cc, k, o] of [[r * .16, cS, 1, 0], [0, cT, 1, 0], [0, cH, .62, -.2]]) {
      const p = new Path(); for (const [dx, ey, rr] of lobes) { const q = rr * r * k; p.addEllipse(new Rect(x + dx * r + o * r - q, y + dy + ey * r + o * r - q, q * 2, q * 2)) }
      if (k === 1) p.addRoundedRect(new Rect(x - 1.8 * r, y + dy + .28 * r, 3.6 * r, .58 * r), r * .28, r * .28);
      g.addPath(p); fill(cc); g.fillPath();
    }
  };
  const spots = [[.8, .3, 1], [.52, .5, .7], [1, .56, .85], [.34, .2, .9], [.66, .14, 1.15], [.14, .5, .65]];
  spots.forEach(([x, y, sc], k) => { const s = smooth((cloud - k / 7) / .2); if (s > .05) puff(W * x, hz * y, U * .07 * sc * s * (1 + cloud * .35)) });
  if (cloud > .6) { const s = smooth((cloud - .6) / .3); for (let x = -U * .1; x < W + U * .2; x += U * .26) puff(x, -U * .05 + rnd() * U * .08 + (1 - s) * -U * .2, U * (.1 + rnd() * .05)) }
  if (fog) for (let k = 0; k < 7; k++) { fill(tone([226, 230, 236]), .2); rect(0, hz - U * .34 + k * U * .08, W, U * .09) }
  // ---- lightning ----
  if (storm) { let x = W * (.3 + rnd() * .4), y = U * .12; const pts = [[x, y]]; while (y < hz) { x += (rnd() - .5) * U * .2; y += U * (.07 + rnd() * .08); pts.push([x, Math.min(y, hz)]) }
    for (const [lw, a] of [[11, .1], [6, .22], [2.2, 1]]) { const p = new Path(); p.move(new Point(pts[0][0], pts[0][1])); for (const q of pts.slice(1)) p.addLine(new Point(q[0], q[1])); g.addPath(p); g.setStrokeColor(col([255, 246, 204], a)); g.setLineWidth(lw); g.strokePath() } }
  // ---- shore, trees and cabin ----
  const bankY = large ? H * .7 : H * .875, bank = x => bankY + U * .05 - U * .09 * (.5 + .5 * Math.cos(x / W * Math.PI * 2)) ** 1.6 - U * .012 * Math.sin(x / W * 23);
  const ground = tone(mix([14, 44, 40], [226, 234, 244], cold * .8)), pts = [[0, H]]; for (let x = 0; x <= W + 5; x += 5) pts.push([x, bank(x)]); pts.push([W, H]); poly(pts, ground);
  const pineD = tone([10, 40, 38]), pineL = tone(mix([34, 104, 74], lightC, .12)), lit = bx < W / 2 ? -1 : 1;
  const pine = (fx, h) => { const x = W * fx, y = bank(x) + 3; fill(tone([54, 38, 30])); rect(x - h * .035, y - h * .16, h * .07, h * .18);
    for (let k = 0; k < 4; k++) { const cy = y - h * (.1 + k * .2), hw = h * (.25 - k * .045), top = cy - h * .36; poly([[x - hw, cy], [x, top], [x + hw, cy]], pineD); poly([[x, cy], [x, top], [x + hw * lit, cy]], pineL);
      if (cold > .3) poly([[x - hw * .55, cy - h * .16], [x, top], [x + hw * .55, cy - h * .16]], tone([244, 248, 255]), cold * .9) } };
  for (const [fx, h] of small ? [[.05, .3], [.17, .22], [.94, .26]] : [[.03, .32], [.09, .23], [.15, .28], [.22, .18], [.86, .2], [.93, .3], [.99, .24]]) pine(fx, U * h);
  const cx = W * (small ? .76 : .78), cy = bank(cx) + 2, u = U * .034, night = 1 - dayK;
  for (let k = 0; k < 4; k++) { fill(tone([236, 238, 244]), .22 - k * .04); disc(cx + u * .7 + k * u * .5, cy - u * 3.4 - k * u * .9, u * (.35 + k * .16)) } // smoke
  fill(tone([92, 60, 44])); rect(cx + u * .5, cy - u * 2.9, u * .4, u); rect(cx - u * 1.2, cy - u * 1.5, u * 2.4, u * 1.5);
  poly([[cx - u * 1.6, cy - u * 1.45], [cx, cy - u * 2.8], [cx + u * 1.6, cy - u * 1.45]], tone(mix([150, 52, 46], [246, 250, 255], cold)));
  if (night > .1) glow(cx - u * .2, cy - u * .8, u * .3, u * 3.2, [255, 196, 96], .6 * night);
  fill(mix([50, 66, 92].map(v => v * lum), [255, 216, 120], night)); rect(cx - u * .55, cy - u * 1.15, u * .7, u * .7);
  // ---- rain or snow ----
  if (ri > 0) { const n = ri * W * H / (snow ? 330 : 240);
    for (let k = 0; k < n; k++) { const x = rnd() * W * 1.1, y = rnd() * H, z = .4 + rnd() * .6;
      if (snow) { fill([255, 255, 255], .35 + z * .6); disc(x, y, z * 2.1) }
      else { const p = new Path(); p.move(new Point(x, y)); p.addLine(new Point(x - 4.5 * z, y + 15 * z)); g.addPath(p); g.setStrokeColor(col([206, 228, 255], .2 + z * .45)); g.setLineWidth(.7 + z * .9); g.strokePath() } } }
  // ---- shade for the text ----
  { const st = Math.round(H * .45 / 24); for (let k = 0; k < 24; k++) { fill([4, 8, 34], .2 * (1 - k / 24) ** 2); rect(0, k * st, W, st) } }

  // ---- text ----
  const pad = 14, sp = spread(o, now), j = Math.max(0, d.hourly.time.findIndex(t => t > now));
  const label = (t, font, x, y) => { g.setFont(font); g.setTextColor(new Color('#06103a', .4)); g.drawText(t, new Point(x, y + 1.5)); g.setTextColor(Color.white()); g.drawText(t, new Point(x, y)) };
  label(o.loc.name || 'Skies', Font.boldRoundedSystemFont(13), pad, 10);
  label(deg(c.temperature_2m), Font.heavyRoundedSystemFont(small ? 52 : 58), pad - 2, 28);
  label(WMO[code] || '', Font.boldRoundedSystemFont(15), pad, small ? 92 : 98);
  const span = sp == null ? '' : '  ±' + Math.max(.5, Math.round(UNIT === 'C' ? sp : sp * 1.8) / 2) + '°';
  label(`H ${deg(d.daily.temperature_2m_max[0])}  L ${deg(d.daily.temperature_2m_min[0])}${span}`, Font.semiboldRoundedSystemFont(11), pad, small ? 112 : 118);
  const age = Math.round((Date.now() - o.at) / 60000);
  if (age > 90) { g.setFont(Font.semiboldRoundedSystemFont(11)); g.setTextColor(new Color('#ffd166')); g.drawText(`Old data: ${Math.round(age / 60)} h`, new Point(pad, H - 20)) }
  // ---- next hours on a glass panel ----
  if (!small) {
    const n = large ? 6 : 5, px = large ? pad : W * .47, pw = W - px - (large ? pad : 10), py = large ? H - 104 : 12, phh = 90, cw = pw / n, df = new DateFormatter(); df.dateFormat = 'ha';
    const panel = new Path(); panel.addRoundedRect(new Rect(px, py, pw, phh), 20, 20);
    g.addPath(panel); fill([8, 14, 44], .34); g.fillPath(); g.addPath(panel); g.setStrokeColor(new Color('#ffffff', .22)); g.setLineWidth(1); g.strokePath();
    const mini = (x, y, s, cc) => { fill(cc); disc(x - s * .3, y + s * .08, s * .24); disc(x, y - s * .08, s * .32); disc(x + s * .32, y + s * .1, s * .22); rect(x - s * .3, y + s * .08, s * .62, s * .24) };
    const icon = (x, y, s, wc, isDay) => {
      const body = () => { if (isDay) { fill([255, 210, 84]); disc(x, y, s * .34) } else { fill([230, 236, 252]); disc(x, y, s * .3); fill([30, 38, 76]); disc(x + s * .16, y - s * .1, s * .26) } };
      if (wc <= 1) return body();
      if (wc === 2) { const ox = x, oy = y; x += s * .2; y -= s * .16; body(); x = ox; y = oy }
      mini(x - (wc === 2 ? s * .08 : 0), y + (wc === 2 ? s * .08 : -s * .06), s, wc >= 51 ? [196, 204, 220] : [255, 255, 255]);
      const sn = (wc >= 71 && wc <= 77) || wc === 85 || wc === 86;
      if (wc >= 95) poly([[x + s * .06, y + s * .14], [x - s * .14, y + s * .42], [x, y + s * .42], [x - s * .08, y + s * .68], [x + s * .2, y + s * .32], [x + s * .06, y + s * .32]], [255, 214, 80]);
      else if (wc >= 51) for (const dx of [-.24, 0, .24]) { fill(sn ? [255, 255, 255] : [124, 196, 255]); sn ? disc(x + dx * s, y + s * .46, s * .07) : rect(x + dx * s - s * .035, y + s * .34, s * .07, s * .22) }
    };
    g.setTextAlignedCenter();
    for (let k = 0; k < n; k++) {
      const q = j + k * 2, x = px + k * cw; if (q >= d.hourly.time.length) break; const t = d.hourly.time[q];
      g.setTextColor(new Color('#ffffff', .78)); g.setFont(Font.semiboldRoundedSystemFont(10)); g.drawTextInRect(df.string(new Date(t * 1000)), new Rect(x, py + 9, cw, 14));
      icon(x + cw / 2, py + 37, 24, d.hourly.weather_code[q], sunAt(t)[0]);
      g.setTextColor(Color.white()); g.setFont(Font.boldRoundedSystemFont(15)); g.drawTextInRect(deg(d.hourly.temperature_2m[q]), new Rect(x, py + 53, cw, 20));
      const pp = d.hourly.precipitation_probability[q] || 0;
      if (pp >= 20) { g.setTextColor(new Color('#8fd3ff')); g.setFont(Font.semiboldRoundedSystemFont(9)); g.drawTextInRect(pp + '%', new Rect(x, py + 73, cw, 12)) }
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
