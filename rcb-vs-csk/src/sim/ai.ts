import { Delivery, slowFactor, type DeliverySpec, type Variation } from './delivery';
import { STRIKER_CREASE_Z, STRIKER_STUMPS_Z, legSign } from './field';
import type { Fielder } from './fielding';
import type { Match } from './match';
import { clamp, type Rng } from './rng';
import { nastiness, type ShotType } from './shot';
import type { BowlKind, Difficulty, Phase, Player } from './types';

export interface Situation {
  phase: Phase;
  ballsLeft: number;
  wicketsDown: number;
  score: number;
  target: number | null;
  oversTotal: number;
}

export const VARIATIONS: Record<BowlKind, Variation[]> = {
  pace: ['stock', 'slower', 'swing'],
  spin: ['stock', 'bigturn', 'quicker'],
};

export const VARIATION_LABEL: Record<Variation, string> = {
  stock: 'Stock',
  slower: 'Slower',
  swing: 'Swing',
  bigturn: 'Big turn',
  quicker: 'Quicker',
};

// ---------- Delivery construction ----------

function baseSpec(bowler: Player, variation: Variation, rng: Rng): DeliverySpec {
  const st = bowler.bowl!;
  const q = bowler.bowling / 100;
  let speed = st.speed[0] + (st.speed[1] - st.speed[0]) * clamp(0.25 + q * 0.5 + rng.range(-0.25, 0.25), 0, 1);
  let swing = 0;
  let cut = 0;
  if (st.kind === 'pace') {
    cut = rng.gauss() * 0.22;
    if (variation === 'slower') {
      speed -= rng.range(19, 27);
      cut = rng.gauss() * 0.45;
    } else if (variation === 'swing') {
      speed -= 2;
      swing = (st.arm === 'R' ? -1 : 1) * (0.28 + 0.3 * q) * rng.range(0.8, 1.15);
    }
  } else {
    const turn = st.turn ?? 1;
    cut = turn * (1.3 + 0.9 * q) * rng.range(0.85, 1.15);
    if (variation === 'bigturn') {
      cut *= 1.75;
      speed -= 5;
    } else if (variation === 'quicker') {
      cut *= 0.4;
      speed += rng.range(9, 14);
    }
  }
  return {
    kind: st.kind,
    arm: st.arm,
    variation,
    speedKmh: Math.round(speed * 10) / 10,
    pitchX: 0,
    length: 6,
    swing,
    cut,
    noBall: false,
  };
}

/** Sets pitchX so that the ball passes the stumps at world x = xAtStumps. */
export function aimAtStumps(spec: DeliverySpec, xAtStumps: number): void {
  let px = xAtStumps;
  for (let i = 0; i < 4; i++) {
    spec.pitchX = px;
    const got = new Delivery(spec, 1).atStumps().x;
    px += xAtStumps - got;
  }
  spec.pitchX = px;
}

const PACE_LENGTH = { yorker: 1.8, full: 4.3, good: 6.4, short: 8.9, bouncer: 11.1 };
const SPIN_LENGTH = { yorker: 2.2, full: 3.3, good: 4.9, short: 7.4, bouncer: 8.4 };

function weighted<T extends string>(rng: Rng, table: Record<T, number>): T {
  const keys = Object.keys(table) as T[];
  let sum = 0;
  for (const k of keys) sum += table[k];
  let r = rng.next() * sum;
  for (const k of keys) {
    r -= table[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

/** Delivery from a computer bowler to the player. */
export function aiDelivery(bowler: Player, batter: Player, sit: Situation, difficulty: Difficulty, rng: Rng): DeliverySpec {
  const kind = bowler.bowl!.kind;
  const side = legSign(batter.hand);
  const dF = difficulty === 'easy' ? 1.3 : difficulty === 'hard' ? 0.82 : 1;
  let variation: Variation;
  if (kind === 'pace') {
    variation = weighted(rng, {
      stock: 0.58,
      swing: sit.phase === 'powerplay' ? 0.3 : 0.12,
      slower: sit.phase === 'death' ? 0.34 : 0.16,
    } as Record<Variation, number>);
  } else {
    variation = weighted(rng, { stock: 0.55, bigturn: 0.25, quicker: 0.2 } as Record<Variation, number>);
  }
  const spec = baseSpec(bowler, variation, rng);
  const lenName =
    kind === 'pace'
      ? sit.phase === 'death'
        ? weighted(rng, { yorker: 0.36, full: 0.14, good: 0.22, short: 0.18, bouncer: 0.1 })
        : sit.phase === 'powerplay'
          ? weighted(rng, { yorker: 0.07, full: 0.2, good: 0.52, short: 0.15, bouncer: 0.06 })
          : weighted(rng, { yorker: 0.14, full: 0.14, good: 0.44, short: 0.18, bouncer: 0.1 })
      : weighted(rng, { yorker: 0.06, full: 0.24, good: 0.56, short: 0.14, bouncer: 0 });
  const table = kind === 'pace' ? PACE_LENGTH : SPIN_LENGTH;
  const skillErr = (100 - bowler.bowling) / 100;
  const bad = rng.chance(difficulty === 'easy' ? 0.09 : difficulty === 'hard' ? 0.03 : 0.055) ? 2.6 : 1;
  const sLine = (0.15 + skillErr * 0.25) * dF * bad;
  const sLen = (0.45 + skillErr * 0.9) * dF * bad;
  spec.length = clamp(table[lenName] + rng.gauss() * sLen, 0.6, 12.5);
  let off = lenName === 'bouncer' ? -0.05 : lenName === 'yorker' ? 0.05 : 0.17;
  if (kind === 'spin') off = 0.12;
  off += rng.gauss() * sLine;
  aimAtStumps(spec, -side * off);
  spec.noBall = rng.chance(0.012);
  return spec;
}

export interface BowlInput {
  variation: Variation;
  /** Target pitching point: world x and distance from the striker's stumps. */
  x: number;
  length: number;
  /** 0 (worst) to 1 (perfect). */
  accuracy: number;
  /** True if the meter was stopped in the no-ball zone. */
  overstep: boolean;
}

/** Delivery from the player's bowler. */
export function userDelivery(bowler: Player, input: BowlInput, rng: Rng): DeliverySpec {
  const spec = baseSpec(bowler, input.variation, rng);
  const acc = clamp(input.accuracy, 0, 1);
  const r = Math.pow(1 - acc, 1.6) * 1.25 * (1.35 - bowler.bowling / 160) + 0.04;
  const phi = rng.range(0, Math.PI * 2);
  spec.pitchX = input.x + Math.cos(phi) * r * 0.55 + rng.gauss() * 0.03;
  spec.length = clamp(input.length + Math.sin(phi) * r * 2.4, 0.5, 13);
  const eff = 0.45 + 0.55 * acc;
  spec.swing *= eff;
  if (spec.kind === 'spin') spec.cut *= eff;
  spec.noBall = input.overstep;
  return spec;
}

// ---------- Batting ----------

export function aggression(sit: Situation, batter: Player): number {
  let a = sit.phase === 'powerplay' ? 0.55 : sit.phase === 'death' ? 0.8 : 0.45;
  if (sit.oversTotal <= 5) a += 0.15;
  if (sit.target !== null) {
    const need = sit.target - sit.score;
    const rrr = sit.ballsLeft > 0 ? (need * 6) / sit.ballsLeft : 36;
    a = clamp(0.3 + ((rrr - 5) / 9) * 0.6, 0.22, 0.98);
    if (need <= 2) a = Math.min(a, 0.3);
  }
  const inHand = 10 - sit.wicketsDown;
  if (inHand <= 3 && sit.ballsLeft > 18) a *= 0.72;
  else if (inHand <= 5 && sit.ballsLeft > 36) a *= 0.85;
  if (sit.ballsLeft <= 12 && sit.target === null) a = Math.max(a, 0.82);
  a += (batter.power - 75) / 260;
  return clamp(a, 0.12, 0.98);
}

/** Angular distance (rad) from a shot angle to the nearest relevant fielder. Larger = bigger gap. */
export function gapScore(angle: number, fielders: Fielder[], lofted: boolean): number {
  let best = Math.PI;
  for (const f of fielders) {
    if (f.keeper || f.bowler) continue;
    const dist = Math.hypot(f.x, f.z - STRIKER_CREASE_Z);
    const deep = dist > 42;
    const fa = Math.atan2(f.x, f.z - STRIKER_CREASE_Z);
    let d = Math.abs(Math.atan2(Math.sin(angle - fa), Math.cos(angle - fa)));
    // Deep fielders cover more angle against lofted shots. Close fielders matter more on the ground.
    if (lofted) d *= deep ? 0.8 : 2.2;
    else d *= deep ? 1.5 : 1;
    if (d < best) best = d;
  }
  return best;
}

export interface BatPlan {
  leave: boolean;
  type: ShotType;
  angle: number;
  timingErr: number;
}

/** Decision of a computer batter for one delivery. */
export function aiBatPlan(
  delivery: Delivery,
  batter: Player,
  bowler: Player,
  fielders: Fielder[],
  sit: Situation,
  difficulty: Difficulty,
  rng: Rng,
  freeHit = false,
): BatPlan {
  const side = legSign(batter.hand);
  const at = delivery.atBat();
  const off = -side * at.x;
  const len = delivery.lengthName;
  const st = delivery.atStumps();
  const atStumps = Math.abs(st.x) < 0.16 && st.y < 0.75;
  let A = aggression(sit, batter);
  if (freeHit) A = Math.max(A, 0.9);
  const n = nastiness(delivery, batter, bowler);

  if (off > 0.97 || off < -0.5 || at.y > 2.02) return { leave: true, type: 'ground', angle: 0, timingErr: 0 };
  if (!atStumps && off > 0.72 && A < 0.5 && rng.chance(0.5)) return { leave: true, type: 'ground', angle: 0, timingErr: 0 };

  const loftSuit = len === 'full' || len === 'short' ? 1 : len === 'good' ? 0.55 : len === 'yorker' ? 0.22 : 0.5;
  const pLoft = clamp(A * A * 0.6 * loftSuit * (0.7 + batter.power / 250), 0, 0.8);
  const threat = atStumps && (len === 'good' || len === 'yorker') ? 1 : 0.4;
  const pDef = clamp((1 - A) * 0.42 * threat + (n > 0.5 ? 0.08 : 0), 0, 0.6);
  const r = rng.next();
  const type: ShotType = r < pLoft ? 'loft' : r < pLoft + pDef ? 'defend' : 'ground';

  let cands: number[];
  if (type === 'defend') cands = [off > 0.2 ? -25 : 8];
  else if (len === 'bouncer') cands = [95, 120, 70, 150];
  else if (len === 'short') cands = off > 0.22 ? [-95, -80, -110, -65] : [70, 90, 55, 110];
  else if (off > 0.35) cands = [-40, -55, -70, -25, -90];
  else if (off > 0.1) cands = [-30, -10, -50, 5, 20];
  else if (off > -0.12) cands = [0, 15, 30, -15, 50];
  else cands = [45, 65, 85, 130, 25];

  const toWorld = (deg: number) => ((deg * Math.PI) / 180) * side;
  let pick = cands[0];
  if (cands.length > 1) {
    if (rng.chance(0.45 + batter.bat / 250)) {
      let bs = -1;
      for (const c of cands) {
        const sc = gapScore(toWorld(c), fielders, type === 'loft') + rng.range(0, 0.08);
        if (sc > bs) {
          bs = sc;
          pick = c;
        }
      }
    } else pick = rng.pick(cands);
  }
  const angle = toWorld(pick + rng.range(-6, 6));

  const dF = difficulty === 'easy' ? 1.3 : difficulty === 'hard' ? 0.8 : 1;
  let sigma = (0.44 + ((100 - batter.bat) / 100) * 0.75) * dF * (1 + Math.max(0, n) * 0.7);
  if (type === 'loft') sigma *= 1.12;
  let bias = 0;
  if (delivery.spec.variation === 'slower') bias += 0.45 * (1 - batter.bat / 160);
  if (delivery.spec.variation === 'quicker') bias -= 0.35 * (1 - batter.bat / 160);
  return { leave: false, type, angle, timingErr: rng.gauss() * sigma + bias };
}

// ---------- Captaincy ----------

/** Selects the computer's bowler for the next over. */
export function aiChooseBowler(match: Match, rng: Rng): Player {
  const inn = match.current;
  const phase = match.phase(inn);
  const eligible = match.eligibleBowlers(inn);
  const quota = Math.ceil(match.config.overs / 5) * 6;
  let best = eligible[0];
  let bestScore = -1e9;
  for (const pl of eligible) {
    const kind = pl.bowl!.kind;
    const left = quota - match.bowlCard(inn, pl.id).balls;
    let s = pl.bowling + rng.range(0, 9);
    if (phase === 'powerplay' && kind === 'pace') s += 7;
    if (phase === 'middle' && kind === 'spin') s += 9;
    if (phase === 'death' && kind === 'pace') s += 9;
    // Keep one over of the best pace bowlers for the end of the innings.
    if (phase !== 'death' && kind === 'pace' && left <= 6 && pl.bowling >= 80 && match.config.overs >= 10) s -= 14;
    if (pl.bowling < 45) s -= 25;
    if (s > bestScore) {
      bestScore = s;
      best = pl;
    }
  }
  return best;
}

export function situationOf(match: Match): Situation {
  const inn = match.current;
  return {
    phase: match.phase(inn),
    ballsLeft: match.ballsLeft(inn),
    wicketsDown: inn.wickets,
    score: inn.score,
    target: inn.target,
    oversTotal: match.config.overs,
  };
}

export { slowFactor, STRIKER_STUMPS_Z };
