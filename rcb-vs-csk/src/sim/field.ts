import type { BowlKind, Hand, Phase } from './types';

// ---------- Ground geometry (metres) ----------
// The pitch is along the z axis. The striker is at -z and the bowler runs in from +z.
// The broadcast camera is behind the bowler and looks toward -z, so world +x is screen-right.
// For a right-handed batter the off side is -x and the leg side is +x.

export const STUMPS_Z = 10.06;
export const STRIKER_STUMPS_Z = -STUMPS_Z;
export const BOWLER_STUMPS_Z = STUMPS_Z;
export const STRIKER_CREASE_Z = -8.84;
export const BOWLER_CREASE_Z = 8.84;
export const RUN_LENGTH = 17.68;
export const BOUNDARY_R = 66;
export const RING_R = 27.43;
export const STUMP_H = 0.711;
export const STUMP_HALF_W = 0.1143;
export const BALL_R = 0.036;
/** z of the plane where the bat meets the ball (reference for timing). */
export const BAT_Z = STRIKER_CREASE_Z + 0.5;
/** Ideal distance of the ball in front of the bat at the moment of the tap. */
export const IDEAL_TAP_DIST = 2.0;

/** +1 if the leg side is world +x (right-hander), -1 for a left-hander. */
export const legSign = (hand: Hand) => (hand === 'R' ? 1 : -1);

export function insideRing(x: number, z: number): boolean {
  if (Math.abs(z) <= STUMPS_Z) return Math.abs(x) <= RING_R;
  const dz = Math.abs(z) - STUMPS_Z;
  return x * x + dz * dz <= RING_R * RING_R;
}

export interface FieldSpot {
  name: string;
  x: number;
  z: number;
}

// Positions are given for a right-hander as [shot angle in degrees, distance from the striker].
// Angle 0 = straight down the ground. Negative = off side. +/-180 = directly behind.
const SPOTS: Record<string, [number, number]> = {
  slip: [-166, 12],
  'short third': [-140, 26],
  'deep third': [-150, 52],
  'backward point': [-100, 25],
  point: [-88, 26],
  'deep point': [-95, 62],
  cover: [-62, 27],
  'extra cover': [-45, 28],
  'deep cover': [-68, 62],
  'mid-off': [-18, 30],
  'long-off': [-16, 71],
  'mid-on': [18, 30],
  'long-on': [16, 71],
  'mid-wicket': [55, 27],
  'deep mid-wicket': [52, 66],
  'square leg': [84, 25],
  'deep square leg': [82, 62],
  'short fine leg': [140, 26],
  'fine leg': [150, 52],
};

type FieldKey = `${Phase}-${BowlKind}`;

const FIELDS: Record<FieldKey, string[]> = {
  'powerplay-pace': ['slip', 'point', 'cover', 'mid-off', 'mid-on', 'mid-wicket', 'square leg', 'deep third', 'fine leg'],
  'powerplay-spin': ['slip', 'point', 'cover', 'mid-off', 'mid-on', 'mid-wicket', 'short fine leg', 'long-on', 'deep mid-wicket'],
  'middle-pace': ['short third', 'cover', 'mid-off', 'mid-wicket', 'deep point', 'long-on', 'deep mid-wicket', 'deep square leg', 'fine leg'],
  'middle-spin': ['point', 'cover', 'mid-wicket', 'short fine leg', 'long-off', 'long-on', 'deep mid-wicket', 'deep square leg', 'deep cover'],
  'death-pace': ['short third', 'point', 'extra cover', 'short fine leg', 'long-off', 'long-on', 'deep mid-wicket', 'deep square leg', 'deep cover'],
  'death-spin': ['short third', 'cover', 'mid-wicket', 'short fine leg', 'long-off', 'long-on', 'deep mid-wicket', 'deep square leg', 'deep point'],
};

export function spotPosition(name: string, hand: Hand): FieldSpot {
  const [deg, dist] = SPOTS[name];
  const a = (deg * Math.PI) / 180;
  const side = legSign(hand);
  return { name, x: Math.sin(a) * dist * side, z: STRIKER_CREASE_Z + Math.cos(a) * dist };
}

/** The 9 outfield positions for the phase, bowler type and batter hand. */
export function getField(phase: Phase, kind: BowlKind, hand: Hand): FieldSpot[] {
  return FIELDS[`${phase}-${kind}`].map((n) => spotPosition(n, hand));
}

export function keeperSpot(kind: BowlKind): FieldSpot {
  return { name: 'wicketkeeper', x: 0, z: STRIKER_STUMPS_Z - (kind === 'pace' ? 9.5 : 1.3) };
}

export interface FieldCheck {
  outsideRing: number;
  legSide: number;
  behindSquareLeg: number;
  insideBoundary: boolean;
}

export function checkField(spots: FieldSpot[], hand: Hand): FieldCheck {
  const side = legSign(hand);
  let outsideRing = 0;
  let leg = 0;
  let behind = 0;
  let inside = true;
  for (const s of spots) {
    if (!insideRing(s.x, s.z)) outsideRing++;
    if (s.x * side > 0.5) leg++;
    if (s.x * side > 0.5 && s.z < STRIKER_CREASE_Z) behind++;
    if (Math.hypot(s.x, s.z) > BOUNDARY_R - 1.5) inside = false;
  }
  return { outsideRing, legSide: leg, behindSquareLeg: behind, insideBoundary: inside };
}

export const maxOutsideRing = (phase: Phase) => (phase === 'powerplay' ? 2 : 5);

export const ALL_FIELD_KEYS = Object.keys(FIELDS) as FieldKey[];
