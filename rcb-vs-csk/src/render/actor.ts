import { Figure, makePose, mixPose, sampleTrack, smooth, type Key, type Pose } from './figure';
import { runPose } from './poses';

/** A figure with simple animation states: blend to a pose, play a track, or run. */
export class Actor {
  readonly fig: Figure;
  x = 0;
  y = 0;
  z = 0;
  facing = 0;
  /** While the clock is below this value, movement does not change the pose. */
  busyUntil = 0;
  playerId = '';

  private from = makePose({});
  private goal: Pose | null = null;
  private bt = 0;
  private bd = 0.2;
  private keys: Key[] | null = null;
  private kt = 0;
  private running = false;
  private runBat = false;
  private runBlend = 1;
  private runK = 1;
  private phase = Math.random() * 6;
  private tmp = makePose({});
  private mv: { fx: number; fz: number; tx: number; tz: number; t: number; dur: number; facing: number; pose: Pose | null } | null = null;
  private queue: { at: number; fn: () => void }[] = [];
  private clock = 0;

  constructor(fig: Figure) {
    this.fig = fig;
  }

  get isRunning() {
    return this.running;
  }

  get isMoving() {
    return this.mv !== null;
  }

  place(x: number, z: number, facing: number) {
    this.x = x;
    this.z = z;
    this.facing = facing;
    this.mv = null;
  }

  setPose(p: Pose) {
    this.fig.pose.set(p);
    this.goal = null;
    this.keys = null;
    this.running = false;
  }

  blendTo(p: Pose, dur = 0.25) {
    this.from.set(this.fig.pose);
    this.goal = p;
    this.bt = 0;
    this.bd = Math.max(0.01, dur);
    this.keys = null;
    this.running = false;
  }

  play(keys: Key[], t0?: number) {
    this.keys = keys;
    this.kt = t0 ?? keys[0].t;
    this.goal = null;
    this.running = false;
  }

  /** Shows a track at an exact time (the caller drives the time). */
  sample(keys: Key[], t: number) {
    this.keys = null;
    this.goal = null;
    this.running = false;
    sampleTrack(keys, t, this.fig.pose);
  }

  startRun(bat = false, intensity = 1) {
    if (!this.running) {
      this.from.set(this.fig.pose);
      this.runBlend = 0;
    }
    this.running = true;
    this.runBat = bat;
    this.runK = intensity;
    this.goal = null;
    this.keys = null;
  }

  /** Runs to a point in a given time, then takes the end pose. */
  moveTo(x: number, z: number, dur: number, facing: number, pose: Pose | null, bat = false) {
    const d = Math.hypot(x - this.x, z - this.z);
    if (d < 0.25) {
      this.x = x;
      this.z = z;
      this.facing = facing;
      if (pose) this.blendTo(pose, 0.3);
      this.mv = null;
      return;
    }
    this.mv = { fx: this.x, fz: this.z, tx: x, tz: z, t: 0, dur: Math.max(0.2, dur), facing, pose };
    this.startRun(bat, Math.min(1, 0.45 + d / dur / 9));
  }

  /** Follows a target position that another system controls. Returns true while it moves. */
  chase(tx: number, tz: number, dt: number, maxSpeed: number, idle: Pose | null, bat = false): boolean {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.04) {
      if (this.running && this.clock >= this.busyUntil) {
        if (idle) this.blendTo(idle, 0.25);
        else this.running = false;
      }
      return false;
    }
    const step = Math.min(d, maxSpeed * dt);
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    if (d > 0.3) this.facing = turnToward(this.facing, Math.atan2(dx, dz), dt * 12);
    if (this.clock >= this.busyUntil) {
      if (!this.running && d > 0.25) this.startRun(bat, Math.min(1, 0.4 + step / dt / 9));
      if (this.running) this.phase += step * 1.65;
    }
    return true;
  }

  /** Calls fn after a delay (in actor time). */
  after(delay: number, fn: () => void) {
    this.queue.push({ at: this.clock + delay, fn });
  }

  clearQueue() {
    this.queue.length = 0;
  }

  /** Adds distance to the run cycle when the caller moves the actor directly. */
  advanceRun(dist: number) {
    this.phase += dist * 1.65;
  }

  update(dt: number) {
    this.clock += dt;
    if (this.queue.length) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        if (this.clock >= this.queue[i].at) {
          const q = this.queue.splice(i, 1)[0];
          q.fn();
        }
      }
    }
    const pose = this.fig.pose;
    if (this.mv) {
      const m = this.mv;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const e = k < 0.85 ? k * 1.03 : 0.8755 + (1 - (1 - (k - 0.85) / 0.15) ** 2) * 0.1245;
      const nx = m.fx + (m.tx - m.fx) * e;
      const nz = m.fz + (m.tz - m.fz) * e;
      const d = Math.hypot(nx - this.x, nz - this.z);
      if (d > 1e-4) this.facing = turnToward(this.facing, Math.atan2(nx - this.x, nz - this.z), dt * 14);
      this.phase += d * 1.65;
      this.x = nx;
      this.z = nz;
      if (k >= 1) {
        this.mv = null;
        this.facing = m.facing;
        if (m.pose) this.blendTo(m.pose, 0.3);
        else this.running = false;
      }
    }
    if (this.running) {
      if (!this.mv && this.clock < this.busyUntil) this.phase += dt * 9;
      runPose(this.phase, this.tmp, this.runBat, this.runK);
      if (this.runBlend < 1) {
        this.runBlend = Math.min(1, this.runBlend + dt / 0.16);
        mixPose(this.from, this.tmp, smooth(this.runBlend), pose);
      } else pose.set(this.tmp);
    } else if (this.keys) {
      this.kt += dt;
      sampleTrack(this.keys, this.kt, pose);
      if (this.kt > this.keys[this.keys.length - 1].t) this.keys = null;
    } else if (this.goal) {
      this.bt += dt;
      mixPose(this.from, this.goal, smooth(this.bt / this.bd), pose);
      if (this.bt >= this.bd) this.goal = null;
    }
    this.apply();
  }

  apply() {
    const r = this.fig.root;
    r.position.set(this.x, this.y, this.z);
    r.rotation.y = this.facing;
    this.fig.update();
  }
}

export function turnToward(a: number, b: number, maxStep: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}
