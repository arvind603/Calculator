import type { ShotName } from '../sim/shot';
import { makePose, P, type Key, type Pose, type PoseSpec } from './figure';

// All poses are for a right-hander. A mirrored figure gives the left-hander.
//
// Batting frame (figure-local): +X = toward the bowler, +Z = off side, -Z = leg side.

type V3 = [number, number, number];

// ---------- Batting ----------

export const STANCE = makePose({
  pelvis: [0, 0.8, -0.03],
  lean: 0.5,
  twist: 0.1,
  headYaw: 1.2,
  headPitch: 0.04,
  footL: [0.22, 0, 0],
  footR: [-0.22, 0, 0],
  footYawL: 0.3,
  footYawR: 0.05,
  grip: [0.03, 0.72, 0.27],
  batDir: [-0.36, -0.92, -0.1],
  batFace: [0.9, -0.3, 0.2],
  batMode: 1,
});

/** Small bat tap while the batter waits. */
export const STANCE_TAP = makePose({ grip: [0.03, 0.76, 0.27], batDir: [-0.33, -0.93, -0.1], pelvis: [0, 0.81, -0.03] }, STANCE);

export const BACKLIFT = makePose(
  {
    pelvis: [0, 0.82, -0.03],
    lean: 0.42,
    twist: -0.14,
    headYaw: 1.3,
    grip: [-0.17, 0.98, 0.16],
    batDir: [-0.28, 0.93, -0.14],
    batFace: [0.85, 0.3, 0.4],
  },
  STANCE,
);

const FRONT: PoseSpec = { pelvis: [0.2, 0.78, 0], lean: 0.55, footL: [0.6, 0, 0.04], footYawL: 0.8, footR: [-0.22, 0.02, 0], footYawR: 0.1 };
const BACK: PoseSpec = { pelvis: [-0.16, 0.9, 0.03], lean: 0.3, footL: [0.12, 0, 0.02], footYawL: 0.35, footR: [-0.42, 0, 0.07], footYawR: 0 };

export const FOOT_FRONT = makePose(FRONT, BACKLIFT);
export const FOOT_BACK = makePose({ ...BACK, grip: [-0.3, 1.08, 0.18] }, BACKLIFT);

interface ShotDef {
  /** Grip positions are relative to the pelvis x and z of the footwork pose. */
  contact: PoseSpec;
  follow: PoseSpec;
  finish: PoseSpec;
  /** Extra stride for the front foot (added to the footwork pose). */
  stride?: V3;
  /** Seconds from contact to the follow and finish keys. */
  tFollow?: number;
  tFinish?: number;
  hold?: number;
}

const SHOTS: Record<ShotName, ShotDef> = {
  'straight drive': {
    contact: { grip: [0.2, 0.7, 0.28], batDir: [-0.16, -0.98, 0], batFace: [1, 0, 0], twist: 0.2, headYaw: 1.2 },
    follow: { grip: [0.36, 1.12, 0.26], batDir: [0.72, 0.68, 0.05], batFace: [0.6, -0.7, 0], twist: 0.45, lean: 0.4 },
    finish: { grip: [0.2, 1.42, 0.12], batDir: [-0.35, 0.8, -0.45], batFace: [0.8, 0.5, 0], twist: 0.6, lean: 0.25 },
  },
  'cover drive': {
    stride: [-0.06, 0, 0.2],
    contact: { grip: [0.16, 0.7, 0.46], batDir: [-0.14, -0.96, 0.2], batFace: [0.72, 0, 0.68], twist: 0.05, lean: 0.62 },
    follow: { grip: [0.3, 1.14, 0.5], batDir: [0.5, 0.68, 0.52], batFace: [0.5, -0.7, 0.5], twist: 0.3, lean: 0.45 },
    finish: { grip: [0.14, 1.44, 0.22], batDir: [-0.45, 0.78, -0.4], batFace: [0.7, 0.5, 0.4], twist: 0.5, lean: 0.3 },
  },
  'square drive': {
    stride: [-0.14, 0, 0.26],
    contact: { grip: [0.06, 0.74, 0.5], batDir: [-0.3, -0.72, 0.62], batFace: [0.5, 0, 0.86], twist: -0.1, lean: 0.66 },
    follow: { grip: [0.16, 1.0, 0.56], batDir: [0.4, 0.3, 0.86], batFace: [0.3, -0.8, 0.5], twist: 0.2, lean: 0.5 },
    finish: { grip: [0.14, 1.32, 0.3], batDir: [0.2, 0.86, -0.4], batFace: [0.9, 0, 0.4], twist: 0.4, lean: 0.35 },
  },
  'on drive': {
    stride: [0, 0, -0.08],
    contact: { grip: [0.2, 0.7, 0.14], batDir: [-0.15, -0.98, -0.06], batFace: [0.8, 0, -0.6], twist: 0.35 },
    follow: { grip: [0.36, 1.1, 0.0], batDir: [0.62, 0.7, -0.35], batFace: [0.6, -0.6, -0.5], twist: 0.6, lean: 0.4 },
    finish: { grip: [0.24, 1.42, -0.06], batDir: [-0.3, 0.8, -0.52], batFace: [0.8, 0.5, -0.2], twist: 0.8, lean: 0.25 },
  },
  flick: {
    stride: [-0.1, 0, -0.06],
    contact: { grip: [0.14, 0.74, 0.1], batDir: [0.12, -0.96, -0.24], batFace: [0.35, 0, -0.94], twist: 0.5 },
    follow: { grip: [0.2, 1.04, -0.12], batDir: [0.45, 0.35, -0.82], batFace: [0.7, -0.5, 0.5], twist: 0.9, lean: 0.35 },
    finish: { grip: [0.16, 1.3, -0.2], batDir: [-0.1, 0.75, -0.65], batFace: [0.9, 0.2, -0.3], twist: 1.05, lean: 0.25 },
  },
  glance: {
    stride: [-0.2, 0, -0.04],
    contact: { grip: [0.1, 0.78, 0.06], batDir: [-0.05, -0.97, -0.24], batFace: [-0.35, 0, -0.94], twist: 0.45 },
    follow: { grip: [0.08, 0.86, -0.06], batDir: [-0.3, -0.85, -0.42], batFace: [-0.6, 0.1, -0.8], twist: 0.6 },
    finish: { grip: [0.06, 0.9, -0.06], batDir: [-0.34, -0.82, -0.45], batFace: [-0.6, 0.1, -0.8], twist: 0.6 },
    tFollow: 0.2,
    tFinish: 0.45,
  },
  cut: {
    contact: { grip: [0.08, 1.0, 0.44], batDir: [-0.45, -0.2, 0.87], batFace: [0.87, 0, 0.5], twist: -0.25, lean: 0.4 },
    follow: { grip: [0.24, 1.04, 0.44], batDir: [0.6, 0.08, 0.8], batFace: [0.7, -0.4, -0.5], twist: 0.2, lean: 0.4 },
    finish: { grip: [0.3, 1.2, 0.26], batDir: [0.86, 0.45, 0.2], batFace: [0.3, -0.6, -0.7], twist: 0.5, lean: 0.3 },
  },
  'late cut': {
    contact: { grip: [-0.04, 0.84, 0.44], batDir: [-0.62, -0.42, 0.66], batFace: [0.5, 0.3, 0.8], twist: -0.45, lean: 0.55 },
    follow: { grip: [-0.02, 0.8, 0.5], batDir: [-0.4, -0.5, 0.77], batFace: [0.7, 0.2, 0.7], twist: -0.35, lean: 0.55 },
    finish: { grip: [0, 0.82, 0.5], batDir: [-0.3, -0.52, 0.8], batFace: [0.7, 0.2, 0.7], twist: -0.3, lean: 0.5 },
    tFollow: 0.18,
    tFinish: 0.4,
  },
  pull: {
    contact: { grip: [0.38, 1.16, 0.2], batDir: [0.92, 0.02, 0.38], batFace: [0.35, 0, -0.94], twist: 0.6, lean: 0.2, pelvisYaw: 0.35 },
    follow: { grip: [0.34, 1.24, -0.1], batDir: [0.32, 0.12, -0.94], batFace: [-0.9, 0, -0.3], twist: 1.1, lean: 0.15, pelvisYaw: 0.6 },
    finish: { grip: [0.2, 1.32, -0.2], batDir: [-0.68, 0.32, -0.66], batFace: [-0.6, 0, 0.7], twist: 1.4, lean: 0.12, pelvisYaw: 0.75 },
  },
  defend: {
    contact: { grip: [0.18, 0.74, 0.26], batDir: [-0.3, -0.95, 0], batFace: [1, 0, 0], twist: 0.15, headPitch: 0.25 },
    follow: { grip: [0.19, 0.74, 0.26], batDir: [-0.33, -0.94, 0], batFace: [1, 0, 0], twist: 0.15, headPitch: 0.25 },
    finish: { grip: [0.19, 0.75, 0.26], batDir: [-0.33, -0.94, 0], batFace: [1, 0, 0], twist: 0.15, headPitch: 0.2 },
    tFollow: 0.25,
    tFinish: 0.6,
    hold: 0.1,
  },
  leave: {
    contact: { grip: [-0.1, 1.3, 0.05], batDir: [-0.3, 0.9, -0.32], batFace: [0.8, 0.3, 0.5], twist: -0.25, lean: 0.25, headYaw: 0.9 },
    follow: { grip: [-0.1, 1.32, 0.03], batDir: [-0.32, 0.9, -0.3], batFace: [0.8, 0.3, 0.5], twist: -0.3, lean: 0.22, headYaw: 0.3 },
    finish: { grip: [-0.08, 1.28, 0.05], batDir: [-0.3, 0.9, -0.3], batFace: [0.8, 0.3, 0.5], twist: -0.3, lean: 0.22, headYaw: -0.6 },
    tFollow: 0.2,
    tFinish: 0.5,
  },
  scoop: {
    contact: { grip: [0.16, 0.62, 0.14], batDir: [0.72, -0.62, 0.1], batFace: [0.5, 0.86, 0], twist: 0.3, lean: 0.75, pelvis: [0.12, 0.62, 0] },
    follow: { grip: [0.1, 1.05, 0.12], batDir: [0.1, 0.99, 0], batFace: [-1, 0.1, 0], twist: 0.3, lean: 0.45 },
    finish: { grip: [0, 1.3, 0.1], batDir: [-0.6, 0.8, 0], batFace: [-0.8, -0.6, 0], twist: 0.2, lean: 0.3 },
  },
};

function addXZ(v: V3 | undefined, dx: number, dz: number): V3 | undefined {
  return v ? [v[0] + dx, v[1], v[2] + dz] : undefined;
}

export interface SwingPlan {
  keys: Key[];
  /** Key index of the contact pose. */
  contactIndex: number;
}

/**
 * Builds the swing track. Time 0 = the tap, tContact = the moment of contact.
 * ballLocal is the contact point in the batter's local frame (if known).
 */
export function buildSwing(
  name: ShotName,
  foot: 'front' | 'back',
  from: Pose,
  tContact: number,
  lofted: boolean,
  ballLocal: V3 | null,
): SwingPlan {
  const def = SHOTS[name];
  const backOnly = name === 'cut' || name === 'pull' || name === 'late cut';
  const frontOnly = name === 'cover drive' || name === 'square drive' || name === 'on drive' || name === 'flick' || name === 'scoop';
  const useFoot = backOnly ? 'back' : frontOnly ? 'front' : foot;
  const base: PoseSpec = { ...(useFoot === 'front' ? FRONT : BACK) };
  if (def.stride && useFoot === 'front') {
    const f = base.footL!;
    base.footL = [f[0] + def.stride[0], f[1], f[2] + def.stride[2]];
    base.pelvis = [base.pelvis![0] + def.stride[0] * 0.4, base.pelvis![1], base.pelvis![2] + def.stride[2] * 0.5];
  }
  if (name === 'leave') {
    base.footL = [0.3, 0, 0.14];
    base.pelvis = [0.04, 0.86, 0.04];
    base.lean = 0.3;
  }
  const px = (def.contact.pelvis ?? base.pelvis!)[0];
  const pz = (def.contact.pelvis ?? base.pelvis!)[2];
  const stage = (s: PoseSpec, shift: V3 | null, k: number): Pose => {
    const spec: PoseSpec = { ...base, ...s, grip: addXZ(s.grip, px, pz) };
    if (shift && spec.grip) spec.grip = [spec.grip[0] + shift[0] * k, spec.grip[1] + shift[1] * k, spec.grip[2] + shift[2] * k];
    return makePose(spec, BACKLIFT);
  };
  // Move the bat so that the middle of the blade meets the ball.
  let shift: V3 | null = null;
  if (ballLocal && name !== 'leave') {
    const c = stage(def.contact, null, 0);
    const dl = Math.hypot(c[P.BDIR], c[P.BDIR + 1], c[P.BDIR + 2]) || 1;
    const sx = c[P.GRIP] + (c[P.BDIR] / dl) * 0.5;
    const sy = c[P.GRIP + 1] + (c[P.BDIR + 1] / dl) * 0.5;
    const sz = c[P.GRIP + 2] + (c[P.BDIR + 2] / dl) * 0.5;
    const cl = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    shift = [cl(ballLocal[0] - sx, 0.3), cl(ballLocal[1] - sy, 0.45), cl(ballLocal[2] - sz, 0.4)];
  }
  const contact = stage(def.contact, shift, 1);
  const follow = stage(def.follow, shift, 0.4);
  const finish = stage(def.finish, null, 0);
  if (lofted && name !== 'scoop') {
    // A lofted shot has a fuller swing and the batter leans back.
    contact[P.LEAN] -= 0.12;
    follow[P.LEAN] -= 0.16;
    finish[P.LEAN] -= 0.16;
    follow[P.GRIP + 1] += 0.1;
    finish[P.GRIP + 1] += 0.08;
  }
  const tc = Math.max(0.09, tContact);
  const tf = tc + (def.tFollow ?? 0.15);
  const tn = tc + (def.tFinish ?? 0.4);
  const keys: Key[] = [{ t: 0, pose: Float32Array.from(from) }];
  if (tc > 0.2) {
    // Early tap: hold the backlift, then swing down.
    const mid = makePose({}, from);
    for (let i = P.FOOTL; i < P.HANDL; i++) mid[i] = contact[i];
    for (let i = 0; i < 3; i++) mid[i] = (from[i] + contact[i]) / 2;
    keys.push({ t: tc - 0.14, pose: mid });
  }
  keys.push({ t: tc, pose: contact, ease: 'in' });
  const contactIndex = keys.length - 1;
  keys.push({ t: tf, pose: follow, ease: 'lin' });
  keys.push({ t: tn, pose: finish, ease: 'out' });
  keys.push({ t: tn + (def.hold ?? 0.35), pose: finish });
  return { keys, contactIndex };
}

/** Pose for a batter who missed: the swing goes through and stops low. */
export const DEJECTED = makePose({ pelvis: [0, 0.9, 0], lean: 0.35, headYaw: 0.2, headPitch: 0.5, grip: [0.05, 0.75, 0.25], batDir: [-0.2, -0.97, 0.1] }, STANCE);

// ---------- Running ----------

/** Run cycle. Phase advances by 2*PI for two steps. */
export function runPose(phase: number, out: Pose, bat: boolean, intensity = 1): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const k = intensity;
  out[P.PELVIS] = 0;
  out[P.PELVIS + 1] = 0.9 + 0.035 * Math.abs(c) * k;
  out[P.PELVIS + 2] = 0;
  out[P.PYAW] = 0;
  out[P.LEAN] = 0.12 + 0.2 * k;
  out[P.TWIST] = -s * 0.18 * k;
  out[P.SIDE] = 0;
  out[P.HYAW] = 0;
  out[P.HPITCH] = 0;
  out[P.FOOTL] = 0.09;
  out[P.FOOTL + 1] = Math.max(0, c) * 0.3 * k;
  out[P.FOOTL + 2] = s * 0.42 * k - 0.05;
  out[P.FOOTR] = -0.09;
  out[P.FOOTR + 1] = Math.max(0, -c) * 0.3 * k;
  out[P.FOOTR + 2] = -s * 0.42 * k - 0.05;
  out[P.FYAWL] = 0;
  out[P.FYAWR] = 0;
  out[P.HANDL] = 0.25;
  out[P.HANDL + 1] = 1.08 - s * 0.1 * k;
  out[P.HANDL + 2] = 0.1 - s * 0.3 * k;
  out[P.HANDR] = -0.25;
  out[P.HANDR + 1] = 1.08 + s * 0.1 * k;
  out[P.HANDR + 2] = 0.1 + s * 0.3 * k;
  out[P.BMODE] = bat ? 2 : 0;
  out[P.BDIR] = 0.1;
  out[P.BDIR + 1] = -0.45;
  out[P.BDIR + 2] = 0.9;
  out[P.BFACE] = 0;
  out[P.BFACE + 1] = 1;
  out[P.BFACE + 2] = 0.4;
  return out;
}

// ---------- Bowling ----------
// Bowling frame: +Z = toward the batter, +X = the bowler's left. Right-arm action.

const B_GATHER = makePose({
  pelvis: [0, 1.06, 0],
  pelvisYaw: -0.5,
  lean: 0.08,
  twist: -0.3,
  footL: [0.1, 0.38, 0.32],
  footR: [-0.1, 0.24, -0.28],
  handL: [0.12, 1.56, 0.3],
  handR: [-0.08, 1.36, 0.26],
});
const B_BACKFOOT = makePose({
  pelvis: [0, 0.93, 0.02],
  pelvisYaw: -1.1,
  lean: -0.14,
  twist: -0.25,
  headYaw: 1.1,
  footR: [-0.02, 0, -0.05],
  footYawR: -1.2,
  footL: [0.12, 0.42, 0.48],
  handL: [0.2, 1.98, 0.5],
  handR: [-0.22, 1.0, -0.2],
});
const B_FRONTFOOT = makePose({
  pelvis: [0.02, 0.9, 0.32],
  pelvisYaw: -0.7,
  lean: 0.02,
  twist: -0.35,
  headYaw: 0.8,
  footL: [0.14, 0, 0.88],
  footYawL: 0,
  footR: [-0.05, 0.06, -0.18],
  footYawR: -0.8,
  handL: [0.3, 1.36, 0.62],
  handR: [-0.26, 1.46, -0.44],
});
const B_RELEASE = makePose({
  pelvis: [0.04, 0.94, 0.6],
  pelvisYaw: 0,
  lean: 0.3,
  twist: 0.25,
  side: -0.25,
  headYaw: 0,
  footL: [0.14, 0, 0.9],
  footR: [-0.12, 0.26, 0.24],
  handL: [0.28, 0.95, 0.32],
  handR: [-0.2, 2.14, 0.8],
});
const B_FOLLOW = makePose({
  pelvis: [0.06, 0.88, 0.75],
  pelvisYaw: 0.3,
  lean: 0.7,
  twist: 0.75,
  side: 0,
  footL: [0.14, 0, 0.75],
  footR: [-0.1, 0.18, 1.2],
  handL: [0.34, 1.2, 0.2],
  handR: [0.26, 0.7, 0.9],
});
export const READY = makePose({
  pelvis: [0, 0.82, 0],
  lean: 0.5,
  footL: [0.24, 0, 0.02],
  footR: [-0.24, 0, 0.02],
  handL: [0.2, 0.6, 0.34],
  handR: [-0.2, 0.6, 0.34],
});
export const IDLE = makePose({});
export const HANDS_ON_HIPS = makePose({ handL: [0.24, 1.0, -0.02], handR: [-0.24, 1.0, -0.02] });

/** Delivery stride. Time is relative to the release (0). speed < 1 for spin bowlers. */
export function bowlTrack(runPoseAtStart: Pose, slow: number): Key[] {
  const k = slow;
  return [
    { t: -0.8 * k, pose: runPoseAtStart },
    { t: -0.55 * k, pose: B_GATHER, ease: 'out' },
    { t: -0.32 * k, pose: B_BACKFOOT },
    { t: -0.12 * k, pose: B_FRONTFOOT, ease: 'lin' },
    { t: 0, pose: B_RELEASE, ease: 'lin' },
    { t: 0.24, pose: B_FOLLOW, ease: 'out' },
  ];
}

// ---------- Fielding ----------

export const KEEPER_CROUCH = makePose({
  pelvis: [0, 0.46, -0.05],
  lean: 0.5,
  footL: [0.26, 0, 0.05],
  footR: [-0.26, 0, 0.05],
  footYawL: 0.4,
  footYawR: -0.4,
  handL: [0.07, 0.36, 0.4],
  handR: [-0.07, 0.36, 0.4],
});
export const KEEPER_READY = makePose({
  pelvis: [0, 0.74, 0],
  lean: 0.55,
  footL: [0.28, 0, 0.02],
  footR: [-0.28, 0, 0.02],
  handL: [0.08, 0.7, 0.42],
  handR: [-0.08, 0.7, 0.42],
});
export const PICKUP = makePose({
  pelvis: [0, 0.62, 0],
  lean: 1.15,
  footL: [0.2, 0, 0.25],
  footR: [-0.2, 0, -0.2],
  handL: [0.08, 0.14, 0.5],
  handR: [-0.08, 0.14, 0.5],
});
export const THROW_BACK = makePose({
  pelvis: [0, 0.9, 0],
  pelvisYaw: -0.6,
  twist: -0.5,
  lean: -0.05,
  footL: [0.12, 0, 0.45],
  footR: [-0.12, 0, -0.3],
  handL: [0.3, 1.4, 0.4],
  handR: [-0.38, 1.62, -0.35],
});
export const THROW_END = makePose({
  pelvis: [0.02, 0.88, 0.2],
  pelvisYaw: 0.3,
  twist: 0.6,
  lean: 0.5,
  footL: [0.12, 0, 0.45],
  footR: [-0.1, 0.12, 0.1],
  handL: [0.3, 1.0, -0.1],
  handR: [0.1, 1.05, 0.7],
});
export const CATCH_HIGH = makePose({
  pelvis: [0, 0.92, 0],
  lean: -0.08,
  headPitch: -0.4,
  handL: [0.07, 1.72, 0.26],
  handR: [-0.07, 1.72, 0.26],
});
export const CATCH_LOW = makePose({
  pelvis: [0, 0.66, 0],
  lean: 0.8,
  footL: [0.24, 0, 0.1],
  footR: [-0.24, 0, 0],
  handL: [0.07, 0.4, 0.5],
  handR: [-0.07, 0.4, 0.5],
});
export const DIVE = makePose({
  pelvis: [0.5, 0.36, 0.1],
  lean: 1.2,
  side: -0.9,
  footL: [-0.1, 0.1, -0.5],
  footR: [-0.45, 0.2, -0.6],
  handL: [1.25, 0.25, 0.4],
  handR: [1.0, 0.3, 0.45],
});
export const CELEBRATE = makePose({
  pelvis: [0, 0.98, 0],
  lean: -0.1,
  headPitch: -0.3,
  footL: [0.14, 0.06, 0],
  footR: [-0.14, 0.06, 0],
  handL: [0.38, 2.0, 0.05],
  handR: [-0.38, 2.0, 0.05],
});
export const CELEBRATE_2 = makePose({ pelvis: [0, 0.9, 0], handL: [0.3, 1.85, 0.1], handR: [-0.3, 1.85, 0.1], footL: [0.14, 0, 0], footR: [-0.14, 0, 0] }, CELEBRATE);
export const APPEAL = makePose({ pelvis: [0, 0.86, 0], lean: -0.1, handL: [0.3, 1.9, 0.2], handR: [-0.3, 1.9, 0.2], footL: [0.22, 0, 0], footR: [-0.22, 0, 0] });

// ---------- Non-striker ----------

export const NON_STRIKER = makePose({
  pelvis: [0, 0.92, 0],
  lean: 0.1,
  footL: [0.12, 0, 0.1],
  footR: [-0.12, 0, -0.08],
  handL: [0.26, 0.86, 0.05],
  handR: [-0.24, 0.8, 0.1],
  batDir: [-0.1, -0.95, 0.3],
  batFace: [0, 0.3, 1],
  batMode: 2,
});
export const NON_STRIKER_BACKUP = makePose({ pelvis: [0, 0.86, 0.1], lean: 0.3, footL: [0.12, 0, 0.35], footR: [-0.12, 0, -0.2], batDir: [-0.1, -0.8, -0.6] }, NON_STRIKER);

// ---------- Umpire ----------

export const UMP_IDLE = makePose({ handL: [0.14, 0.92, -0.14], handR: [-0.14, 0.92, -0.14], lean: 0.05 });
export const UMP_WATCH = makePose({ pelvis: [0, 0.88, 0], lean: 0.3, handL: [0.2, 0.62, 0.22], handR: [-0.2, 0.62, 0.22] });
const UMP_OUT = makePose({ handL: [0.22, 0.86, 0], handR: [-0.2, 2.02, 0.28], lean: 0 });
const UMP_SIX = makePose({ handL: [0.2, 2.02, 0.05], handR: [-0.2, 2.02, 0.05], lean: -0.04 });
const UMP_FOUR_A = makePose({ handL: [0.22, 0.86, 0], handR: [-0.72, 1.3, 0.2], twist: -0.2 });
const UMP_FOUR_B = makePose({ handL: [0.22, 0.86, 0], handR: [0.3, 1.3, 0.42], twist: 0.3 });
const UMP_WIDE = makePose({ handL: [0.74, 1.42, 0], handR: [-0.74, 1.42, 0] });
const UMP_NOBALL = makePose({ handL: [0.22, 0.86, 0], handR: [-0.74, 1.42, 0] });
const UMP_FREE_A = makePose({ handL: [0.22, 0.86, 0], handR: [-0.3, 2.0, 0.2] });
const UMP_FREE_B = makePose({ handL: [0.22, 0.86, 0], handR: [0.05, 2.0, 0.3] });
const UMP_FREE_C = makePose({ handL: [0.22, 0.86, 0], handR: [-0.12, 2.0, -0.05] });

export type Signal = 'out' | 'six' | 'four' | 'wide' | 'noball' | 'freehit';

export function signalTrack(sig: Signal, from: Pose): Key[] {
  const start: Key = { t: 0, pose: Float32Array.from(from) };
  switch (sig) {
    case 'out':
      return [start, { t: 0.45, pose: UMP_OUT }, { t: 2.0, pose: UMP_OUT }, { t: 2.5, pose: UMP_IDLE }];
    case 'six':
      return [start, { t: 0.4, pose: UMP_SIX }, { t: 1.9, pose: UMP_SIX }, { t: 2.4, pose: UMP_IDLE }];
    case 'four':
      return [
        start,
        { t: 0.3, pose: UMP_FOUR_A },
        { t: 0.65, pose: UMP_FOUR_B },
        { t: 1.0, pose: UMP_FOUR_A },
        { t: 1.35, pose: UMP_FOUR_B },
        { t: 1.7, pose: UMP_FOUR_A },
        { t: 2.2, pose: UMP_IDLE },
      ];
    case 'wide':
      return [start, { t: 0.4, pose: UMP_WIDE }, { t: 1.7, pose: UMP_WIDE }, { t: 2.2, pose: UMP_IDLE }];
    case 'noball':
      return [start, { t: 0.35, pose: UMP_NOBALL }, { t: 1.5, pose: UMP_NOBALL }, { t: 2.0, pose: UMP_IDLE }];
    case 'freehit':
      return [
        start,
        { t: 0.35, pose: UMP_FREE_A },
        { t: 0.6, pose: UMP_FREE_B, ease: 'lin' },
        { t: 0.85, pose: UMP_FREE_C, ease: 'lin' },
        { t: 1.1, pose: UMP_FREE_A, ease: 'lin' },
        { t: 1.35, pose: UMP_FREE_B, ease: 'lin' },
        { t: 1.6, pose: UMP_FREE_C, ease: 'lin' },
        { t: 2.1, pose: UMP_IDLE },
      ];
  }
}
