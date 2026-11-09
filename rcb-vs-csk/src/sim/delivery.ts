import { BAT_Z, BOWLER_CREASE_Z, STRIKER_CREASE_Z, STRIKER_STUMPS_Z } from './field';
import type { BowlKind, Difficulty, Hand, Vec3 } from './types';

export type Variation = 'stock' | 'slower' | 'swing' | 'bigturn' | 'quicker';

export interface DeliverySpec {
  kind: BowlKind;
  arm: Hand;
  variation: Variation;
  /** Speed shown to the player (km/h). */
  speedKmh: number;
  /** World x of the point where the ball pitches. */
  pitchX: number;
  /** Distance of the pitching point from the striker's stumps (m). */
  length: number;
  /** Lateral deviation in the air before the ball pitches (m, world x). */
  swing: number;
  /** Lateral speed change when the ball pitches (m/s, world x). */
  cut: number;
  /** Front-foot no-ball. */
  noBall: boolean;
}

const G = 9.81;

/** Flight of the delivery is slowed for playability. Real seconds = game seconds x factor. */
export function slowFactor(kind: BowlKind, difficulty: Difficulty): number {
  const base = kind === 'pace' ? 0.6 : 0.8;
  const d = difficulty === 'easy' ? 0.9 : difficulty === 'hard' ? 1.12 : 1;
  return base * d;
}

export type LengthName = 'yorker' | 'full' | 'good' | 'short' | 'bouncer';

export function lengthName(length: number, kind: BowlKind): LengthName {
  if (length < 2.6) return 'yorker';
  if (length < (kind === 'pace' ? 5.2 : 3.8)) return 'full';
  if (length < (kind === 'pace' ? 7.6 : 6.2)) return 'good';
  if (length < 10.4) return 'short';
  return 'bouncer';
}

/**
 * Trajectory of one delivery from release until it is well past the stumps.
 * All public times are in game seconds from the release.
 */
export class Delivery {
  readonly spec: DeliverySpec;
  readonly slow: number;
  readonly release: Vec3;
  readonly pitch: Vec3;
  readonly tPitch: number;
  /** Speed along the pitch before and after the bounce (real m/s). */
  readonly v0: number;
  readonly v1: number;

  private vx0: number;
  private ax: number;
  private vy0: number;
  private vx1: number;
  private vy1: number;
  private tauP: number;

  constructor(spec: DeliverySpec, slow: number) {
    this.spec = spec;
    this.slow = slow;
    const armSide = spec.arm === 'R' ? -1 : 1; // over the wicket
    this.release = {
      x: armSide * (spec.kind === 'pace' ? 0.45 : 0.38),
      y: spec.kind === 'pace' ? 2.12 : 1.98,
      z: BOWLER_CREASE_Z + 0.25,
    };
    const zp = STRIKER_STUMPS_Z + spec.length;
    this.pitch = { x: spec.pitchX, y: 0, z: zp };
    this.v0 = spec.speedKmh / 3.6;
    const d = this.release.z - zp;
    const tau = d / this.v0;
    this.tauP = tau;
    this.tPitch = tau / slow;
    this.ax = (2 * spec.swing) / (tau * tau);
    this.vx0 = (spec.pitchX - this.release.x - spec.swing) / tau;
    this.vy0 = (0.5 * G * tau * tau - this.release.y) / tau;
    const vyP = this.vy0 - G * tau;
    const pace = spec.kind === 'pace';
    const slowBall = spec.variation === 'slower';
    this.v1 = this.v0 * (pace ? (slowBall ? 0.82 : 0.87) : 0.8);
    const e = pace ? (slowBall ? 0.54 : 0.6) : 0.52;
    this.vy1 = -vyP * e;
    this.vx1 = (this.vx0 + this.ax * tau) * 0.75 + spec.cut;
  }

  /** Position at game time t after the release. */
  pos(t: number): Vec3 {
    const tau = Math.max(0, t) * this.slow;
    if (tau <= this.tauP) {
      return {
        x: this.release.x + this.vx0 * tau + 0.5 * this.ax * tau * tau,
        y: Math.max(0, this.release.y + this.vy0 * tau - 0.5 * G * tau * tau),
        z: this.release.z - this.v0 * tau,
      };
    }
    const u = tau - this.tauP;
    let y = this.vy1 * u - 0.5 * G * u * u;
    if (y < 0) {
      // Second bounce: keep it simple and low.
      const tb = (2 * this.vy1) / G;
      const w = u - tb;
      const vy2 = this.vy1 * 0.45;
      y = Math.max(0, vy2 * w - 0.5 * G * w * w);
    }
    return { x: this.pitch.x + this.vx1 * u, y, z: this.pitch.z - this.v1 * u };
  }

  /** Game time when the ball reaches the given z. */
  timeAtZ(z: number): number {
    if (z >= this.pitch.z) return (this.release.z - z) / this.v0 / this.slow;
    return (this.tauP + (this.pitch.z - z) / this.v1) / this.slow;
  }

  get tBat(): number {
    return this.timeAtZ(BAT_Z);
  }

  get tStumps(): number {
    return this.timeAtZ(STRIKER_STUMPS_Z);
  }

  atBat(): Vec3 {
    return this.pos(this.tBat);
  }

  atCrease(): Vec3 {
    return this.pos(this.timeAtZ(STRIKER_CREASE_Z));
  }

  atStumps(): Vec3 {
    return this.pos(this.tStumps);
  }

  /** Ball speed in game units (m per game second) near the batter. */
  get gameSpeedAtBat(): number {
    return (this.pitch.z > BAT_Z ? this.v1 : this.v0) * this.slow;
  }

  get lengthName(): LengthName {
    return lengthName(this.spec.length, this.spec.kind);
  }
}
