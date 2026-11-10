import * as THREE from 'three';
import { BOUNDARY_R, RING_R, STUMPS_Z, STUMP_H } from '../sim/field';

// Night stadium: ground, pitch, rope, boards, stands with crowd, floodlights and sky.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function groundTexture(): THREE.Texture {
  const S = 2048;
  const R = 96; // metres from the centre to the texture edge
  const [c, g] = canvas(S, S);
  const m = S / (2 * R);
  g.fillStyle = '#1d6b2a';
  g.fillRect(0, 0, S, S);
  // Mowing stripes.
  const stripe = 6 * m;
  for (let i = 0; i * stripe < S; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
    g.fillRect(0, i * stripe, S, stripe);
  }
  for (let i = 0; i * stripe * 2 < S; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
    g.fillRect(i * stripe * 2, 0, stripe * 2, S);
  }
  // Grass noise.
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  // Floodlight pools: brighter in the middle, darker toward the stands.
  const pool = g.createRadialGradient(S / 2, S / 2, 20 * m, S / 2, S / 2, R * m);
  pool.addColorStop(0, 'rgba(255,255,220,0.12)');
  pool.addColorStop(0.6, 'rgba(0,0,0,0)');
  pool.addColorStop(1, 'rgba(0,0,10,0.5)');
  g.fillStyle = pool;
  g.fillRect(0, 0, S, S);
  // Beyond the rope: darker apron.
  g.fillStyle = 'rgba(0,10,0,0.28)';
  g.beginPath();
  g.rect(0, 0, S, S);
  g.arc(S / 2, S / 2, (BOUNDARY_R + 0.3) * m, 0, Math.PI * 2, true);
  g.fill('evenodd');
  // 30-yard circle (dashes). Texture v is world -z after the plane is rotated.
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 0.22 * m;
  g.setLineDash([1.2 * m, 2.4 * m]);
  g.beginPath();
  const cx = S / 2;
  const top = S / 2 - STUMPS_Z * m;
  const bot = S / 2 + STUMPS_Z * m;
  g.arc(cx, top, RING_R * m, Math.PI, 0);
  g.lineTo(cx + RING_R * m, bot);
  g.arc(cx, bot, RING_R * m, 0, Math.PI);
  g.closePath();
  g.stroke();
  g.setLineDash([]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function pitchTexture(): THREE.Texture {
  // 3.66 m x 24 m at 64 px per metre.
  const W = 234;
  const H = 1536;
  const [c, g] = canvas(W, H);
  const m = 64;
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#b79a63');
  grd.addColorStop(0.5, '#cdb27a');
  grd.addColorStop(1, '#b79a63');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,200,0.06)' : 'rgba(80,50,20,0.07)';
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  // Worn areas on a good length at both ends.
  for (const zc of [H / 2 - 4.5 * m, H / 2 + 4.5 * m]) {
    const wr = g.createRadialGradient(W / 2, zc, 4, W / 2, zc, 150);
    wr.addColorStop(0, 'rgba(110,80,40,0.28)');
    wr.addColorStop(1, 'rgba(110,80,40,0)');
    g.fillStyle = wr;
    g.fillRect(0, zc - 170, W, 340);
  }
  // Creases.
  g.strokeStyle = '#f6f6f0';
  g.lineWidth = 3.4;
  const mid = H / 2;
  for (const s of [1, -1]) {
    const bowl = mid + s * STUMPS_Z * m;
    const pop = mid + s * (STUMPS_Z - 1.22) * m;
    g.beginPath();
    g.moveTo(W / 2 - 1.32 * m, bowl);
    g.lineTo(W / 2 + 1.32 * m, bowl);
    g.moveTo(0, pop);
    g.lineTo(W, pop);
    for (const x of [W / 2 - 1.32 * m, W / 2 + 1.32 * m]) {
      g.moveTo(x, pop);
      g.lineTo(x, bowl + s * 1.2 * m);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function crowdTexture(): THREE.Texture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#0b0d16';
  g.fillRect(0, 0, W, H);
  const colors = ['#c8102e', '#e23b4e', '#f9cd05', '#ffe36a', '#f2f2f2', '#d9a877', '#8d5a3a', '#1d4fa3', '#222831', '#b0b6c0'];
  const rows = 26;
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * (H / rows);
    // Row shading: seats.
    g.fillStyle = r % 2 ? '#141826' : '#10131f';
    g.fillRect(0, y - H / rows / 2, W, H / rows);
    for (let x = 0; x < W; x += 6) {
      if (Math.random() < 0.1) continue;
      const jx = x + Math.random() * 3;
      // A block of fans in the same colour appears now and then.
      const block = Math.floor(x / 64 + r / 9) % 3;
      const pick = Math.random() < 0.55 ? (block === 0 ? 0 : block === 1 ? 2 : 4) + (Math.random() < 0.3 ? 1 : 0) : Math.floor(Math.random() * colors.length);
      g.fillStyle = colors[pick];
      g.fillRect(jx, y - 1, 3.4, 4.4);
      g.fillStyle = Math.random() < 0.5 ? '#d9a877' : '#8d5a3a';
      g.fillRect(jx + 0.6, y - 3.6, 2.2, 2.4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(26, 1);
  t.anisotropy = 4;
  return t;
}

function boardTexture(): THREE.Texture {
  const W = 1024;
  const H = 32;
  const [c, g] = canvas(W, H);
  const blocks = ['#c8102e', '#15151a', '#f9cd05', '#1d4fa3', '#d4af37', '#15151a'];
  const words = ['BENGALURU', 'T20 NIGHT', 'CHENNAI', 'SIX!', 'HOWZAT', 'FOUR!'];
  const bw = W / blocks.length;
  blocks.forEach((b, i) => {
    g.fillStyle = b;
    g.fillRect(i * bw, 0, bw, H);
    g.fillStyle = b === '#f9cd05' || b === '#d4af37' ? '#15151a' : '#f4f4f4';
    g.font = '800 20px system-ui, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(words[i], i * bw + bw / 2, H / 2 + 1);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  // The boards are seen from inside the cylinder, so the texture is flipped.
  t.repeat.set(-6, 1);
  return t;
}

function glowTexture(): THREE.Texture {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,250,225,0.75)');
  gr.addColorStop(0.45, 'rgba(200,220,255,0.18)');
  gr.addColorStop(1, 'rgba(180,200,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function lampTexture(): THREE.Texture {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#20242c';
  g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 8; x++) {
      const gr = g.createRadialGradient(x * 16 + 8, y * 16 + 8, 0, x * 16 + 8, y * 16 + 8, 7);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.6, '#fff6d0');
      gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr;
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Stumps {
  readonly group = new THREE.Group();
  private stumps: THREE.Mesh[] = [];
  private bails: THREE.Mesh[] = [];
  private vel: THREE.Vector3[] = [];
  private spin: THREE.Vector3[] = [];
  private broken = false;
  private t = 0;
  private mat: THREE.MeshLambertMaterial;

  constructor(z: number) {
    this.mat = new THREE.MeshLambertMaterial({ color: 0xf1e7c8, emissive: 0x000000 });
    const sg = new THREE.CylinderGeometry(0.019, 0.019, STUMP_H, 8);
    sg.translate(0, STUMP_H / 2, 0);
    const bg = new THREE.CylinderGeometry(0.011, 0.011, 0.11, 6);
    bg.rotateZ(Math.PI / 2);
    for (let i = -1; i <= 1; i++) {
      const s = new THREE.Mesh(sg, this.mat);
      s.position.set(i * 0.1143, 0, 0);
      this.stumps.push(s);
      this.group.add(s);
    }
    for (const x of [-0.057, 0.057]) {
      const b = new THREE.Mesh(bg, this.mat);
      b.position.set(x, STUMP_H + 0.012, 0);
      this.bails.push(b);
      this.group.add(b);
    }
    this.group.position.set(0, 0, z);
    this.reset();
  }

  reset() {
    this.broken = false;
    this.t = 0;
    this.mat.emissive.setHex(0x000000);
    this.stumps.forEach((s, i) => {
      s.position.set((i - 1) * 0.1143, 0, 0);
      s.rotation.set(0, 0, 0);
    });
    this.bails.forEach((b, i) => {
      b.position.set(i === 0 ? -0.057 : 0.057, STUMP_H + 0.012, 0);
      b.rotation.set(0, 0, 0);
    });
  }

  /** dirZ = direction of the ball along z (-1 at the striker's end). */
  hit(x: number, dirZ: number, power = 1) {
    this.broken = true;
    this.t = 0;
    this.vel = this.bails.map((_, i) => new THREE.Vector3((i ? 1 : -1) * 1.2 + x * 4, 3.2 * power + i * 0.6, dirZ * (2.2 + i * 0.8) * power));
    this.spin = this.bails.map(() => new THREE.Vector3(8 + Math.random() * 6, 5, 10 + Math.random() * 6));
    this.hitX = x;
    this.hitDir = dirZ;
  }

  private hitX = 0;
  private hitDir = -1;

  /** Sets the animation to a time after the hit (also used by replays). */
  setTime(t: number) {
    this.t = t;
    if (!this.broken) return;
    const flash = Math.max(0, 1 - t * 1.6);
    this.mat.emissive.setRGB(flash, flash * 0.15, flash * 0.1);
    this.stumps.forEach((s, i) => {
      const near = 1 - Math.min(1, Math.abs((i - 1) * 0.1143 - this.hitX) / 0.2);
      const tilt = Math.min(1.0, t * 5) * (0.25 + near * 0.7);
      s.rotation.x = this.hitDir * tilt;
      s.rotation.z = (i - 1) * tilt * 0.25;
    });
    this.bails.forEach((b, i) => {
      const v = this.vel[i];
      const y = STUMP_H + 0.012 + v.y * t - 4.9 * t * t;
      b.position.set((i === 0 ? -0.057 : 0.057) + v.x * t, Math.max(0.012, y), v.z * t);
      if (y > 0.012) b.rotation.set(this.spin[i].x * t, this.spin[i].y * t, this.spin[i].z * t);
    });
  }

  update(dt: number) {
    if (this.broken) this.setTime(this.t + dt);
  }

  /** Replay support: shows the state at a recorded time. A negative time shows intact stumps. */
  show(t: number) {
    if (t < 0) {
      const b = this.broken;
      const tt = this.t;
      this.reset();
      this.broken = b;
      this.t = tt;
    } else if (this.broken) {
      const tt = this.t;
      this.setTime(t);
      this.t = tt;
    }
  }

  get isBroken() {
    return this.broken;
  }

  get time() {
    return this.t;
  }
}

export class Stadium {
  readonly group = new THREE.Group();
  readonly strikerStumps = new Stumps(-STUMPS_Z);
  readonly bowlerStumps = new Stumps(STUMPS_Z);
  private flashes: THREE.Points;
  private flashLife: Float32Array;
  private boardTex: THREE.Texture;
  private crowdMat: THREE.MeshBasicMaterial;
  private cheer = 0;

  constructor() {
    const g = this.group;

    // Ground.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(96, 72), new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);

    // Pitch.
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.66, 24), new THREE.MeshLambertMaterial({ map: pitchTexture() }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.006;
    g.add(pitch);

    g.add(this.strikerStumps.group, this.bowlerStumps.group);

    // Boundary rope.
    const rope = new THREE.Mesh(new THREE.TorusGeometry(BOUNDARY_R, 0.16, 6, 120), new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }));
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.12;
    g.add(rope);

    // LED boards.
    this.boardTex = boardTexture();
    const boards = new THREE.Mesh(
      new THREE.CylinderGeometry(71, 71, 1.1, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: this.boardTex, side: THREE.BackSide }),
    );
    boards.position.y = 0.55;
    g.add(boards);

    // Sight screens behind each end.
    for (const s of [1, -1]) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(11, 5), new THREE.MeshBasicMaterial({ color: 0x07080c }));
      screen.position.set(0, 3.6, s * 70.6);
      if (s === 1) screen.rotation.y = Math.PI;
      g.add(screen);
    }

    // Stands: two tiers of crowd.
    const tex = crowdTexture();
    this.crowdMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, color: 0xb8b8b8 });
    const lower = new THREE.Mesh(
      new THREE.LatheGeometry([new THREE.Vector2(72, 1.1), new THREE.Vector2(98, 17)], 72),
      this.crowdMat,
    );
    g.add(lower);
    const upper = new THREE.Mesh(
      new THREE.LatheGeometry([new THREE.Vector2(96, 21), new THREE.Vector2(118, 38)], 72),
      this.crowdMat,
    );
    g.add(upper);
    const dark = new THREE.MeshBasicMaterial({ color: 0x0c0e16, side: THREE.DoubleSide });
    const fascia = new THREE.Mesh(new THREE.CylinderGeometry(97, 97, 4.4, 72, 1, true), dark);
    fascia.position.y = 19;
    g.add(fascia);
    const fasciaStripe = new THREE.Mesh(
      new THREE.CylinderGeometry(96.9, 96.9, 0.5, 72, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.BackSide }),
    );
    fasciaStripe.position.y = 20.4;
    g.add(fasciaStripe);
    const roof = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(104, 44), new THREE.Vector2(124, 41)], 72), dark);
    g.add(roof);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(124, 124, 46, 72, 1, true), dark);
    wall.position.y = 20;
    g.add(wall);

    // Camera flashes in the crowd.
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() < 0.5;
      const k = Math.random();
      const r = up ? 96 + 22 * k : 72 + 26 * k;
      const y = up ? 21 + 17 * k : 1.1 + 15.9 * k;
      pos[i * 3] = Math.sin(a) * (r - 0.4);
      pos[i * 3 + 1] = y + 0.3;
      pos[i * 3 + 2] = Math.cos(a) * (r - 0.4);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.flashLife = new Float32Array(N);
    this.flashes = new THREE.Points(
      fg,
      new THREE.PointsMaterial({ size: 2.2, map: glowTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    g.add(this.flashes);

    // Floodlight towers.
    const glow = glowTexture();
    const lamp = lampTexture();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = Math.sin(a) * 116;
      const z = Math.cos(a) * 116;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 62, 6), dark);
      tower.position.set(x, 31, z);
      g.add(tower);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), new THREE.MeshBasicMaterial({ map: lamp }));
      panel.position.set(x, 64, z);
      panel.lookAt(0, 10, 0);
      g.add(panel);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
      sp.position.set(x * 0.985, 64, z * 0.985);
      sp.scale.set(74, 74, 1);
      g.add(sp);
    }

    // Sky dome.
    const [sc, sg] = canvas(16, 256);
    const sky = sg.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#04050c');
    sky.addColorStop(0.55, '#0a1026');
    sky.addColorStop(0.8, '#1a2444');
    sky.addColorStop(1, '#2b3355');
    sg.fillStyle = sky;
    sg.fillRect(0, 0, 16, 256);
    const skyTex = new THREE.CanvasTexture(sc);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    g.add(dome);
  }

  /** Lights for the scene. */
  addLights(scene: THREE.Scene) {
    scene.add(new THREE.HemisphereLight(0xb9c8e8, 0x1c3a22, 1.25));
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const d = new THREE.DirectionalLight(0xfff6e2, 0.72);
      d.position.set(Math.sin(a) * 116, 64, Math.cos(a) * 116);
      scene.add(d);
    }
  }

  /** Makes the crowd brighter and adds more flashes for a short time. */
  excite(amount = 1) {
    this.cheer = Math.max(this.cheer, amount);
  }

  update(dt: number, time: number) {
    this.boardTex.offset.x = (time * 0.004) % 1;
    this.cheer = Math.max(0, this.cheer - dt * 0.35);
    const base = 0.72 + this.cheer * 0.22 + Math.sin(time * 9) * 0.02 * this.cheer;
    this.crowdMat.color.setScalar(base);
    const col = this.flashes.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    const n = this.flashLife.length;
    const spawn = (1.5 + this.cheer * 40) * dt;
    let k = spawn;
    while (k > 0) {
      if (k >= 1 || Math.random() < k) this.flashLife[Math.floor(Math.random() * n)] = 1;
      k -= 1;
    }
    for (let i = 0; i < n; i++) {
      const l = this.flashLife[i];
      if (l > 0) this.flashLife[i] = Math.max(0, l - dt * 7);
      const v = l * l;
      arr[i * 3] = v;
      arr[i * 3 + 1] = v;
      arr[i * 3 + 2] = v;
    }
    col.needsUpdate = true;
    this.strikerStumps.update(dt);
    this.bowlerStumps.update(dt);
  }
}

export { glowTexture };
