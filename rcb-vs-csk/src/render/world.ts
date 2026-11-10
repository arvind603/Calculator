import * as THREE from 'three';
import type { BallContext, BallSim, SimEvent } from '../sim/ballsim';
import {
  BAT_Z,
  BOWLER_STUMPS_Z,
  IDEAL_TAP_DIST,
  STRIKER_CREASE_Z,
  STRIKER_STUMPS_Z,
  legSign,
} from '../sim/field';
import type { Player, TeamId, Vec3 } from '../sim/types';
import { Actor } from './actor';
import { BallFx, TargetMarker, TimingZone } from './effects';
import { Figure, KITS, P, makePose, type Key, type Pose } from './figure';
import {
  APPEAL,
  BACKLIFT,
  CATCH_HIGH,
  CATCH_LOW,
  CELEBRATE,
  CELEBRATE_2,
  DEJECTED,
  DIVE,
  FOOT_BACK,
  FOOT_FRONT,
  HANDS_ON_HIPS,
  IDLE,
  KEEPER_CROUCH,
  KEEPER_READY,
  NON_STRIKER,
  NON_STRIKER_BACKUP,
  PICKUP,
  READY,
  STANCE,
  STANCE_TAP,
  THROW_BACK,
  THROW_END,
  UMP_IDLE,
  UMP_WATCH,
  bowlTrack,
  buildSwing,
  runPose,
  signalTrack,
  type Signal,
} from './poses';
import { Stadium } from './stadium';

export type CameraMode = 'menu' | 'aim' | 'live';

const ACTORS = 15;
const SNAP_ACTOR = 5 + P.SIZE;
const SNAP_HEAD = 8;
const SNAP = SNAP_HEAD + ACTORS * SNAP_ACTOR;
const MAX_FRAMES = 60 * 16;
const RUN_END_Z = 8.6;

const NUMBERS: Record<string, number> = { 'virat-kohli': 18, 'ms-dhoni': 7, 'rajat-patidar': 97, 'ruturaj-gaikwad': 31, 'sanju-samson': 11 };

function shirtNumber(id: string): number {
  if (NUMBERS[id]) return NUMBERS[id];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 2 + (h % 96);
}

function seedOf(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return h % 6;
}

const lastName = (p: Player) => p.name.split(' ').slice(1).join(' ') || p.name;

interface ReplayState {
  from: number;
  to: number;
  t: number;
  speed: number;
  cam: 'side' | 'chase' | 'end';
  focus: THREE.Vector3;
  hold: number;
}

/** The 3D scene. It reads the simulation and shows it. It does not change the simulation. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(26, 1, 0.3, 900);
  readonly stadium = new Stadium();
  readonly ballFx = new BallFx();
  readonly zone = new TimingZone();
  readonly marker = new TargetMarker();
  mode: CameraMode = 'menu';
  time = 0;

  private striker!: Actor;
  private nonStriker!: Actor;
  private bowler!: Actor;
  private keeper!: Actor;
  private fielders: Actor[] = [];
  private umpire: Actor;
  private legUmpire: Actor;
  private battingKit: TeamId | null = null;
  private bowlingKit: TeamId | null = null;
  private ctx: BallContext | null = null;

  // Per-ball state.
  private bowlKeys: Key[] = [];
  private bowlSlow = 1;
  private bowlSpeed = 6;
  private bowlRelZ = 0;
  private bowlX = 0;
  private ballInHand = true;
  private batState: 'stance' | 'backlift' | 'foot' | 'swing' | 'run' = 'stance';
  private tapT = 0;
  private strikerHome = { x: 0, z: 0, facing: 0 };
  private nsHome = { x: 0, z: 0 };
  private laneS = 0;
  private laneN = 0;
  private fieldersReady = false;
  private released = false;
  private bowlerFree = false;
  private lastRunsDone = 0;
  private hasBall = false;

  // Camera.
  private camPos = new THREE.Vector3(0, 40, 90);
  private camLook = new THREE.Vector3(0, 0, 0);
  private desPos = new THREE.Vector3();
  private desLook = new THREE.Vector3();
  private desFov = 26;
  private followBlend = 0;
  private aspect = 1;

  // Replay recorder.
  private rec = new Float32Array(MAX_FRAMES * SNAP);
  private recTimes = new Float32Array(MAX_FRAMES);
  private recN = 0;
  private recording = false;
  private recClock = 0;
  private markContact = -1;
  private markEvent = -1;
  private markKind: 'near' | 'catch' | 'runout' | 'six' | '' = '';
  private markPos = new THREE.Vector3();
  private live = new Float32Array(SNAP);
  private replay: ReplayState | null = null;

  private ray = new THREE.Raycaster();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, lowPower = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene.background = new THREE.Color(0x05060d);
    this.scene.fog = new THREE.Fog(0x0a1024, 170, 520);
    this.scene.add(this.stadium.group);
    this.stadium.addLights(this.scene);
    this.scene.add(this.ballFx.group, this.zone.mesh, this.marker.group);
    this.zone.mesh.visible = false;
    this.ballFx.setVisible(false);

    this.umpire = new Actor(new Figure({ gear: 'umpire', kit: KITS.UMP, hat: true, seed: 3 }));
    this.legUmpire = new Actor(new Figure({ gear: 'umpire', kit: KITS.UMP, hat: true, seed: 1 }));
    this.scene.add(this.umpire.fig.root, this.legUmpire.fig.root);
    this.umpire.place(0, BOWLER_STUMPS_Z + 1.7, Math.PI);
    this.umpire.setPose(UMP_IDLE);
    this.legUmpire.place(24, STRIKER_CREASE_Z, -Math.PI / 2);
    this.legUmpire.setPose(UMP_IDLE);
    this.umpire.apply();
    this.legUmpire.apply();
  }

  // ---------- Setup ----------

  resize(w: number, h: number, pixelRatio: number) {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  private makeBatter(pl: Player, team: TeamId): Actor {
    const fig = new Figure({ gear: 'batter', kit: KITS[team], seed: seedOf(pl.id), number: shirtNumber(pl.id), name: lastName(pl) });
    fig.setMirror(pl.hand === 'L');
    const a = new Actor(fig);
    a.playerId = pl.id;
    this.scene.add(fig.root);
    return a;
  }

  private drop(a: Actor | undefined) {
    if (a) this.scene.remove(a.fig.root);
  }

  /** Builds the fielding side when the kit changes. */
  private ensureFieldingSide(team: TeamId, keeper: Player) {
    if (this.bowlingKit === team && this.keeper) return;
    this.bowlingKit = team;
    this.drop(this.keeper);
    this.fielders.forEach((f) => this.drop(f));
    this.fielders = [];
    for (let i = 0; i < 9; i++) {
      const a = new Actor(new Figure({ gear: 'fielder', kit: KITS[team], seed: i + 2 }));
      a.place(Math.sin(i * 0.7) * 40, Math.cos(i * 0.7) * 40, 0);
      a.setPose(IDLE);
      this.scene.add(a.fig.root);
      this.fielders.push(a);
    }
    this.keeper = new Actor(new Figure({ gear: 'keeper', kit: KITS[team], seed: seedOf(keeper.id) }));
    this.keeper.place(0, STRIKER_STUMPS_Z - 6, 0);
    this.keeper.setPose(IDLE);
    this.scene.add(this.keeper.fig.root);
    this.drop(this.bowler);
    this.bowler = undefined as unknown as Actor;
  }

  /**
   * Places everyone for the next ball. Players jog to their positions.
   * Returns the time (s) that the move needs.
   */
  prepareBall(ctx: BallContext, battingTeam: TeamId, bowlingTeam: TeamId, instant = false): number {
    this.ctx = ctx;
    const side = legSign(ctx.striker.hand);
    const kind = ctx.spec.kind;
    const keeperPl = { id: ctx.fielders.find((f) => f.keeper)!.id } as Player;
    this.ensureFieldingSide(bowlingTeam, keeperPl);
    let dur = instant ? 0 : 1.15;

    // --- Batters ---
    if (this.battingKit !== battingTeam) {
      this.drop(this.striker);
      this.drop(this.nonStriker);
      this.striker = undefined as unknown as Actor;
      this.nonStriker = undefined as unknown as Actor;
      this.battingKit = battingTeam;
    }
    const existing = [this.striker, this.nonStriker].filter(Boolean);
    const find = (pl: Player): Actor => {
      const e = existing.find((a) => a.playerId === pl.id);
      if (e) return e;
      // New batter: reuse the slot of a batter who is not at the crease now.
      const old = existing.find((a) => a.playerId !== ctx.striker.id && a.playerId !== ctx.nonStriker.id);
      const a = this.makeBatter(pl, battingTeam);
      if (old) {
        this.drop(old);
        existing.splice(existing.indexOf(old), 1);
      }
      // Walks in from the side of the ground.
      a.place(-side * 15, STRIKER_CREASE_Z + 6, 0);
      a.setPose(NON_STRIKER);
      if (!instant) dur = Math.max(dur, 2.2);
      return a;
    };
    const s = find(ctx.striker);
    const n = find(ctx.nonStriker);
    this.striker = s;
    this.nonStriker = n;

    const arm = ctx.spec.arm === 'R' ? -1 : 1;
    this.strikerHome = { x: side * 0.34, z: STRIKER_CREASE_Z + 0.14, facing: ctx.striker.hand === 'R' ? -Math.PI / 2 : Math.PI / 2 };
    this.laneN = -arm * 1.4;
    this.laneS = arm * 1.4;
    this.nsHome = { x: this.laneN, z: RUN_END_Z + 0.5 };
    const go = (a: Actor, x: number, z: number, facing: number, pose: Pose, bat: boolean, t = dur) => {
      a.clearQueue();
      a.busyFor(0);
      if (instant) {
        a.place(x, z, facing);
        a.setPose(pose);
        a.apply();
      } else {
        const d = Math.hypot(x - a.x, z - a.z);
        a.moveTo(x, z, Math.max(0.35, Math.min(t, d / 3.2)), facing, pose, bat);
      }
    };
    go(s, this.strikerHome.x, this.strikerHome.z, this.strikerHome.facing, STANCE, true);
    go(n, this.nsHome.x, this.nsHome.z, Math.PI, NON_STRIKER, true);

    // --- Bowler ---
    this.bowlSlow = kind === 'pace' ? 1 : 1.3;
    this.bowlSpeed = kind === 'pace' ? 6.2 : 2.6;
    const relX = arm * (kind === 'pace' ? 0.45 : 0.38);
    this.bowlX = relX + arm * 0.22;
    this.bowlRelZ = STRIKER_CREASE_Z * -1 + 0.25 + 0.8;
    const runupTime = kind === 'pace' ? 2.3 : 1.6;
    const zStart = this.bowlerZ(-runupTime);
    if (!this.bowler || this.bowler.playerId !== ctx.bowler.id) {
      this.drop(this.bowler);
      const fig = new Figure({ gear: 'bowler', kit: KITS[bowlingTeam], seed: seedOf(ctx.bowler.id), number: shirtNumber(ctx.bowler.id), name: lastName(ctx.bowler) });
      fig.setMirror(ctx.spec.arm === 'L');
      this.bowler = new Actor(fig);
      this.bowler.playerId = ctx.bowler.id;
      this.scene.add(fig.root);
      this.bowler.place(this.bowlX, zStart + 6, Math.PI);
      this.bowler.setPose(IDLE);
    }
    go(this.bowler, this.bowlX, zStart, Math.PI, IDLE, false, 1.0);
    const tmp = makePose({});
    const startPhase = (zStart - this.bowlerZ(-0.8 * this.bowlSlow)) * 1.65;
    runPose(startPhase, tmp, false, kind === 'pace' ? 1 : 0.55);
    this.bowlKeys = bowlTrack(tmp, this.bowlSlow);

    // --- Fielders ---
    const sx = this.strikerHome.x;
    const sz = this.strikerHome.z;
    ctx.fielders.forEach((f, i) => {
      if (f.bowler) return;
      const a = f.keeper ? this.keeper : this.fielders[i];
      if (!a) return;
      const facing = Math.atan2(sx - f.x, sz - f.z);
      go(a, f.x, f.z, f.keeper ? 0 : facing, f.keeper ? (kind === 'spin' ? KEEPER_CROUCH : KEEPER_READY) : i % 3 === 0 ? HANDS_ON_HIPS : IDLE, false, 1.3);
    });

    // --- Umpires ---
    this.umpire.clearQueue();
    this.umpire.blendTo(UMP_IDLE, 0.4);
    this.legUmpire.place(side * 24, STRIKER_CREASE_Z, side > 0 ? -Math.PI / 2 : Math.PI / 2);

    this.stadium.strikerStumps.reset();
    this.stadium.bowlerStumps.reset();
    this.ballFx.clearTrail();
    this.ballFx.trailOn = false;
    this.ballFx.setVisible(true);
    this.hasBall = true;
    this.ballInHand = true;
    this.batState = 'stance';
    this.fieldersReady = false;
    this.released = false;
    this.bowlerFree = false;
    this.lastRunsDone = 0;
    this.recN = 0;
    this.recording = false;
    this.markContact = this.markEvent = -1;
    this.markKind = '';
    this.followBlend = 0;
    this.zone.setHalfWidth(1);
    return dur;
  }

  /** Removes the players (for the menu). */
  clearPlayers() {
    for (const a of [this.striker, this.nonStriker, this.bowler, this.keeper, ...this.fielders]) this.drop(a);
    this.striker = this.nonStriker = this.bowler = this.keeper = undefined as unknown as Actor;
    this.fielders = [];
    this.battingKit = this.bowlingKit = null;
    this.ctx = null;
    this.hasBall = false;
    this.ballFx.setVisible(false);
    this.zone.mesh.visible = false;
    this.marker.group.visible = false;
  }

  private bowlerZ(u: number): number {
    const uA = -0.32 * this.bowlSlow;
    if (u >= 0) return this.bowlRelZ - 1.6 * u;
    if (u >= uA) return this.bowlRelZ + 1.3 * -u;
    return this.bowlRelZ + 1.3 * -uA + this.bowlSpeed * (uA - u);
  }

  // ---------- Frame update ----------

  update(dt: number, sim: BallSim | null, events: SimEvent[]) {
    this.time += dt;
    this.stadium.update(dt, this.time);
    this.ballFx.update(dt);
    this.marker.update(dt);

    if (this.replay) {
      this.stepReplay(dt);
      this.updateCamera(dt, null);
      return;
    }

    if (sim && this.ctx) {
      for (const e of events) this.onEvent(e, sim);
      this.syncSim(dt, sim);
    } else if (this.striker && this.batState === 'stance' && !this.striker.isMoving) {
      this.idleTap(dt);
    }
    this.all((a) => a.update(dt));

    if (sim && this.hasBall) {
      if (this.ballInHand) {
        this.v.copy(this.bowler.fig.handRWorld);
        this.v.y += 0.03;
        this.ballFx.setPosition(this.v, dt, 4);
      } else this.ballFx.setPosition(sim.ball, dt, sim.phase === 'flight' ? 26 : 14);
      this.ballFx.setVisible(true);
    } else if (this.hasBall && this.bowler && this.ballInHand) {
      this.v.copy(this.bowler.fig.handRWorld);
      this.ballFx.setPosition(this.v, dt, 0);
    }
    this.ballFx.updateTrail();
    this.zone.update(dt, this.mode === 'live' && !!sim && sim.ctx.userBatting && (sim.phase === 'runup' || sim.phase === 'flight'), !!sim && sim.ballInZone);

    if (sim && this.recording) this.record(dt);
    this.updateCamera(dt, sim);
  }

  private all(fn: (a: Actor) => void) {
    if (this.striker) fn(this.striker);
    if (this.nonStriker) fn(this.nonStriker);
    if (this.bowler) fn(this.bowler);
    if (this.keeper) fn(this.keeper);
    for (const f of this.fielders) fn(f);
    fn(this.umpire);
    fn(this.legUmpire);
  }

  private idleTap(dt: number) {
    this.tapT += dt;
    if (this.tapT > 1.1) {
      this.tapT = 0;
      this.striker.play([
        { t: 0, pose: STANCE },
        { t: 0.16, pose: STANCE_TAP },
        { t: 0.32, pose: STANCE },
      ]);
    }
  }

  private syncSim(dt: number, sim: BallSim) {
    const ctx = sim.ctx;
    const u = sim.t - sim.runupTime;
    const d = sim.delivery;
    const k = this.bowlSlow;
    this.zone.setHalfWidth(sim.zoneHalfWidth());

    if (!this.recording && u > -0.9) {
      this.recording = true;
      this.recClock = 0;
    }

    // --- Bowler ---
    const b = this.bowler;
    if (!this.bowlerFree) {
      const z = this.bowlerZ(u);
      if (u < -0.8 * k) {
        b.startRun(false, ctx.spec.kind === 'pace' ? 1 : 0.55);
        b.advanceRun(Math.abs(z - b.z));
      } else b.sample(this.bowlKeys, u);
      b.x = this.bowlX;
      b.z = z;
      b.facing = Math.PI;
      if (u > 0.26) {
        this.bowlerFree = true;
        b.startRun(false, 0.6);
      }
    }

    // --- Fielders ---
    if (!this.fieldersReady && u > -1.2) {
      this.fieldersReady = true;
      this.fielders.forEach((a, i) => a.after(i * 0.04, () => a.blendTo(READY, 0.5)));
      if (ctx.spec.kind === 'pace') this.keeper.blendTo(KEEPER_CROUCH, 0.4);
      this.umpire.blendTo(UMP_WATCH, 0.5);
    }
    const playing = sim.phase === 'play' || (sim.phase === 'settle' && sim.hasContact) || (sim.phase === 'done' && sim.hasContact);
    ctx.fielders.forEach((f, i) => {
      const a = f.bowler ? this.bowler : f.keeper ? this.keeper : this.fielders[i];
      if (f.bowler && !this.bowlerFree) return;
      const p = playing ? sim.fielderPos(i) : { x: f.x, z: f.z, moving: false };
      const moving = a.chase(p.x, p.z, dt, f.bowler && !playing ? 4.2 : 8.5, f.keeper ? KEEPER_READY : READY);
      if (!moving && !a.isRunning && !a.isBusy) {
        // Watch the ball.
        const tx = playing ? sim.ball.x : this.strikerHome.x;
        const tz = playing ? sim.ball.z : this.strikerHome.z;
        const want = Math.atan2(tx - a.x, tz - a.z);
        const diff = Math.atan2(Math.sin(want - a.facing), Math.cos(want - a.facing));
        a.facing += diff * Math.min(1, dt * 5);
      }
    });

    // --- Striker before the hit ---
    const s = this.striker;
    const tf = sim.flightT;
    if (this.batState === 'stance') {
      this.idleTap(dt);
      if (u > -0.42) {
        this.batState = 'backlift';
        s.blendTo(BACKLIFT, 0.34);
      }
    } else if (this.batState === 'backlift' && tf > d.tBat * 0.36) {
      this.batState = 'foot';
      s.blendTo(d.spec.length > (d.spec.kind === 'pace' ? 7.4 : 6.6) ? FOOT_BACK : FOOT_FRONT, 0.24);
    }

    // --- Running between the wickets ---
    const n = this.nonStriker;
    if (playing || sim.phase === 'settle' || sim.phase === 'done') {
      const prog = sim.strikerProgress;
      const started = sim.runsDone > 0 || sim.running;
      if (started) {
        if (this.batState !== 'run') {
          this.batState = 'run';
          s.clearQueue();
        }
        const firstK = sim.runsDone === 0 ? Math.min(1, (sim.runT / sim.runDur) * 4) : 1;
        this.runBatter(s, this.strikerHome.x + (this.laneS - this.strikerHome.x) * firstK, -RUN_END_Z + (2 * RUN_END_Z) * prog, sim, dt);
        this.runBatter(n, this.laneN, RUN_END_Z - 2 * RUN_END_Z * prog, sim, dt);
      }
    }
    this.lastRunsDone = sim.runsDone;
  }

  private runBatter(a: Actor, x: number, z: number, sim: BallSim, dt: number) {
    const dz = z - a.z;
    const dist = Math.hypot(x - a.x, dz);
    if (sim.running) {
      a.startRun(true, 1);
      a.advanceRun(Math.min(dist, 0.3));
      if (Math.abs(dz) > 0.002) a.facing = dz > 0 ? 0 : Math.PI;
      const kx = Math.min(1, dt * 14);
      a.x += (x - a.x) * kx;
      a.z += dz * Math.min(1, dt * 20);
    } else if (a.isRunning) {
      a.x = x;
      a.z = z;
      a.facing = z > 0 ? Math.PI : 0;
      a.blendTo(NON_STRIKER, 0.25);
    }
  }

  private onEvent(e: SimEvent, sim: BallSim) {
    const ctx = sim.ctx;
    const fieldActor = (i: number) => (ctx.fielders[i].bowler ? this.bowler : ctx.fielders[i].keeper ? this.keeper : this.fielders[i]);
    switch (e.type) {
      case 'release':
        this.ballInHand = false;
        this.released = true;
        this.nonStriker.blendTo(NON_STRIKER_BACKUP, 0.4);
        this.nonStriker.z -= 0.0;
        if (ctx.spec.kind === 'pace') this.keeper.blendTo(KEEPER_READY, 0.3);
        break;
      case 'bounce':
        this.ballFx.burstDust(e.pos, 1);
        break;
      case 'swing':
      case 'leave': {
        const shot = e.type === 'swing' ? e.shot : null;
        const contactIn = e.type === 'swing' ? e.contactIn : 0.3;
        const d = sim.delivery;
        let local: [number, number, number] | null = null;
        if (shot) {
          const p = d.pos(sim.flightT + contactIn);
          this.v.set(p.x, Math.min(1.7, Math.max(0.2, p.y)), p.z);
          this.striker.fig.root.worldToLocal(this.v);
          local = [this.v.x, this.v.y, this.v.z];
        }
        const foot = d.spec.length > (d.spec.kind === 'pace' ? 7.4 : 6.6) ? 'back' : 'front';
        const plan = buildSwing(shot ? shot.name : 'leave', foot, this.striker.fig.pose, contactIn, !!shot && shot.type === 'loft', local);
        this.striker.play(plan.keys);
        this.batState = 'swing';
        break;
      }
      case 'contact':
        this.ballFx.trailOn = true;
        this.ballFx.clearTrail();
        this.ballFx.hitFlash(sim.ball, e.shot.speed > 26);
        this.markContact = this.recClock;
        break;
      case 'bowled':
        this.stadium.strikerStumps.hit(sim.ball.x, -1, 1);
        this.mark('near', sim.ball);
        if (e.out) this.wicketReaction();
        break;
      case 'pad':
        if (e.out) {
          this.mark('near', sim.ball);
          this.appeal();
        }
        break;
      case 'keeperTake': {
        const low = sim.ball.y < 0.9;
        this.keeper.blendTo(low ? CATCH_LOW : CATCH_HIGH, 0.12);
        this.keeper.busyFor(0.6);
        break;
      }
      case 'stumped':
        this.stadium.strikerStumps.hit(0.05, 1, 0.5);
        this.mark('near', sim.ball);
        if (e.out) this.wicketReaction();
        break;
      case 'landed':
        this.ballFx.burstDust(e.pos, 0.45);
        break;
      case 'fielded': {
        const a = fieldActor(e.fielder);
        a.blendTo(e.dive ? DIVE : PICKUP, 0.14);
        a.busyFor(0.3);
        a.after(Math.max(0.16, sim.throwIn - 0.26), () => a.blendTo(THROW_BACK, 0.2));
        break;
      }
      case 'drop': {
        const a = fieldActor(e.fielder);
        a.blendTo(CATCH_LOW, 0.12);
        a.after(0.35, () => a.blendTo(PICKUP, 0.25));
        a.after(0.75, () => a.blendTo(THROW_BACK, 0.2));
        break;
      }
      case 'catch': {
        const a = fieldActor(e.fielder);
        a.blendTo(e.dive ? DIVE : sim.ball.y > 1.1 ? CATCH_HIGH : CATCH_LOW, 0.1);
        a.busyFor(0.7);
        this.ballFx.trailOn = false;
        this.mark(ctx.fielders[e.fielder].keeper ? 'near' : 'catch', sim.ball);
        if (e.out) this.wicketReaction(a);
        break;
      }
      case 'boundary':
        this.stadium.excite(e.runs === 6 ? 1 : 0.7);
        if (e.runs === 6) this.mark('six', sim.ball);
        break;
      case 'throw': {
        const a = fieldActor(e.fielder);
        const tz = e.end === 'striker' ? STRIKER_STUMPS_Z : BOWLER_STUMPS_Z;
        a.facing = Math.atan2(-a.x, tz - a.z);
        a.blendTo(THROW_END, 0.16);
        a.busyFor(0.5);
        a.after(0.6, () => a.blendTo(IDLE, 0.4));
        this.ballFx.trailOn = false;
        break;
      }
      case 'arrive': {
        const a = e.end === 'striker' ? this.keeper : this.bowler;
        a.blendTo(CATCH_LOW, 0.12);
        a.busyFor(0.5);
        break;
      }
      case 'runOut': {
        const st = e.end === 'striker' ? this.stadium.strikerStumps : this.stadium.bowlerStumps;
        st.hit(0, e.end === 'striker' ? 1 : -1, 0.6);
        this.v.set(0, 0.6, e.end === 'striker' ? STRIKER_STUMPS_Z : BOWLER_STUMPS_Z);
        this.mark('runout', this.v);
        this.wicketReaction();
        break;
      }
      case 'runStart':
      case 'runComplete':
      case 'dead':
        break;
    }
  }

  private mark(kind: 'near' | 'catch' | 'runout' | 'six', pos: Vec3 | THREE.Vector3) {
    this.markEvent = this.recClock;
    this.markKind = kind;
    this.markPos.set(pos.x, pos.y, pos.z);
  }

  private celebrateKeys(from: Pose): Key[] {
    return [
      { t: 0, pose: Float32Array.from(from) },
      { t: 0.3, pose: CELEBRATE },
      { t: 0.55, pose: CELEBRATE_2 },
      { t: 0.8, pose: CELEBRATE },
      { t: 1.05, pose: CELEBRATE_2 },
      { t: 1.3, pose: CELEBRATE },
      { t: 2.3, pose: CELEBRATE_2 },
      { t: 2.8, pose: IDLE },
    ];
  }

  private wicketReaction(first?: Actor) {
    this.stadium.excite(0.9);
    const list = [this.bowler, this.keeper, ...this.fielders];
    list.forEach((a, i) => {
      if (!a) return;
      a.after(a === first ? 0.45 : 0.1 + (i % 5) * 0.09, () => {
        a.busyFor(2.6);
        a.play(this.celebrateKeys(a.fig.pose));
      });
    });
    if (this.batState !== 'run') this.striker.after(0.5, () => this.striker.blendTo(DEJECTED, 0.6));
  }

  private appeal() {
    for (const a of [this.bowler, this.keeper, this.fielders[0]]) {
      if (!a) continue;
      a.busyFor(1.2);
      a.blendTo(APPEAL, 0.2);
    }
    this.striker.after(0.9, () => this.striker.blendTo(DEJECTED, 0.6));
    this.bowler.after(1.0, () => this.wicketReaction());
  }

  /** Umpire signal at the bowler's end. */
  signal(sig: Signal) {
    this.umpire.clearQueue();
    this.umpire.play(signalTrack(sig, this.umpire.fig.pose));
  }

  // ---------- Camera ----------

  private broadcastFov(): number {
    const h = (5.6 * Math.PI) / 180;
    const v = 2 * Math.atan(Math.tan(h) / this.aspect);
    return Math.max(17.5, Math.min(40, (v * 180) / Math.PI));
  }

  private updateCamera(dt: number, sim: BallSim | null) {
    const portrait = this.aspect < 1;
    let kPos = 3.2;
    let kLook = 5;
    if (this.replay) {
      this.replayCamera();
      kPos = 6;
      kLook = 9;
    } else if (this.mode === 'menu') {
      const a = this.time * 0.05 + 0.6;
      this.desPos.set(Math.sin(a) * 78, 26, Math.cos(a) * 78);
      this.desLook.set(0, 4, 0);
      this.desFov = portrait ? 62 : 44;
      kPos = 1.2;
      kLook = 1.5;
    } else if (this.mode === 'aim') {
      this.desPos.set(0, portrait ? 15 : 11.5, portrait ? 9 : 7.5);
      this.desLook.set(0, 0, -4.6);
      this.desFov = portrait ? 46 : 34;
    } else {
      this.desPos.set(0, portrait ? 9.2 : 8.4, 31);
      this.desLook.set(0, 1.0, portrait ? -3.4 : -4.2);
      this.desFov = this.broadcastFov();
      let follow = 0;
      if (sim && sim.hasContact && sim.phase !== 'done' && sim.path) {
        const b = sim.ball;
        const dist = Math.hypot(b.x, b.z - STRIKER_CREASE_Z);
        const lofted = b.y > 3.5;
        follow = Math.min(1, Math.max(0, (dist - (lofted ? 6 : 14)) / 16));
        if (follow > this.followBlend) this.followBlend = follow;
        const f = this.followBlend;
        if (f > 0) {
          const back = b.z > 6 ? (b.z - 6) * 0.95 : 0;
          this.v.set(b.x * 0.5, 15 + dist * 0.22 + back * 0.25, Math.min(66, 33 + back));
          this.v2.set(b.x * 0.8, Math.max(1, b.y * 0.8), STRIKER_CREASE_Z + (b.z - STRIKER_CREASE_Z) * 0.82);
          this.desPos.lerp(this.v, f);
          this.desLook.lerp(this.v2, f);
          this.desFov = this.desFov + ((portrait ? 44 : 32) - this.desFov) * f;
          kPos = 2.6;
          kLook = 6;
        }
      } else this.followBlend = Math.max(0, this.followBlend - dt * 1.2);
    }
    const a = 1 - Math.exp(-dt * kPos);
    const l = 1 - Math.exp(-dt * kLook);
    this.camPos.lerp(this.desPos, a);
    this.camLook.lerp(this.desLook, l);
    const fov = this.camera.fov + (this.desFov - this.camera.fov) * a;
    if (Math.abs(fov - this.camera.fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  /** Moves the camera to its target at once. */
  snapCamera() {
    this.updateCamera(100, null);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen position (CSS pixels) of a world point. */
  project(x: number, y: number, z: number, w: number, h: number): { x: number; y: number } {
    this.v.set(x, y, z).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h };
  }

  batterScreen(w: number, h: number): { x: number; y: number } {
    return this.project(this.strikerHome.x * 0.4, 0.85, STRIKER_CREASE_Z + 0.2, w, h);
  }

  /** World point on the ground under a screen position (normalised -1..1). */
  pickGround(nx: number, ny: number): { x: number; z: number } | null {
    this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    if (d.y >= -1e-4) return null;
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  // ---------- Replay ----------

  private actorList(): (Actor | undefined)[] {
    return [this.striker, this.nonStriker, this.bowler, this.keeper, ...this.fielders, this.umpire, this.legUmpire];
  }

  private writeSnap(buf: Float32Array, o: number) {
    const bp = this.ballFx.mesh.position;
    buf[o] = bp.x;
    buf[o + 1] = bp.y;
    buf[o + 2] = bp.z;
    buf[o + 3] = this.ballFx.mesh.visible ? 1 : 0;
    buf[o + 4] = this.ballFx.trailOn ? 1 : 0;
    buf[o + 5] = this.stadium.strikerStumps.isBroken ? this.stadium.strikerStumps.time : -1;
    buf[o + 6] = this.stadium.bowlerStumps.isBroken ? this.stadium.bowlerStumps.time : -1;
    const list = this.actorList();
    for (let i = 0; i < ACTORS; i++) {
      const a = list[i];
      const p = o + SNAP_HEAD + i * SNAP_ACTOR;
      if (!a) continue;
      buf[p] = a.x;
      buf[p + 1] = a.y;
      buf[p + 2] = a.z;
      buf[p + 3] = a.facing;
      buf[p + 4] = 1;
      buf.set(a.fig.pose, p + 5);
    }
  }

  private record(dt: number) {
    this.recClock += dt;
    if (this.recN >= MAX_FRAMES) return;
    this.recTimes[this.recN] = this.recClock;
    this.writeSnap(this.rec, this.recN * SNAP);
    this.recN++;
  }

  private applySnap(buf: Float32Array, o: number, o2: number, k: number, dt: number) {
    const mix = (i: number) => buf[o + i] * (1 - k) + buf[o2 + i] * k;
    this.v.set(mix(0), mix(1), mix(2));
    this.ballFx.setVisible(buf[o + 3] > 0.5);
    this.ballFx.trailOn = buf[o + 4] > 0.5;
    this.ballFx.setPosition(this.v, dt, 12);
    this.stadium.strikerStumps.show(buf[o + 5] < 0 ? -1 : mix(5));
    this.stadium.bowlerStumps.show(buf[o + 6] < 0 ? -1 : mix(6));
    const list = this.actorList();
    for (let i = 0; i < ACTORS; i++) {
      const a = list[i];
      if (!a) continue;
      const p = o + SNAP_HEAD + i * SNAP_ACTOR;
      const q = o2 + SNAP_HEAD + i * SNAP_ACTOR;
      const r = a.fig.root;
      r.position.set(buf[p] * (1 - k) + buf[q] * k, buf[p + 1], buf[p + 2] * (1 - k) + buf[q + 2] * k);
      const fa = buf[p + 3];
      const fb = buf[q + 3];
      r.rotation.y = fa + Math.atan2(Math.sin(fb - fa), Math.cos(fb - fa)) * k;
      const pose = a.fig.pose;
      for (let j = 0; j < P.BMODE; j++) pose[j] = buf[p + 5 + j] * (1 - k) + buf[q + 5 + j] * k;
      pose[P.BMODE] = buf[p + 5 + P.BMODE];
      a.fig.update();
    }
  }

  /** True if the last ball has something to replay. */
  get canReplay(): boolean {
    return this.recN > 20 && this.markEvent > 0;
  }

  /** Starts a slow-motion replay of the last wicket or six. Returns false if there is none. */
  startReplay(): boolean {
    if (!this.canReplay) return false;
    let from: number;
    let to = this.markEvent + 0.9;
    let cam: ReplayState['cam'] = 'side';
    if (this.markKind === 'near') from = this.markEvent - 1.05;
    else if (this.markKind === 'runout') {
      from = this.markEvent - 1.5;
      cam = 'end';
    } else {
      from = Math.max(0, this.markContact - 0.45);
      to = this.markEvent + (this.markKind === 'six' ? 1.1 : 0.8);
      cam = 'chase';
    }
    from = Math.max(this.recTimes[0], from);
    to = Math.min(this.recTimes[this.recN - 1], to);
    if (to - from < 0.3) return false;
    const speed = Math.max(0.42, (to - from) / 4.2);
    this.writeSnap(this.live, 0);
    this.ballFx.clearTrail();
    this.replay = { from, to, t: from, speed, cam, focus: this.markPos.clone(), hold: 0.35 };
    return true;
  }

  get replaying(): boolean {
    return this.replay !== null;
  }

  stopReplay() {
    if (!this.replay) return;
    this.replay = null;
    // Restore the live state.
    this.applySnap(this.live, 0, 0, 0, 0);
    this.all((a) => a.apply());
    this.stadium.strikerStumps.show(this.stadium.strikerStumps.isBroken ? this.stadium.strikerStumps.time : -1);
    this.stadium.bowlerStumps.show(this.stadium.bowlerStumps.isBroken ? this.stadium.bowlerStumps.time : -1);
    this.ballFx.trailOn = false;
    this.ballFx.clearTrail();
  }

  private stepReplay(dt: number) {
    const r = this.replay!;
    if (r.hold > 0) r.hold -= dt;
    else r.t += dt * r.speed;
    if (r.t >= r.to) {
      this.stopReplay();
      return;
    }
    // Find the frames around r.t.
    let i = 0;
    while (i < this.recN - 2 && this.recTimes[i + 1] < r.t) i++;
    const t0 = this.recTimes[i];
    const t1 = this.recTimes[i + 1];
    const k = t1 > t0 ? Math.min(1, Math.max(0, (r.t - t0) / (t1 - t0))) : 0;
    this.applySnap(this.rec, i * SNAP, (i + 1) * SNAP, k, dt * r.speed);
    this.ballFx.updateTrail();
  }

  private replayCamera() {
    const r = this.replay!;
    const off = this.ctx ? -legSign(this.ctx.striker.hand) : -1;
    const b = this.ballFx.mesh.position;
    if (r.cam === 'side') {
      this.desPos.set(off * 7.5, 1.7, STRIKER_CREASE_Z + 4.4);
      this.desLook.set(0, 0.8, STRIKER_STUMPS_Z + 0.5);
      this.desFov = this.aspect < 1 ? 34 : 22;
    } else if (r.cam === 'end') {
      const z = r.focus.z;
      this.desPos.set(9, 2.2, z + (z > 0 ? -3 : 3));
      this.desLook.set(0, 0.7, z);
      this.desFov = this.aspect < 1 ? 36 : 24;
    } else {
      const dx = r.focus.x;
      const dz = r.focus.z - STRIKER_CREASE_Z;
      const d = Math.hypot(dx, dz) || 1;
      this.desPos.set(-(dx / d) * 15, 5.5, STRIKER_CREASE_Z - (dz / d) * 15);
      this.desLook.set(b.x, Math.max(1.2, b.y), b.z);
      this.desFov = this.aspect < 1 ? 40 : 30;
    }
  }

  /** Test support: positions used by the headless test. */
  debugState() {
    return {
      striker: this.striker ? { x: this.striker.x, z: this.striker.z, mirrored: this.striker.fig.mirrored } : null,
      ball: { x: this.ballFx.mesh.position.x, y: this.ballFx.mesh.position.y, z: this.ballFx.mesh.position.z },
      replaying: this.replaying,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
}

export { BAT_Z, IDEAL_TAP_DIST };
