import type { Delivery } from './delivery';
import { BAT_Z, IDEAL_TAP_DIST, STRIKER_STUMPS_Z, STUMP_H, STUMP_HALF_W, BALL_R, legSign } from './field';
import { clamp, type Rng } from './rng';
import type { Difficulty, Player } from './types';

export type ShotType = 'defend' | 'ground' | 'loft';
export type TimingClass = 'perfect' | 'good' | 'ok' | 'poor' | 'miss';
export type Footwork = 'front' | 'back';
export type ShotName =
  | 'straight drive'
  | 'cover drive'
  | 'on drive'
  | 'square drive'
  | 'cut'
  | 'late cut'
  | 'pull'
  | 'flick'
  | 'glance'
  | 'defend'
  | 'leave'
  | 'scoop';

export interface ShotInput {
  type: ShotType;
  /** World shot angle (rad). 0 = straight (+z), positive toward +x. */
  angle: number;
  /** Distance of the ball in front of the bat plane when the player tapped (m). */
  ballDist: number;
}

export interface ShotContext {
  delivery: Delivery;
  batter: Player;
  bowler: Player;
  difficulty: Difficulty;
  /** True if a person plays the shot. The difficulty then changes the timing window. */
  human: boolean;
  rng: Rng;
}

export interface ShotResult {
  type: ShotType;
  name: ShotName;
  footwork: Footwork;
  lofted: boolean;
  /** Timing error in metres. Positive = early. */
  timingErr: number;
  /** Timing error normalised to the window. +/-1 = edge of the "good" band. */
  timingNorm: number;
  timing: TimingClass;
  contact: 'clean' | 'edge' | 'miss';
  edge?: 'outside' | 'inside' | 'top';
  /** Ball after the bat (only for clean and edge). */
  speed: number;
  angle: number;
  elev: number;
  /** Intended angle (as tapped). */
  aimed: number;
}

export interface PassResult {
  /** What happens when the bat does not touch the ball. */
  kind: 'bowled' | 'lbw' | 'pad' | 'stumped' | 'wide' | 'through';
}

export const TIMING_BANDS = { perfect: 0.45, good: 1.0, ok: 1.7, poor: 2.5 };

export function timingWindow(batter: Player, difficulty: Difficulty, human: boolean, type: ShotType): number {
  const d = human ? (difficulty === 'easy' ? 1.35 : difficulty === 'hard' ? 0.8 : 1) : 1;
  const skill = 0.82 + (batter.bat / 100) * 0.26;
  return d * skill * (type === 'defend' ? 1.5 : 1);
}

/** Footwork follows the length of the ball. */
export function footworkFor(delivery: Delivery): Footwork {
  return delivery.spec.length > (delivery.spec.kind === 'pace' ? 7.4 : 6.6) ? 'back' : 'front';
}

/** Names the shot from the direction (as seen by the batter) and the footwork. */
export function shotName(type: ShotType, angle: number, batter: Player, foot: Footwork): ShotName {
  if (type === 'defend') return 'defend';
  const side = legSign(batter.hand);
  const deg = (angle * 180) / Math.PI;
  const a = deg * side; // + = leg side
  const abs = Math.abs(a);
  if (abs > 150) return type === 'loft' ? 'scoop' : a > 0 ? 'glance' : 'late cut';
  if (a < 0) {
    if (abs < 20) return 'straight drive';
    if (abs < 62) return foot === 'front' ? 'cover drive' : 'cut';
    if (abs < 112) return foot === 'front' ? 'square drive' : 'cut';
    return 'late cut';
  }
  if (abs < 20) return 'straight drive';
  if (abs < 50) return foot === 'front' ? 'on drive' : 'pull';
  if (abs < 112) return foot === 'front' ? 'flick' : 'pull';
  return 'glance';
}

const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** How well the tapped direction fits the line and height of the ball (0.3 to 1). */
export function suitability(angle: number, off: number, height: number, side: number): number {
  const c = Math.sin(angle) * side; // +1 leg, -1 off
  const lineBias = clamp((off - 0.08) / 0.45, -1, 1); // + = ball outside off
  const mLine = Math.max(0, c * lineBias);
  const straight = Math.max(0, Math.cos(angle));
  const mLen = straight * clamp((height - 0.85) / 0.6, 0, 1);
  const square = 1 - Math.abs(Math.cos(angle));
  const mLow = square * clamp((0.22 - height) / 0.2, 0, 1) * 0.6;
  return clamp(1 - 0.55 * mLine - 0.45 * mLen - mLow, 0.3, 1);
}

/** How hard the ball is to play (-0.3 easy to 1 very hard). Used for AI batters and edge chances. */
export function nastiness(delivery: Delivery, batter: Player, bowler: Player): number {
  const side = legSign(batter.hand);
  const at = delivery.atBat();
  const off = -side * at.x;
  const len = delivery.lengthName;
  let n = (bowler.bowling - 62) / 110;
  if (len === 'good' && off > -0.05 && off < 0.35) n += 0.3;
  else if (len === 'yorker' && off > -0.2 && off < 0.3) n += 0.42;
  else if (len === 'bouncer' && at.y > 1.35 && at.y < 1.95) n += 0.22;
  else if (len === 'full' && Math.abs(off - 0.1) > 0.3) n -= 0.18;
  else if (len === 'short' && (off > 0.45 || off < -0.15)) n -= 0.2;
  if (off < -0.3) n -= 0.12;
  n += Math.abs(delivery.spec.swing) * 0.7 + Math.abs(delivery.spec.cut) * 0.09;
  if (delivery.spec.variation === 'slower') n += 0.1;
  return clamp(n, -0.3, 1);
}

export function resolveShot(input: ShotInput, ctx: ShotContext): ShotResult {
  const { delivery, batter, rng } = ctx;
  const side = legSign(batter.hand);
  const foot = footworkFor(delivery);
  const at = delivery.atBat();
  const off = -side * at.x;
  const w = timingWindow(batter, ctx.difficulty, ctx.human, input.type);
  const e = input.ballDist - IDEAL_TAP_DIST;
  const q = Math.abs(e) / w;
  const timing: TimingClass =
    q < TIMING_BANDS.perfect ? 'perfect' : q < TIMING_BANDS.good ? 'good' : q < TIMING_BANDS.ok ? 'ok' : q < TIMING_BANDS.poor ? 'poor' : 'miss';
  const name = shotName(input.type, input.angle, batter, foot);
  const res: ShotResult = {
    type: input.type,
    name,
    footwork: foot,
    lofted: input.type === 'loft',
    timingErr: e,
    timingNorm: e / w,
    timing,
    contact: 'miss',
    speed: 0,
    angle: input.angle,
    elev: 0,
    aimed: input.angle,
  };

  // Reach.
  const reachable = off > -0.8 && off < 1.1 && at.y < 2.0;
  if (timing === 'miss' || !reachable) {
    res.timing = timing;
    return res;
  }

  const s = suitability(input.angle, off, at.y, side);
  const nasty = Math.max(0, nastiness(delivery, batter, ctx.bowler));
  const tIdx = { perfect: 0, good: 1, ok: 2, poor: 3 }[timing];
  const defend = input.type === 'defend';
  const loft = input.type === 'loft';

  let pMiss = [0, 0.008, 0.045, 0.22][tIdx] + (1 - s) * 0.16 + nasty * 0.07 * Math.min(q, 2);
  if (defend) pMiss *= 0.3;
  if (rng.chance(pMiss)) return res;

  let pEdge = [0.003, 0.022, 0.09, 0.28][tIdx] + (1 - s) * 0.14 + nasty * 0.05;
  if (loft) pEdge *= 1.3;
  if (defend) pEdge *= 0.45;
  const vBall = delivery.pitch.z > BAT_Z ? delivery.v1 : delivery.v0;

  if (rng.chance(pEdge)) {
    res.contact = 'edge';
    const topEdge = (loft || at.y > 1.05) && rng.chance(0.55);
    if (topEdge) {
      res.edge = 'top';
      res.elev = rng.range(0.95, 1.3);
      res.speed = rng.range(15, 23);
      res.angle = rng.chance(0.5) ? norm(input.angle + rng.range(-0.8, 0.8)) : norm(Math.PI + rng.range(-0.9, 0.9));
    } else if (e < 0 ? rng.chance(0.8) : rng.chance(0.3)) {
      res.edge = 'outside';
      res.angle = norm(Math.PI + side * rng.range(0.06, 0.62));
      res.speed = vBall * rng.range(0.5, 0.78) * (defend ? 0.6 : 1);
      res.elev = defend ? rng.range(-0.12, 0.1) : rng.range(-0.08, 0.24);
    } else {
      res.edge = 'inside';
      res.angle = norm(Math.PI - side * rng.range(0.2, 0.9));
      res.speed = vBall * rng.range(0.35, 0.6) * (defend ? 0.6 : 1);
      res.elev = rng.range(-0.15, 0.03);
    }
    return res;
  }

  // Clean contact.
  res.contact = 'clean';
  const power = 0.55 + batter.power / 200;
  const tf = clamp(1 - 0.5 * Math.pow(q / TIMING_BANDS.ok, 2), 0.4, 1);
  const sf = 0.6 + 0.4 * s;
  const behind = Math.max(0, -Math.cos(input.angle)); // 1 = directly behind
  const paceHelp = 1 - behind * (1 - clamp(vBall / 36, 0.5, 1.05) * 0.82);

  // Direction: early drifts to the leg side, late drifts to the off side.
  let dx = Math.sin(input.angle) + side * 0.17 * clamp(e / w, -2.5, 2.5);
  const dz = Math.cos(input.angle);
  let ang = Math.atan2(dx, dz);
  ang += rng.gauss() * (0.035 + 0.1 * Math.min(q, 2.5));
  res.angle = norm(ang);

  if (defend) {
    res.speed = rng.range(4, 8.5) * (0.7 + 0.3 * tf);
    res.elev = rng.range(-0.1, 0.02);
    return res;
  }

  if (loft) {
    const yorker = at.y < 0.2 && delivery.pitch.z < BAT_Z + 1.2;
    res.speed = (24 + 15.5 * power) * tf * sf * paceHelp * (yorker ? 0.72 : 1) * rng.range(0.96, 1.03);
    if (tIdx <= 1) res.elev = rng.range(0.44, 0.6);
    else if (tIdx === 2) res.elev = rng.chance(0.5) ? rng.range(0.3, 0.75) : rng.range(0.75, 1.05);
    else res.elev = rng.range(0.8, 1.2);
    if (yorker) res.elev *= 0.6;
    return res;
  }

  // Ground shot.
  res.speed = (15.5 + 13 * power) * tf * sf * paceHelp * rng.range(0.95, 1.03);
  res.elev = rng.range(-0.04, 0.07);
  const pPop = [0, 0.012, 0.07, 0.22][tIdx] + (1 - s) * 0.08;
  if (rng.chance(pPop)) {
    res.elev = rng.range(0.3, 0.7);
    res.speed *= rng.range(0.5, 0.7);
    res.lofted = true;
  }
  return res;
}

/** The bat did not touch the ball: stumps, pad, keeper or wide. */
export function resolvePass(
  delivery: Delivery,
  batter: Player,
  played: ShotType | 'leave',
  rng: Rng,
): PassResult {
  const side = legSign(batter.hand);
  const st = delivery.atStumps();
  const cr = delivery.atCrease();
  const off = -side * cr.x;
  const hits = Math.abs(st.x) <= STUMP_HALF_W + BALL_R && st.y <= STUMP_H + BALL_R * 0.5;
  if (hits) {
    if (played !== 'leave') {
      const offSt = -side * st.x;
      const pPad = offSt < 0.03 ? 0.45 : 0.22;
      if (rng.chance(pPad)) {
        const pitchedOutsideLeg = -side * delivery.pitch.x < -(STUMP_HALF_W + 0.02) && delivery.pitch.z > STRIKER_STUMPS_Z + 1.3;
        return { kind: pitchedOutsideLeg ? 'pad' : 'lbw' };
      }
    }
    return { kind: 'bowled' };
  }
  if (off > 0.92 || off < -0.42 || cr.y > 2.1) return { kind: 'wide' };
  if (delivery.spec.kind === 'spin' && played !== 'leave' && played !== 'defend' && footworkFor(delivery) === 'front') {
    if (rng.chance(played === 'loft' ? 0.3 : 0.1)) return { kind: 'stumped' };
  }
  return { kind: 'through' };
}
