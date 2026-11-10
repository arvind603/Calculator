import * as THREE from 'three';

// An articulated player made from simple shapes. A pose gives the positions of the pelvis,
// feet and hands (or the bat). Arms and legs are solved with two-bone inverse kinematics.
//
// Figure-local axes: +Z = forward (chest direction), +Y = up, +X = the figure's left.
// A mirrored figure (left-hander or left-arm bowler) uses scale.x = -1.

export const P = {
  PELVIS: 0,
  PYAW: 3,
  LEAN: 4,
  TWIST: 5,
  SIDE: 6,
  HYAW: 7,
  HPITCH: 8,
  FOOTL: 9,
  FOOTR: 12,
  FYAWL: 15,
  FYAWR: 16,
  HANDL: 17,
  HANDR: 20,
  GRIP: 23,
  BDIR: 26,
  BFACE: 29,
  BMODE: 32,
  SIZE: 33,
} as const;

export type Pose = Float32Array;
type V3 = [number, number, number];

export interface PoseSpec {
  pelvis?: V3;
  pelvisYaw?: number;
  lean?: number;
  twist?: number;
  side?: number;
  headYaw?: number;
  headPitch?: number;
  footL?: V3;
  footR?: V3;
  footYawL?: number;
  footYawR?: number;
  handL?: V3;
  handR?: V3;
  grip?: V3;
  batDir?: V3;
  batFace?: V3;
  /** 0 = no bat, 1 = two hands on the bat, 2 = bat in the right hand. */
  batMode?: number;
}

const DEFAULT: PoseSpec = {
  pelvis: [0, 0.94, 0],
  pelvisYaw: 0,
  lean: 0.04,
  twist: 0,
  side: 0,
  headYaw: 0,
  headPitch: 0,
  footL: [0.11, 0, 0.02],
  footR: [-0.11, 0, 0.02],
  footYawL: 0.12,
  footYawR: -0.12,
  handL: [0.25, 0.84, 0.06],
  handR: [-0.25, 0.84, 0.06],
  grip: [0, 0.8, 0.25],
  batDir: [0, -1, 0],
  batFace: [1, 0, 0],
  batMode: 0,
};

function put(out: Pose, i: number, v: V3 | undefined) {
  if (!v) return;
  out[i] = v[0];
  out[i + 1] = v[1];
  out[i + 2] = v[2];
}

export function makePose(spec: PoseSpec, base?: Pose): Pose {
  const out = new Float32Array(P.SIZE);
  if (base) out.set(base);
  else writeSpec(out, DEFAULT);
  writeSpec(out, spec);
  return out;
}

function writeSpec(out: Pose, s: PoseSpec) {
  put(out, P.PELVIS, s.pelvis);
  if (s.pelvisYaw !== undefined) out[P.PYAW] = s.pelvisYaw;
  if (s.lean !== undefined) out[P.LEAN] = s.lean;
  if (s.twist !== undefined) out[P.TWIST] = s.twist;
  if (s.side !== undefined) out[P.SIDE] = s.side;
  if (s.headYaw !== undefined) out[P.HYAW] = s.headYaw;
  if (s.headPitch !== undefined) out[P.HPITCH] = s.headPitch;
  put(out, P.FOOTL, s.footL);
  put(out, P.FOOTR, s.footR);
  if (s.footYawL !== undefined) out[P.FYAWL] = s.footYawL;
  if (s.footYawR !== undefined) out[P.FYAWR] = s.footYawR;
  put(out, P.HANDL, s.handL);
  put(out, P.HANDR, s.handR);
  put(out, P.GRIP, s.grip);
  put(out, P.BDIR, s.batDir);
  put(out, P.BFACE, s.batFace);
  if (s.batMode !== undefined) out[P.BMODE] = s.batMode;
}

export function mixPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  const u = 1 - t;
  for (let i = 0; i < P.BMODE; i++) out[i] = a[i] * u + b[i] * t;
  out[P.BMODE] = t < 0.5 ? a[P.BMODE] : b[P.BMODE];
  return out;
}

export const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export interface Key {
  t: number;
  pose: Pose;
  /** 'lin' = linear, default = smooth. */
  ease?: 'lin' | 'in' | 'out';
}

/** Samples a keyframe track at time t. */
export function sampleTrack(keys: Key[], t: number, out: Pose): Pose {
  if (t <= keys[0].t) return out.set(keys[0].pose), out;
  const last = keys[keys.length - 1];
  if (t >= last.t) return out.set(last.pose), out;
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  let k = (t - a.t) / (b.t - a.t);
  if (b.ease === 'in') k = k * k;
  else if (b.ease === 'out') k = 1 - (1 - k) * (1 - k);
  else if (b.ease !== 'lin') k = smooth(k);
  return mixPose(a.pose, b.pose, k, out);
}

// ---------- Kits ----------

export interface Kit {
  shirt: number;
  yoke: number;
  trim: number;
  trousers: number;
  helmet: number;
  pads: number;
  cap: number;
}

export const KITS: Record<'RCB' | 'CSK' | 'UMP', Kit> = {
  RCB: { shirt: 0xc8102e, yoke: 0x15151a, trim: 0xd4af37, trousers: 0x17171c, helmet: 0x15151a, pads: 0xc8102e, cap: 0x15151a },
  CSK: { shirt: 0xf9cd05, yoke: 0x1d4fa3, trim: 0x1d4fa3, trousers: 0xf9cd05, helmet: 0x1d4fa3, pads: 0xf9cd05, cap: 0xf9cd05 },
  UMP: { shirt: 0x7fb6d9, yoke: 0x7fb6d9, trim: 0x222222, trousers: 0x1b1b1f, helmet: 0xf2f2ee, pads: 0xffffff, cap: 0xf2f2ee },
};

export type Gear = 'batter' | 'keeper' | 'fielder' | 'bowler' | 'umpire';

const SKINS = [0xe0ac69, 0xc68642, 0x8d5524, 0xf1c27d, 0xb97a4a, 0xa9683a];

// ---------- Shared geometry and materials ----------

const geo = {
  seg: (() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
    g.translate(0, 0.5, 0);
    return g;
  })(),
  joint: new THREE.SphereGeometry(1, 8, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  head: new THREE.SphereGeometry(0.105, 12, 10),
  dome: new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
  torso: (() => {
    const g = new THREE.CylinderGeometry(0.2, 0.155, 0.44, 12, 1);
    g.translate(0, 0.22, 0);
    g.scale(1, 1, 0.6);
    return g;
  })(),
  yoke: (() => {
    const g = new THREE.CylinderGeometry(0.165, 0.203, 0.13, 12, 1);
    g.translate(0, 0.385, 0);
    g.scale(1, 1, 0.62);
    return g;
  })(),
  hips: (() => {
    const g = new THREE.CylinderGeometry(0.16, 0.15, 0.2, 12, 1);
    g.scale(1, 1, 0.68);
    return g;
  })(),
  bar: new THREE.TorusGeometry(0.118, 0.0055, 4, 10, Math.PI * 0.95),
  brim: new THREE.CylinderGeometry(0.19, 0.19, 0.012, 14),
  shadow: new THREE.PlaneGeometry(1, 1),
};

const matCache = new Map<string, THREE.Material>();
function lambert(color: number): THREE.MeshLambertMaterial {
  const k = `l${color}`;
  let m = matCache.get(k) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(k, m);
  }
  return m;
}

let shadowTex: THREE.Texture | null = null;
function getShadowTex(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // Floodlights from four towers give four soft shadows in an X shape.
  g.translate(64, 64);
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate(Math.PI / 4 + (i * Math.PI) / 2);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 60);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.scale(1, 0.26);
    g.beginPath();
    g.arc(26, 0, 60, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 22);
  core.addColorStop(0, 'rgba(0,0,0,0.55)');
  core.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, 22, 0, Math.PI * 2);
  g.fill();
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

function numberTexture(num: number, name: string, color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.font = '700 22px system-ui, Arial, sans-serif';
  g.fillText(name.toUpperCase().slice(0, 11), 64, 26, 120);
  g.font = '800 82px system-ui, Arial, sans-serif';
  g.fillText(String(num), 64, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Bat ----------

export function makeBat(gripColor: number): THREE.Group {
  const g = new THREE.Group();
  const wood = lambert(0xe6d2a2);
  const blade = new THREE.Mesh(geo.box, wood);
  blade.scale.set(0.108, 0.56, 0.04);
  blade.position.set(0, -0.45, 0);
  const spine = new THREE.Mesh(geo.box, lambert(0xd4bc86));
  spine.scale.set(0.05, 0.44, 0.03);
  spine.position.set(0, -0.47, -0.03);
  const handle = new THREE.Mesh(geo.seg, lambert(gripColor));
  handle.scale.set(0.017, 0.3, 0.017);
  handle.position.set(0, -0.17, 0);
  g.add(blade, spine, handle);
  return g;
}

// ---------- Figure ----------

const UPPER_ARM = 0.3;
const FORE_ARM = 0.27;
const THIGH = 0.44;
const SHIN = 0.44;
const ANKLE = 0.07;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

function solve(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, elbow: THREE.Vector3, end: THREE.Vector3) {
  _d.subVectors(target, a);
  let d = _d.length();
  const max = l1 + l2 - 0.002;
  if (d < 1e-4) {
    _d.set(0, -1, 0);
    d = 1e-4;
  }
  _d.multiplyScalar(1 / d);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), max);
  end.copy(a).addScaledVector(_d, d);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _e.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_e.lengthSq() < 1e-6) _e.set(0, 0, 1);
  _e.normalize();
  elbow.copy(a).addScaledVector(_d, x).addScaledVector(_e, h);
}

function setSeg(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r1: number, r2 = r1) {
  _d.subVectors(b, a);
  const len = Math.max(_d.length(), 1e-4);
  _d.multiplyScalar(1 / len);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, _d);
  mesh.scale.set(r1, len, r2);
}

export interface FigureOptions {
  gear: Gear;
  kit: Kit;
  seed?: number;
  number?: number;
  name?: string;
  /** Slow-arm spinners and umpires wear a hat. */
  hat?: boolean;
}

export class Figure {
  readonly root = new THREE.Group();
  readonly pose: Pose = makePose({});
  readonly gear: Gear;
  /** World position of the right hand after update() (for the ball). */
  readonly handRWorld = new THREE.Vector3();
  readonly handLWorld = new THREE.Vector3();
  bat: THREE.Group | null = null;

  private pelvisG = new THREE.Group();
  private chestG = new THREE.Group();
  private headG = new THREE.Group();
  private armU: THREE.Mesh[] = [];
  private armF: THREE.Mesh[] = [];
  private elbowJ: THREE.Mesh[] = [];
  private hand: THREE.Mesh[] = [];
  private thigh: THREE.Mesh[] = [];
  private kneeJ: THREE.Mesh[] = [];
  private shinG: THREE.Group[] = [];
  private shin: THREE.Mesh[] = [];
  private foot: THREE.Mesh[] = [];
  private shadow: THREE.Mesh;
  private sh = [new THREE.Vector3(), new THREE.Vector3()];
  private hip = [new THREE.Vector3(), new THREE.Vector3()];
  private el = [new THREE.Vector3(), new THREE.Vector3()];
  private hd = [new THREE.Vector3(), new THREE.Vector3()];
  private kn = [new THREE.Vector3(), new THREE.Vector3()];
  private an = [new THREE.Vector3(), new THREE.Vector3()];
  private label: THREE.Mesh | null = null;
  private skinMat: THREE.MeshLambertMaterial;

  constructor(opt: FigureOptions) {
    this.gear = opt.gear;
    const kit = opt.kit;
    const skin = SKINS[(opt.seed ?? 0) % SKINS.length];
    this.skinMat = lambert(skin);
    const shirt = lambert(kit.shirt);
    const yoke = lambert(kit.yoke);
    const trousers = lambert(kit.trousers);
    const shoe = lambert(0xf2f2f2);
    const padded = opt.gear === 'batter' || opt.gear === 'keeper';

    this.root.add(this.pelvisG);
    this.pelvisG.add(this.chestG);
    this.chestG.position.set(0, 0.1, 0);
    this.chestG.rotation.order = 'XYZ';
    this.chestG.add(this.headG);
    this.headG.position.set(0, 0.47, 0);
    this.headG.rotation.order = 'YXZ';

    const hips = new THREE.Mesh(geo.hips, trousers);
    hips.position.y = 0.02;
    this.pelvisG.add(hips);
    const torso = new THREE.Mesh(geo.torso, shirt);
    const yk = new THREE.Mesh(geo.yoke, yoke);
    this.chestG.add(torso, yk);
    const band = new THREE.Mesh(geo.torso, lambert(kit.trim));
    band.scale.set(1.012, 0.05, 1.012);
    band.position.y = 0.3;
    this.chestG.add(band);
    for (const s of [1, -1]) {
      const cap = new THREE.Mesh(geo.joint, yoke);
      cap.scale.set(0.066, 0.06, 0.066);
      cap.position.set(0.19 * s, 0.4, 0);
      this.chestG.add(cap);
    }

    // Head.
    const neck = new THREE.Mesh(geo.seg, this.skinMat);
    neck.scale.set(0.045, 0.1, 0.045);
    neck.position.y = -0.03;
    const head = new THREE.Mesh(geo.head, this.skinMat);
    head.position.y = 0.13;
    head.scale.set(0.92, 1.05, 1);
    this.headG.add(neck, head);
    this.buildHeadgear(opt, kit);

    // Limbs.
    const sleeve = lambert(kit.yoke);
    const gloveMat = lambert(opt.gear === 'keeper' ? kit.trim : 0xf4f4f4);
    for (let i = 0; i < 2; i++) {
      const u = new THREE.Mesh(geo.seg, sleeve);
      const f = new THREE.Mesh(geo.seg, this.skinMat);
      const ej = new THREE.Mesh(geo.joint, this.skinMat);
      ej.scale.setScalar(0.043);
      const h = new THREE.Mesh(padded ? geo.box : geo.joint, padded ? gloveMat : this.skinMat);
      const th = new THREE.Mesh(geo.seg, trousers);
      const kj = new THREE.Mesh(geo.joint, trousers);
      kj.scale.setScalar(0.068);
      const sg = new THREE.Group();
      const sn = new THREE.Mesh(geo.seg, trousers);
      sg.add(sn);
      if (padded) {
        const pad = new THREE.Mesh(geo.box, lambert(opt.gear === 'keeper' ? 0xf4f4f4 : kit.pads));
        pad.scale.set(0.15, 0.6, 0.075);
        pad.position.set(0, 0.17, 0.07);
        const roll = new THREE.Mesh(geo.box, lambert(0xf4f4f4));
        roll.scale.set(0.155, 0.1, 0.085);
        roll.position.set(0, -0.02, 0.075);
        const strap = new THREE.Mesh(geo.box, lambert(kit.trim));
        strap.scale.set(0.156, 0.03, 0.08);
        strap.position.set(0, 0.26, 0.07);
        sg.add(pad, roll, strap);
      }
      const ft = new THREE.Mesh(geo.box, shoe);
      this.armU.push(u);
      this.armF.push(f);
      this.elbowJ.push(ej);
      this.hand.push(h);
      this.thigh.push(th);
      this.kneeJ.push(kj);
      this.shinG.push(sg);
      this.shin.push(sn);
      this.foot.push(ft);
      this.root.add(u, f, ej, h, th, kj, sg, ft);
    }

    if (opt.gear === 'batter') {
      this.bat = makeBat(kit.trim);
      this.root.add(this.bat);
    }

    if (opt.number !== undefined) {
      const tex = numberTexture(opt.number, opt.name ?? '', kit.shirt === 0xf9cd05 ? '#1d4fa3' : '#f4f4f4');
      const lab = new THREE.Mesh(geo.shadow, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      lab.scale.set(0.3, 0.3, 1);
      lab.position.set(0, 0.2, -0.128);
      lab.rotation.y = Math.PI;
      this.chestG.add(lab);
      this.label = lab;
    }

    this.shadow = new THREE.Mesh(
      geo.shadow,
      new THREE.MeshBasicMaterial({ map: getShadowTex(), transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(2.6, 2.6, 1);
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
  }

  private buildHeadgear(opt: FigureOptions, kit: Kit) {
    const helmeted = opt.gear === 'batter' || opt.gear === 'keeper';
    if (helmeted) {
      const hm = lambert(kit.helmet);
      const dome = new THREE.Mesh(geo.dome, hm);
      dome.position.y = 0.135;
      const back = new THREE.Mesh(geo.joint, hm);
      back.scale.set(0.122, 0.1, 0.1);
      back.position.set(0, 0.1, -0.04);
      const peak = new THREE.Mesh(geo.box, hm);
      peak.scale.set(0.2, 0.014, 0.1);
      peak.position.set(0, 0.165, 0.135);
      peak.rotation.x = 0.12;
      const stripe = new THREE.Mesh(geo.box, lambert(kit.trim));
      stripe.scale.set(0.03, 0.012, 0.25);
      stripe.position.set(0, 0.262, 0);
      this.headG.add(dome, back, peak, stripe);
      // Grille: three horizontal bars and two uprights in front of the face.
      const steel = lambert(0xbfc5cc);
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(geo.bar, steel);
        bar.rotation.x = Math.PI / 2;
        bar.rotation.z = Math.PI * 0.025;
        bar.position.set(0, 0.13 - i * 0.04, 0.012);
        bar.scale.set(1, 1.02 - i * 0.05, 1);
        this.headG.add(bar);
      }
      for (const s of [1, -1]) {
        const up = new THREE.Mesh(geo.box, steel);
        up.scale.set(0.008, 0.11, 0.008);
        up.position.set(0.04 * s, 0.092, 0.122);
        this.headG.add(up);
      }
    } else if (opt.gear === 'bowler') {
      const hair = new THREE.Mesh(geo.dome, lambert(0x16120f));
      hair.position.y = 0.14;
      hair.scale.set(0.88, 0.84, 0.9);
      const band = new THREE.Mesh(geo.bar, lambert(kit.trim));
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.185, 0.0);
      band.scale.set(0.86, 0.86, 2.4);
      this.headG.add(hair, band);
    } else if (opt.hat) {
      const hm = lambert(kit.cap);
      const dome = new THREE.Mesh(geo.dome, hm);
      dome.position.y = 0.15;
      dome.scale.set(0.95, 0.8, 0.95);
      const brim = new THREE.Mesh(geo.brim, hm);
      brim.position.y = 0.185;
      this.headG.add(dome, brim);
    } else {
      const hm = lambert(kit.cap);
      const dome = new THREE.Mesh(geo.dome, hm);
      dome.position.y = 0.145;
      dome.scale.set(0.9, 0.82, 0.92);
      const peak = new THREE.Mesh(geo.box, hm);
      peak.scale.set(0.15, 0.012, 0.1);
      peak.position.set(0, 0.17, 0.13);
      this.headG.add(dome, peak);
    }
  }

  setMirror(m: boolean) {
    this.root.scale.x = m ? -1 : 1;
    // The back number must not be mirrored.
    if (this.label) this.label.scale.x = m ? -0.3 : 0.3;
  }

  get mirrored(): boolean {
    return this.root.scale.x < 0;
  }

  setVisible(v: boolean) {
    this.root.visible = v;
  }

  /** Applies the pose to the meshes. */
  update() {
    const p = this.pose;
    const yaw = p[P.PYAW];
    this.pelvisG.position.set(p[0], p[1], p[2]);
    this.pelvisG.rotation.set(0, yaw, 0);
    this.chestG.rotation.set(p[P.LEAN], p[P.TWIST], p[P.SIDE]);
    // Keep the eyes level when the body leans.
    const hy = p[P.HYAW];
    const ln = p[P.LEAN] * 0.85;
    this.headG.rotation.set(p[P.HPITCH] - ln * Math.cos(hy), hy, -ln * Math.sin(hy));
    this.pelvisG.updateMatrix();
    this.chestG.updateMatrix();
    _m.multiplyMatrices(this.pelvisG.matrix, this.chestG.matrix);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    const mode = p[P.BMODE];
    // Bat axis and face.
    _y.set(p[P.BDIR], p[P.BDIR + 1], p[P.BDIR + 2]);
    if (_y.lengthSq() < 1e-6) _y.set(0, -1, 0);
    _y.normalize();

    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      this.sh[i].set(0.19 * s, 0.4, 0).applyMatrix4(_m);
      this.hip[i].set(0.09 * s, -0.03, 0).applyMatrix4(this.pelvisG.matrix);
      // Hand target.
      if (mode >= 0.5 && mode < 1.5) {
        _a.set(p[P.GRIP], p[P.GRIP + 1], p[P.GRIP + 2]).addScaledVector(_y, i === 0 ? -0.065 : 0.06);
      } else {
        const o = i === 0 ? P.HANDL : P.HANDR;
        _a.set(p[o], p[o + 1], p[o + 2]);
      }
      // Elbows point down and out from the body.
      _pole.set(s * 0.55 * cy - 0.25 * sy, -0.8, -s * 0.55 * sy - 0.25 * cy);
      solve(this.sh[i], _a, UPPER_ARM, FORE_ARM, _pole, this.el[i], this.hd[i]);
      setSeg(this.armU[i], this.sh[i], this.el[i], 0.05, 0.05);
      setSeg(this.armF[i], this.el[i], this.hd[i], 0.04, 0.04);
      this.elbowJ[i].position.copy(this.el[i]);
      const h = this.hand[i];
      _d.subVectors(this.hd[i], this.el[i]).normalize();
      h.position.copy(this.hd[i]).addScaledVector(_d, 0.045);
      h.quaternion.setFromUnitVectors(Y_AXIS, _d);
      if (this.gear === 'batter') h.scale.set(0.085, 0.12, 0.075);
      else if (this.gear === 'keeper') h.scale.set(0.12, 0.15, 0.06);
      else h.scale.set(0.045, 0.055, 0.04);

      // Legs.
      const fo = i === 0 ? P.FOOTL : P.FOOTR;
      const fy = yaw * 0.5 + (i === 0 ? p[P.FYAWL] : p[P.FYAWR]);
      _b.set(p[fo], p[fo + 1] + ANKLE, p[fo + 2]);
      _pole.set(Math.sin(fy) + s * 0.12, 0.1, Math.cos(fy));
      solve(this.hip[i], _b, THIGH, SHIN, _pole, this.kn[i], this.an[i]);
      setSeg(this.thigh[i], this.hip[i], this.kn[i], 0.082, 0.082);
      this.kneeJ[i].position.copy(this.kn[i]);
      // Shin group with a full basis so that the pad faces forward.
      _y.subVectors(this.an[i], this.kn[i]);
      const sl = Math.max(_y.length(), 1e-4);
      _y.multiplyScalar(1 / sl);
      _z.set(Math.sin(fy), 0, Math.cos(fy));
      _z.addScaledVector(_y, -_z.dot(_y)).normalize();
      _x.crossVectors(_y, _z);
      _m2.makeBasis(_x, _y, _z);
      const sg = this.shinG[i];
      sg.position.copy(this.kn[i]);
      sg.quaternion.setFromRotationMatrix(_m2);
      this.shin[i].scale.set(0.058, sl, 0.058);
      const ft = this.foot[i];
      ft.scale.set(0.1, 0.075, 0.27);
      ft.position.set(this.an[i].x + Math.sin(fy) * 0.07, Math.max(0.038, this.an[i].y - 0.035), this.an[i].z + Math.cos(fy) * 0.07);
      ft.rotation.set(0, fy, 0);
      // Restore the bat axis: it is used again after the loop.
      _y.set(p[P.BDIR], p[P.BDIR + 1], p[P.BDIR + 2]).normalize();
    }

    if (this.bat) {
      this.bat.visible = mode >= 0.5;
      if (mode >= 0.5) {
        if (mode < 1.5) this.bat.position.set(p[P.GRIP], p[P.GRIP + 1], p[P.GRIP + 2]);
        else this.bat.position.copy(this.hd[1]);
        // Bat local -Y points to the toe. Local +Z is the face.
        _c.copy(_y).multiplyScalar(-1);
        _z.set(p[P.BFACE], p[P.BFACE + 1], p[P.BFACE + 2]);
        _z.addScaledVector(_c, -_z.dot(_c));
        if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_c, -_c.z);
        _z.normalize();
        _x.crossVectors(_c, _z);
        _m2.makeBasis(_x, _c, _z);
        this.bat.quaternion.setFromRotationMatrix(_m2);
      }
    }

    this.shadow.position.set(p[0], 0.012 - this.root.position.y, p[2]);
    this.root.updateMatrixWorld(true);
    this.handRWorld.copy(this.hd[1]).applyMatrix4(this.root.matrixWorld);
    this.handLWorld.copy(this.hd[0]).applyMatrix4(this.root.matrixWorld);
  }

  /** World position of the middle of the bat blade. */
  batSweetSpot(out: THREE.Vector3): THREE.Vector3 {
    if (!this.bat) return out.copy(this.handRWorld);
    return out.set(0, -0.5, 0).applyMatrix4(this.bat.matrixWorld);
  }
}
