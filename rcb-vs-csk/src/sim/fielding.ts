import { BOUNDARY_R, BOWLER_STUMPS_Z, STRIKER_STUMPS_Z } from './field';
import type { Rng } from './rng';
import type { Vec3 } from './types';

export interface PathSample extends Vec3 {
  t: number;
  /** Horizontal speed (m/s). */
  v: number;
  /** True until the ball has touched the ground for the first time. */
  air: boolean;
}

export interface BallPath {
  samples: PathSample[];
  dt: number;
  /** 0 = stays in the field. */
  boundary: 0 | 4 | 6;
  /** Sample index where the ball crosses the rope (if boundary). */
  boundaryIndex: number;
  /** Time of the first bounce. */
  tFirstBounce: number;
}

const G = 9.81;
const DRAG = 0.0068;
const PATH_DT = 1 / 60;

/** Integrates the ball after it leaves the bat. Angle 0 = +z, positive toward +x. */
export function simulatePath(start: Vec3, speed: number, angle: number, elev: number, maxT = 14): BallPath {
  const samples: PathSample[] = [];
  let { x, y, z } = start;
  const ch = Math.cos(elev) * speed;
  let vx = Math.sin(angle) * ch;
  let vz = Math.cos(angle) * ch;
  let vy = Math.sin(elev) * speed;
  let air = true;
  let boundary: 0 | 4 | 6 = 0;
  let boundaryIndex = -1;
  let tFirstBounce = -1;
  let rolling = false;
  let afterBoundary = 0;
  for (let i = 0; i * PATH_DT <= maxT; i++) {
    const t = i * PATH_DT;
    const vh = Math.hypot(vx, vz);
    samples.push({ t, x, y, z, v: vh, air });
    if (boundary === 0 && Math.hypot(x, z) >= BOUNDARY_R) {
      boundary = air ? 6 : 4;
      boundaryIndex = i;
    }
    if (boundary) {
      afterBoundary += PATH_DT;
      if (afterBoundary > (boundary === 6 ? 2.5 : 0.5) || (y <= 0.02 && boundary === 6 && afterBoundary > 0.3)) break;
    }
    if (!boundary && rolling && vh < 0.4) break;

    if (rolling) {
      const dec = 1.5 + 0.12 * vh;
      const nv = Math.max(0, vh - dec * PATH_DT);
      const k = vh > 1e-6 ? nv / vh : 0;
      vx *= k;
      vz *= k;
      y = 0;
    } else {
      const v = Math.hypot(vx, vy, vz);
      const d = DRAG * v;
      vx -= vx * d * PATH_DT;
      vz -= vz * d * PATH_DT;
      vy -= (G + vy * d) * PATH_DT;
    }
    x += vx * PATH_DT;
    z += vz * PATH_DT;
    y += vy * PATH_DT;
    if (y <= 0 && !rolling) {
      y = 0;
      if (tFirstBounce < 0) tFirstBounce = t + PATH_DT;
      air = false;
      if (Math.abs(vy) < 1.6) {
        rolling = true;
        vy = 0;
      } else {
        // A flat bounce keeps most of its speed. A steep bounce loses more.
        const keep = 1 - Math.min(0.22, 0.035 * Math.abs(vy));
        vy = -vy * 0.42;
        vx *= keep;
        vz *= keep;
      }
    }
  }
  return { samples, dt: PATH_DT, boundary, boundaryIndex, tFirstBounce };
}

export function pathAt(path: BallPath, t: number): PathSample {
  const s = path.samples;
  const f = Math.max(0, Math.min(s.length - 1, t / path.dt));
  const i = Math.floor(f);
  const j = Math.min(s.length - 1, i + 1);
  const k = f - i;
  const a = s[i];
  const b = s[j];
  return {
    t,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    v: a.v + (b.v - a.v) * k,
    air: a.air,
  };
}

export interface Fielder {
  id: string;
  spot: string;
  x: number;
  z: number;
  /** Run speed (m/s). */
  speed: number;
  /** Reaction time (s). */
  react: number;
  keeper?: boolean;
  bowler?: boolean;
}

export type FieldingKind = 'boundary' | 'catch' | 'drop' | 'fielded' | 'stopped';

export interface FieldingPlan {
  kind: FieldingKind;
  /** Index into the fielders array. -1 for a boundary with no chase result. */
  fielder: number;
  /** Time (from contact) when the fielder reaches the ball, or the ball crosses the rope. */
  t: number;
  pos: Vec3;
  /** Extra time before the fielder can throw. */
  delay: number;
  dive: boolean;
  /** Fielder nearest to the ball path that also chases (for display). */
  backup: number;
}

export interface FieldingOptions {
  /** Multiplier on catch probability. */
  catchSkill: number;
  /** Multiplier on fielder speed. */
  speedScale: number;
  /** If true, a catch cannot be dropped or taken: used for tests. */
  forceCatch?: boolean;
}

const GROUND_REACH = 0.9;
const DIVE_REACH = 0.9;
const CATCH_H = 2.45;

/** Decides which fielder gets to the ball first and what happens there. */
export function planFielding(path: BallPath, fielders: Fielder[], rng: Rng, opt: FieldingOptions): FieldingPlan {
  const s = path.samples;
  const last = path.boundary ? path.boundaryIndex : s.length - 1;
  let best = -1;
  let bestI = -1;
  let dive = false;
  for (let i = 1; i <= last && best < 0; i++) {
    const p = s[i];
    if (p.y > CATCH_H) continue;
    let slackBest = -1e9;
    for (let f = 0; f < fielders.length; f++) {
      const fl = fielders[f];
      const need = Math.hypot(p.x - fl.x, p.z - fl.z);
      const run = fl.speed * opt.speedScale * Math.max(0, p.t - fl.react);
      // A fielder can dive only after the reaction time.
      const reach = p.t >= fl.react * 0.6 ? GROUND_REACH + DIVE_REACH : 0.5;
      const slack = run + reach - need;
      if (slack >= 0 && slack > slackBest) {
        slackBest = slack;
        best = f;
        bestI = i;
        dive = slack < DIVE_REACH;
      }
    }
  }

  const backup = nearestToPath(path, fielders, best);

  if (best < 0) {
    if (path.boundary) {
      const p = s[path.boundaryIndex];
      return { kind: 'boundary', fielder: -1, t: p.t, pos: { x: p.x, y: p.y, z: p.z }, delay: 0, dive: false, backup };
    }
    // Ball stopped in the field: the nearest fielder runs to it.
    const p = s[s.length - 1];
    let bf = 0;
    let bt = 1e9;
    fielders.forEach((fl, f) => {
      const tt = fl.react + Math.max(0, Math.hypot(p.x - fl.x, p.z - fl.z) - GROUND_REACH) / (fl.speed * opt.speedScale);
      if (tt < bt) {
        bt = tt;
        bf = f;
      }
    });
    return { kind: 'stopped', fielder: bf, t: Math.max(bt, p.t), pos: { x: p.x, y: 0, z: p.z }, delay: 0.45, dive: false, backup };
  }

  const p = s[bestI];
  const pos = { x: p.x, y: p.y, z: p.z };
  const fl = fielders[best];
  if (p.air) {
    // Catch attempt.
    let pc = p.t < 0.45 ? 0.5 : p.t < 0.8 ? 0.76 : 0.94;
    if (fl.keeper) pc = Math.min(0.97, pc + 0.2);
    if (dive) pc *= 0.72;
    if (p.y > 2.1) pc *= 0.85;
    if (p.t > 3.6) pc *= 0.94;
    pc = Math.min(0.975, pc * opt.catchSkill);
    const caught = opt.forceCatch ?? rng.chance(pc);
    if (caught) return { kind: 'catch', fielder: best, t: p.t, pos, delay: 0, dive, backup };
    return { kind: 'drop', fielder: best, t: p.t, pos: { ...pos, y: 0 }, delay: 1.0, dive, backup };
  }
  // Ground fielding. A fast ball at full stretch can be fumbled.
  let delay = dive ? 0.75 : 0.42;
  if (p.v > 20 && dive && rng.chance(0.35)) delay += 0.8;
  else if (rng.chance(0.03)) delay += 0.7;
  return { kind: 'fielded', fielder: best, t: p.t, pos: { ...pos, y: Math.min(pos.y, 1) }, delay, dive, backup };
}

function nearestToPath(path: BallPath, fielders: Fielder[], exclude: number): number {
  const s = path.samples;
  const end = s[path.boundary ? path.boundaryIndex : s.length - 1];
  let bf = -1;
  let bd = 1e9;
  fielders.forEach((fl, f) => {
    if (f === exclude || fl.keeper || fl.bowler) return;
    const d = Math.hypot(end.x - fl.x, end.z - fl.z);
    if (d < bd) {
      bd = d;
      bf = f;
    }
  });
  return bf;
}

/** Time for a throw from a position to the stumps at one end. */
export function throwTime(from: Vec3, end: 'striker' | 'bowler'): number {
  const z = end === 'striker' ? STRIKER_STUMPS_Z : BOWLER_STUMPS_Z;
  const d = Math.hypot(from.x, from.z - z);
  return d / (d > 45 ? 25 : 29) + 0.12;
}
