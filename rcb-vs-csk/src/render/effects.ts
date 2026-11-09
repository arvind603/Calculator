import * as THREE from 'three';
import { BAT_Z, IDEAL_TAP_DIST } from '../sim/field';
import type { Vec3 } from '../sim/types';
import { glowTexture } from './stadium';

const BALL_VISUAL_R = 0.062;
const TRAIL_N = 90;

/** Ball with seam, ground shadow, trail after the hit and bounce dust. */
export class BallFx {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Group;
  private shadow: THREE.Mesh;
  private trail: THREE.Points;
  private trailPos: Float32Array;
  private trailCol: Float32Array;
  private hist: number[] = [];
  private dust: THREE.Points;
  private dustVel: Float32Array;
  private dustLife: Float32Array;
  private flash: THREE.Sprite;
  private flashT = 1;
  private spin = new THREE.Vector3(1, 0, 0);
  trailOn = false;

  constructor() {
    const glow = glowTexture();
    this.mesh = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_VISUAL_R, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777 }));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(BALL_VISUAL_R * 1.005, 0.007, 4, 18), new THREE.MeshBasicMaterial({ color: 0x9b1c1c }));
    this.mesh.add(ball, seam);
    this.group.add(this.mesh);

    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d')!;
    const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    this.group.add(this.shadow);

    this.trailPos = new Float32Array(TRAIL_N * 3);
    this.trailCol = new Float32Array(TRAIL_N * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    this.trail = new THREE.Points(
      tg,
      new THREE.PointsMaterial({ size: 0.34, map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.trail.frustumCulled = false;
    this.group.add(this.trail);

    const DN = 28;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DN * 3), 3));
    this.dustVel = new Float32Array(DN * 3);
    this.dustLife = new Float32Array(DN);
    this.dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({ size: 0.24, map: glow, color: 0xd9c08a, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.group.add(this.flash);
  }

  setPosition(p: Vec3 | THREE.Vector3, dt: number, speedHint = 20) {
    this.mesh.position.set(p.x, Math.max(p.y, BALL_VISUAL_R * 0.6), p.z);
    this.mesh.rotateOnAxis(this.spin, dt * speedHint * 1.4);
    const h = Math.max(0, p.y);
    const s = 0.26 + h * 0.07;
    this.shadow.position.set(p.x, 0.02, p.z);
    this.shadow.scale.set(s, s, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.9 - h * 0.06);
  }

  setVisible(v: boolean) {
    this.mesh.visible = v;
    this.shadow.visible = v;
  }

  clearTrail() {
    this.hist.length = 0;
    this.trailCol.fill(0);
    (this.trail.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Adds the current ball position to the trail. Call once per frame. */
  updateTrail() {
    const p = this.mesh.position;
    if (this.trailOn) {
      this.hist.unshift(p.x, p.y, p.z);
      if (this.hist.length > 16 * 3) this.hist.length = 16 * 3;
    } else if (this.hist.length) this.hist.length = Math.max(0, this.hist.length - 6);
    const n = this.hist.length / 3;
    // Fill between the stored points so that the trail looks continuous.
    for (let i = 0; i < TRAIL_N; i++) {
      const f = n > 1 ? (i / (TRAIL_N - 1)) * (n - 1) : 0;
      const a = Math.floor(f);
      const b = Math.min(n - 1, a + 1);
      const k = f - a;
      if (n > 1) {
        for (let c = 0; c < 3; c++) this.trailPos[i * 3 + c] = this.hist[a * 3 + c] * (1 - k) + this.hist[b * 3 + c] * k;
        const fade = Math.pow(1 - i / TRAIL_N, 2) * 0.55;
        this.trailCol[i * 3] = fade;
        this.trailCol[i * 3 + 1] = fade * 0.92;
        this.trailCol[i * 3 + 2] = fade * 0.7;
      } else {
        this.trailCol[i * 3] = this.trailCol[i * 3 + 1] = this.trailCol[i * 3 + 2] = 0;
      }
    }
    this.trail.geometry.getAttribute('position').needsUpdate = true;
    this.trail.geometry.getAttribute('color').needsUpdate = true;
  }

  burstDust(pos: Vec3, strength = 1) {
    const arr = this.dust.geometry.getAttribute('position').array as Float32Array;
    for (let i = 0; i < this.dustLife.length; i++) {
      arr[i * 3] = pos.x;
      arr[i * 3 + 1] = 0.05;
      arr[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const v = (0.5 + Math.random() * 1.6) * strength;
      this.dustVel[i * 3] = Math.cos(a) * v;
      this.dustVel[i * 3 + 1] = 0.8 + Math.random() * 1.8 * strength;
      this.dustVel[i * 3 + 2] = Math.sin(a) * v;
      this.dustLife[i] = 0.35 + Math.random() * 0.3;
    }
    (this.dust.material as THREE.PointsMaterial).opacity = 0.85;
    this.dust.geometry.getAttribute('position').needsUpdate = true;
  }

  hitFlash(pos: Vec3, big: boolean) {
    this.flash.position.set(pos.x, pos.y, pos.z);
    this.flashT = 0;
    this.flash.userData.big = big;
  }

  update(dt: number) {
    const mat = this.dust.material as THREE.PointsMaterial;
    if (mat.opacity > 0) {
      const arr = this.dust.geometry.getAttribute('position').array as Float32Array;
      let alive = false;
      for (let i = 0; i < this.dustLife.length; i++) {
        if (this.dustLife[i] <= 0) continue;
        this.dustLife[i] -= dt;
        alive = true;
        this.dustVel[i * 3 + 1] -= 5 * dt;
        arr[i * 3] += this.dustVel[i * 3] * dt;
        arr[i * 3 + 1] = Math.max(0.03, arr[i * 3 + 1] + this.dustVel[i * 3 + 1] * dt);
        arr[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt;
      }
      mat.opacity = alive ? Math.max(0, mat.opacity - dt * 1.5) : 0;
      this.dust.geometry.getAttribute('position').needsUpdate = true;
    }
    if (this.flashT < 1) {
      this.flashT = Math.min(1, this.flashT + dt * 5);
      const s = (this.flash.userData.big ? 2.6 : 1.5) * (0.4 + this.flashT);
      this.flash.scale.set(s, s, 1);
      (this.flash.material as THREE.SpriteMaterial).opacity = (1 - this.flashT) * 0.9;
    }
  }
}

/** Timing zone on the pitch. It lights up when the ball is in it. */
export class TimingZone {
  readonly mesh: THREE.Mesh;
  private edge: THREE.LineSegments;
  private mat: THREE.MeshBasicMaterial;
  private edgeMat: THREE.LineBasicMaterial;
  private lit = 0;

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.16, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, 0.012, BAT_Z + IDEAL_TAP_DIST);
    this.mesh.renderOrder = 1;
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.85 });
    this.edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.7, 1)), this.edgeMat);
    this.mesh.add(this.edge);
  }

  setHalfWidth(w: number) {
    this.mesh.scale.set(1, w * 2, 1);
  }

  update(dt: number, visible: boolean, inZone: boolean) {
    this.mesh.visible = visible;
    this.lit = inZone ? 1 : Math.max(0, this.lit - dt * 5);
    const l = this.lit;
    this.mat.color.setRGB(1 - 0.75 * l, 0.83 + 0.17 * l, 0.3 + 0.2 * l);
    this.mat.opacity = 0.14 + 0.6 * l;
    this.edgeMat.color.setRGB(1 - 0.6 * l, 0.92 + 0.08 * l, 0.64);
  }
}

/** Marker for the bowling target. */
export class TargetMarker {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private t = 0;

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.3, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
    );
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), new THREE.MeshBasicMaterial({ color: 0xff3b3b, depthWrite: false }));
    const spread = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
    );
    spread.name = 'spread';
    this.group.add(this.ring, dot, spread);
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.02;
    this.group.renderOrder = 3;
    this.group.visible = false;
  }

  set(x: number, z: number) {
    this.group.position.x = x;
    this.group.position.z = z;
  }

  /** Radius of the error circle (m). */
  setSpread(r: number) {
    const s = this.group.getObjectByName('spread')!;
    s.scale.set(Math.max(0.12, r * 0.55), Math.max(0.3, r * 2.4), 1);
  }

  update(dt: number) {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 6) * 0.08;
    this.ring.scale.set(s, s, 1);
  }
}
