import { aiBatPlan, type BatPlan, type Situation } from './ai';
import { Delivery, slowFactor, type DeliverySpec } from './delivery';
import {
  BAT_Z,
  BOWLER_CREASE_Z,
  BOWLER_STUMPS_Z,
  IDEAL_TAP_DIST,
  STRIKER_CREASE_Z,
  STRIKER_STUMPS_Z,
  getField,
  keeperSpot,
} from './field';
import { pathAt, planFielding, simulatePath, throwTime, type BallPath, type Fielder, type FieldingPlan } from './fielding';
import type { Rng } from './rng';
import { TIMING_BANDS, resolvePass, resolveShot, timingWindow, type PassResult, type ShotResult, type ShotType } from './shot';
import type { BallEvent, Difficulty, Phase, Player, TeamSheet, Vec3, Wicket } from './types';

export interface BallContext {
  rng: Rng;
  difficulty: Difficulty;
  striker: Player;
  nonStriker: Player;
  bowler: Player;
  /** 11 fielders: 9 in the field, the keeper and the bowler. */
  fielders: Fielder[];
  spec: DeliverySpec;
  freeHit: boolean;
  /** True if a person bats. If false, the computer bats and runs. */
  userBatting: boolean;
  situation: Situation;
}

export type SimEvent =
  | { type: 'release' }
  | { type: 'bounce'; pos: Vec3 }
  | { type: 'swing'; shot: ShotResult; contactIn: number }
  | { type: 'leave' }
  | { type: 'contact'; shot: ShotResult }
  | { type: 'bowled'; out: boolean }
  | { type: 'pad'; out: boolean }
  | { type: 'keeperTake' }
  | { type: 'stumped'; out: boolean }
  | { type: 'landed'; pos: Vec3 }
  | { type: 'fielded'; fielder: number; dive: boolean }
  | { type: 'catch'; fielder: number; out: boolean; dive: boolean }
  | { type: 'drop'; fielder: number }
  | { type: 'boundary'; runs: 4 | 6 }
  | { type: 'throw'; fielder: number; end: 'striker' | 'bowler' }
  | { type: 'arrive'; end: 'striker' | 'bowler' }
  | { type: 'runStart' }
  | { type: 'runComplete'; runs: number }
  | { type: 'runOut'; end: 'striker' | 'bowler'; batterId: string }
  | { type: 'dead' };

export interface BallOutcome {
  event: BallEvent;
  text: string;
  detail: string;
  shot: ShotResult | null;
  speedKmh: number;
  runs: number;
  four: boolean;
  six: boolean;
  wicket: Wicket | null;
  wide: boolean;
  noBall: boolean;
  /** True when a dismissal did not count because of a free hit or a no-ball. */
  saved: boolean;
}

interface Move {
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  t0: number;
  t1: number;
}

export type SimPhase = 'runup' | 'flight' | 'play' | 'settle' | 'done';

const RUN_FIRST = 2.9;
const RUN_NEXT = 3.05;

/** Builds the fielding side for one delivery. */
export function buildFielders(
  team: TeamSheet,
  bowler: Player,
  striker: Player,
  phase: Phase,
  difficulty: Difficulty,
): Fielder[] {
  const kind = bowler.bowl!.kind;
  const spots = getField(phase, kind, striker.hand);
  const others = team.xi.filter((pl) => pl.id !== bowler.id && pl.id !== team.keeperId);
  const out: Fielder[] = spots.map((s, i) => {
    const deep = Math.hypot(s.x, s.z) > 40;
    return { id: others[i % others.length].id, spot: s.name, x: s.x, z: s.z, speed: 6.3, react: deep ? 0.48 : 0.38 };
  });
  const k = keeperSpot(kind);
  out.push({ id: team.keeperId, spot: k.name, x: k.x, z: k.z, speed: 5.6, react: 0.2, keeper: true });
  const arm = bowler.bowl!.arm === 'R' ? -1 : 1;
  out.push({ id: bowler.id, spot: 'bowler', x: arm * 2.3, z: 5.2, speed: 6, react: 0.8, bowler: true });
  void difficulty;
  return out;
}

/** Real-time simulation of one delivery. It has no rendering code. */
export class BallSim {
  readonly ctx: BallContext;
  readonly delivery: Delivery;
  readonly runupTime: number;
  phase: SimPhase = 'runup';
  /** Time since the start of the run-up (game seconds). */
  t = 0;
  ball: Vec3;
  ballVisible = true;
  shot: ShotResult | null = null;
  swung = false;
  path: BallPath | null = null;
  plan: FieldingPlan | null = null;
  outcome: BallOutcome | null = null;
  /** Completed runs. */
  runsDone = 0;
  running = false;
  runT = 0;
  runDur = RUN_FIRST;

  private events: SimEvent[] = [];
  private aiPlan: BatPlan | null = null;
  private aiSwingT = 0;
  private bounced = false;
  private contactDone = false;
  private contactT: number;
  private pass: PassResult | null = null;
  private passT = 0;
  private passDone = false;
  private leaveEmitted = false;
  private tContact = 0;
  private landed = false;
  private fieldResolved = false;
  private holding = false;
  private throwAt = 0;
  private throwing = false;
  private throwStart = 0;
  private throwDur = 0;
  private throwFrom: Vec3 = { x: 0, y: 0, z: 0 };
  private throwEnd: 'striker' | 'bowler' = 'striker';
  private arrived = false;
  private boundary: 0 | 4 | 6 = 0;
  private caught = false;
  private wicket: Wicket | null = null;
  private saved = false;
  private settleUntil = 0;
  private moves: (Move | null)[];
  private fieldOpts: { catchSkill: number; speedScale: number };
  private playedType: ShotType | 'leave' = 'leave';

  constructor(ctx: BallContext) {
    this.ctx = ctx;
    this.delivery = new Delivery(ctx.spec, slowFactor(ctx.spec.kind, ctx.difficulty));
    this.runupTime = ctx.spec.kind === 'pace' ? 2.3 : 1.6;
    this.ball = { ...this.delivery.release };
    this.contactT = this.delivery.tBat;
    this.moves = ctx.fielders.map(() => null);
    const d = ctx.difficulty;
    // The difficulty helps or hinders the player on both sides of the game.
    this.fieldOpts = ctx.userBatting
      ? d === 'easy'
        ? { catchSkill: 0.84, speedScale: 0.9 }
        : d === 'hard'
          ? { catchSkill: 1.04, speedScale: 1.05 }
          : { catchSkill: 1, speedScale: 1 }
      : d === 'easy'
        ? { catchSkill: 1.04, speedScale: 1.04 }
        : d === 'hard'
          ? { catchSkill: 0.92, speedScale: 0.95 }
          : { catchSkill: 1, speedScale: 1 };
    if (!ctx.userBatting) {
      this.aiPlan = aiBatPlan(this.delivery, ctx.striker, ctx.bowler, ctx.fielders, ctx.situation, d, ctx.rng, ctx.freeHit);
      this.aiSwingT = Math.max(0.04, this.delivery.timeAtZ(BAT_Z + IDEAL_TAP_DIST + this.aiPlan.timingErr));
    }
  }

  // ---------- Queries ----------

  /** Time since the release. Negative during the run-up. */
  get flightT(): number {
    return this.t - this.runupTime;
  }

  /** Distance of the ball in front of the bat plane. */
  get ballDist(): number {
    return this.ball.z - BAT_Z;
  }

  /** Half-width (m) of the "good" timing zone for the batter. */
  zoneHalfWidth(type: ShotType = 'ground'): number {
    return TIMING_BANDS.good * timingWindow(this.ctx.striker, this.ctx.difficulty, this.ctx.userBatting, type);
  }

  /** True while a tap gives good or perfect timing. */
  get ballInZone(): boolean {
    return this.phase === 'flight' && !this.contactDone && Math.abs(this.ballDist - IDEAL_TAP_DIST) <= this.zoneHalfWidth();
  }

  get canSwing(): boolean {
    return this.phase === 'flight' && !this.swung && !this.contactDone;
  }

  get canRun(): boolean {
    return this.phase === 'play' && !this.running && !this.arrived && !this.boundary && !this.caught && !this.wicket;
  }

  /** Time since the bat hit the ball. */
  get playT(): number {
    return this.t - this.tContact;
  }

  /** Position of the original striker along the pitch: 0 = striker's end, 1 = bowler's end. */
  get strikerProgress(): number {
    const k = this.running ? Math.min(1, this.runT / this.runDur) : 0;
    const eased = k;
    return this.runsDone % 2 === 0 ? eased : 1 - eased;
  }

  fielderPos(i: number): { x: number; z: number; moving: boolean } {
    const f = this.ctx.fielders[i];
    const m = this.moves[i];
    if (!m || this.phase === 'runup' || this.phase === 'flight') return { x: f.x, z: f.z, moving: false };
    const tp = this.playT;
    if (tp <= m.t0) return { x: m.fx, z: m.fz, moving: false };
    if (tp >= m.t1) return { x: m.tx, z: m.tz, moving: false };
    const k = (tp - m.t0) / (m.t1 - m.t0);
    return { x: m.fx + (m.tx - m.fx) * k, z: m.fz + (m.tz - m.fz) * k, moving: true };
  }

  /** Seconds until the fielder throws. Negative if no throw is pending. */
  get throwIn(): number {
    return this.holding ? this.throwAt - this.playT : -1;
  }

  get isCaught(): boolean {
    return this.caught;
  }

  get isBoundary(): 0 | 4 | 6 {
    return this.boundary;
  }

  get hasContact(): boolean {
    return this.path !== null;
  }

  /** Advice for the running call. */
  runHint(): 'none' | 'safe' | 'tight' | 'danger' {
    if (!this.canRun || !this.plan) return 'none';
    const m = this.runMargin();
    return m > 0.5 ? 'safe' : m > -0.05 ? 'tight' : 'danger';
  }

  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- Commands ----------

  /** The batter swings now. The timing comes from the position of the ball at this moment. */
  swing(type: ShotType, angle: number): boolean {
    if (!this.canSwing) return false;
    this.swung = true;
    this.playedType = type;
    const tf = this.flightT;
    this.ball = this.delivery.pos(tf);
    const shot = resolveShot(
      { type, angle, ballDist: this.ballDist },
      {
        delivery: this.delivery,
        batter: this.ctx.striker,
        bowler: this.ctx.bowler,
        difficulty: this.ctx.difficulty,
        human: this.ctx.userBatting,
        rng: this.ctx.rng,
      },
    );
    this.shot = shot;
    this.contactT = Math.max(tf, this.delivery.tBat);
    this.emit({ type: 'swing', shot, contactIn: this.contactT - tf });
    return true;
  }

  callRun(): boolean {
    if (!this.canRun) return false;
    this.running = true;
    this.runT = 0;
    this.runDur = this.runsDone === 0 ? RUN_FIRST : RUN_NEXT;
    this.emit({ type: 'runStart' });
    return true;
  }

  step(dt: number): void {
    if (this.phase === 'done') return;
    this.t += dt;
    if (this.phase === 'runup') {
      if (this.t >= this.runupTime) {
        this.phase = 'flight';
        this.emit({ type: 'release' });
      } else return;
    }
    if (this.phase === 'flight') this.stepFlight();
    else if (this.phase === 'play') this.stepPlay(dt);
    else if (this.phase === 'settle') {
      if (this.pass && !this.boundary) this.stepPassBall();
      else if (this.boundary && this.path) this.ball = pathAt(this.path, this.playT);
      if (this.running) this.stepRunner(dt);
      if (this.t >= this.settleUntil) this.finish();
    }
  }

  // ---------- Flight ----------

  private stepFlight(): void {
    const tf = this.flightT;
    const d = this.delivery;
    if (this.aiPlan && !this.swung && !this.contactDone) {
      if (this.aiPlan.leave) {
        if (!this.leaveEmitted && tf >= d.tBat - 0.4) {
          this.leaveEmitted = true;
          this.emit({ type: 'leave' });
        }
      } else if (tf >= this.aiSwingT) this.swing(this.aiPlan.type, this.aiPlan.angle);
    }
    this.ball = d.pos(tf);
    if (!this.bounced && tf >= d.tPitch && d.pitch.z > STRIKER_STUMPS_Z) {
      this.bounced = true;
      this.emit({ type: 'bounce', pos: { ...d.pitch } });
    }
    if (!this.contactDone && tf >= this.contactT) {
      this.contactDone = true;
      if (this.shot && this.shot.contact !== 'miss') {
        this.startPlay(tf);
        return;
      }
      if (!this.swung && !this.leaveEmitted) {
        this.leaveEmitted = true;
        this.emit({ type: 'leave' });
      }
      this.pass = resolvePass(d, this.ctx.striker, this.playedType, this.ctx.rng);
      const k = this.pass.kind;
      this.passT = k === 'lbw' || k === 'pad' ? d.timeAtZ(STRIKER_CREASE_Z) : k === 'bowled' ? d.tStumps : d.timeAtZ(this.keeperZ() + 0.35);
    }
    if (this.pass && !this.passDone && tf >= this.passT) this.resolvePassNow();
  }

  private keeperZ(): number {
    return this.ctx.fielders.find((f) => f.keeper)!.z;
  }

  private stepPassBall(): void {
    // After the pass is resolved the ball stays where it stopped.
    const tf = Math.min(this.flightT, this.passT);
    this.ball = this.delivery.pos(tf);
    if (this.pass && (this.pass.kind === 'lbw' || this.pass.kind === 'pad' || this.pass.kind === 'bowled')) {
      const since = this.flightT - this.passT;
      this.ball.y = Math.max(0.04, this.ball.y - since * 1.6);
    }
  }

  private resolvePassNow(): void {
    this.passDone = true;
    const k = this.pass!.kind;
    const protectedBall = this.ctx.freeHit || this.ctx.spec.noBall;
    const keeper = this.ctx.fielders.find((f) => f.keeper)!;
    this.ball = this.delivery.pos(this.passT);
    let settle = 0.9;
    if (k === 'bowled') {
      this.emit({ type: 'bowled', out: !protectedBall });
      if (protectedBall) this.saved = true;
      else this.wicket = { kind: 'bowled', batterId: this.ctx.striker.id };
      settle = 1.3;
    } else if (k === 'lbw') {
      this.emit({ type: 'pad', out: !protectedBall });
      if (protectedBall) this.saved = true;
      else this.wicket = { kind: 'lbw', batterId: this.ctx.striker.id };
      settle = 1.4;
    } else if (k === 'pad') {
      this.emit({ type: 'pad', out: false });
    } else {
      this.emit({ type: 'keeperTake' });
      if (k === 'stumped') {
        this.emit({ type: 'stumped', out: !protectedBall });
        if (protectedBall) this.saved = true;
        else this.wicket = { kind: 'stumped', batterId: this.ctx.striker.id, fielderId: keeper.id };
        settle = 1.3;
      }
    }
    this.phase = 'settle';
    this.settleUntil = this.t + settle;
  }

  // ---------- Play after contact ----------

  private startPlay(tf: number): void {
    const shot = this.shot!;
    const p = this.delivery.pos(tf);
    const start = { x: p.x, y: Math.min(1.9, Math.max(0.18, p.y)), z: p.z };
    this.tContact = this.t;
    this.path = simulatePath(start, shot.speed, shot.angle, shot.elev);
    this.plan = planFielding(this.path, this.ctx.fielders, this.ctx.rng, this.fieldOpts);
    this.planMoves();
    this.ball = start;
    this.phase = 'play';
    this.emit({ type: 'contact', shot });
    if (!this.ctx.userBatting) this.aiConsiderRun();
  }

  private planMoves(): void {
    const plan = this.plan!;
    const fs = this.ctx.fielders;
    const sp = this.fieldOpts.speedScale;
    const set = (i: number, tx: number, tz: number, tArrive?: number) => {
      const f = fs[i];
      const dist = Math.hypot(tx - f.x, tz - f.z);
      const dur = dist / (f.speed * sp);
      const t0 = f.react;
      const t1 = tArrive !== undefined ? Math.max(t0 + 0.05, Math.min(tArrive, t0 + dur + 0.4)) : t0 + dur;
      this.moves[i] = { fx: f.x, fz: f.z, tx, tz, t0: Math.min(t0, t1 - 0.05), t1 };
    };
    if (plan.fielder >= 0) set(plan.fielder, plan.pos.x, plan.pos.z, plan.t);
    if (plan.backup >= 0 && plan.backup !== plan.fielder) {
      const end = this.path!.samples[this.path!.boundary ? this.path!.boundaryIndex : this.path!.samples.length - 1];
      const f = fs[plan.backup];
      // The backup fielder runs toward the ball but stops short of the first fielder.
      const k = 0.75;
      set(plan.backup, f.x + (end.x - f.x) * k, f.z + (end.z - f.z) * k);
    }
    fs.forEach((f, i) => {
      if (i === plan.fielder) return;
      if (f.keeper) set(i, 0.25, STRIKER_STUMPS_Z - 0.7);
      else if (f.bowler) set(i, 0.45, BOWLER_STUMPS_Z - 0.7);
    });
  }

  private stepRunner(dt: number): void {
    this.runT += dt;
    if (this.runT >= this.runDur) {
      this.running = false;
      this.runsDone += 1;
      this.emit({ type: 'runComplete', runs: this.runsDone });
      if (!this.ctx.userBatting && this.phase === 'play') this.aiConsiderRun();
    }
  }

  private stepPlay(dt: number): void {
    const plan = this.plan!;
    const path = this.path!;
    const tp = this.playT;
    if (this.running) this.stepRunner(dt);

    if (!this.fieldResolved) {
      if (tp < plan.t) {
        this.ball = pathAt(path, tp);
        if (!this.landed && path.tFirstBounce > 0 && tp >= path.tFirstBounce) {
          this.landed = true;
          this.emit({ type: 'landed', pos: { ...this.ball, y: 0 } });
        }
        return;
      }
      this.fieldResolved = true;
      const protectedBall = this.ctx.freeHit || this.ctx.spec.noBall;
      switch (plan.kind) {
        case 'boundary':
          this.boundary = path.boundary as 4 | 6;
          this.emit({ type: 'boundary', runs: this.boundary });
          this.phase = 'settle';
          this.settleUntil = this.t + (this.boundary === 6 ? 2.0 : 1.3);
          return;
        case 'catch': {
          this.ball = { ...plan.pos };
          const f = this.ctx.fielders[plan.fielder];
          this.emit({ type: 'catch', fielder: plan.fielder, out: !protectedBall, dive: plan.dive });
          if (protectedBall) {
            this.saved = true;
          } else {
            this.caught = true;
            this.wicket = { kind: f.keeper ? 'caughtBehind' : 'caught', batterId: this.ctx.striker.id, fielderId: f.id };
          }
          this.arrived = true;
          this.phase = 'settle';
          this.settleUntil = this.t + 1.3;
          return;
        }
        case 'drop':
          this.ball = { ...plan.pos, y: 0.05 };
          this.emit({ type: 'drop', fielder: plan.fielder });
          break;
        default:
          this.ball = { ...plan.pos };
          this.emit({ type: 'fielded', fielder: plan.fielder, dive: plan.dive });
      }
      this.holding = true;
      this.throwAt = plan.t + plan.delay;
      return;
    }

    if (this.holding) {
      if (tp >= this.throwAt - 0.25) this.ball = { x: plan.pos.x, y: 1.3, z: plan.pos.z };
      if (tp >= this.throwAt) this.launchThrow(tp);
      return;
    }
    if (this.throwing) {
      const k = Math.min(1, (tp - this.throwStart) / this.throwDur);
      const z1 = this.throwEnd === 'striker' ? STRIKER_STUMPS_Z : BOWLER_STUMPS_Z;
      const arc = Math.min(6, this.throwDur * this.throwDur * 1.2);
      this.ball = {
        x: this.throwFrom.x + (0 - this.throwFrom.x) * k,
        y: this.throwFrom.y + (0.75 - this.throwFrom.y) * k + arc * 4 * k * (1 - k),
        z: this.throwFrom.z + (z1 - this.throwFrom.z) * k,
      };
      if (k >= 1) this.arrive();
      return;
    }
    if (this.arrived && !this.running) {
      this.emit({ type: 'dead' });
      this.phase = 'settle';
      this.settleUntil = this.t + 0.7;
    }
  }

  /** Which end each batter runs to during the current or next run. */
  private headingTo(who: 'striker' | 'nonStriker'): 'striker' | 'bowler' {
    const even = this.runsDone % 2 === 0;
    if (who === 'striker') return even ? 'bowler' : 'striker';
    return even ? 'striker' : 'bowler';
  }

  private launchThrow(tp: number): void {
    const plan = this.plan!;
    const from = { x: plan.pos.x, y: 1.5, z: plan.pos.z };
    const ts = throwTime(from, 'striker');
    const tb = throwTime(from, 'bowler');
    // The nearer end gives the best chance of a run out. With no run on, prefer the keeper.
    const end: 'striker' | 'bowler' = ts <= tb + (this.running ? 0 : 0.15) ? 'striker' : 'bowler';
    this.holding = false;
    this.throwing = true;
    this.throwStart = tp;
    this.throwDur = end === 'striker' ? ts : tb;
    this.throwFrom = from;
    this.throwEnd = end;
    this.emit({ type: 'throw', fielder: plan.fielder, end });
  }

  private arrive(): void {
    this.throwing = false;
    this.arrived = true;
    this.emit({ type: 'arrive', end: this.throwEnd });
    if (!this.running) return;
    const remaining = this.runDur - this.runT;
    const rng = this.ctx.rng;
    const strikerTo = this.headingTo('striker');
    const atThrowEnd = strikerTo === this.throwEnd ? this.ctx.striker : this.ctx.nonStriker;
    const other = atThrowEnd === this.ctx.striker ? this.ctx.nonStriker : this.ctx.striker;
    let out: Player | null = null;
    let end = this.throwEnd;
    if (remaining > 0.3 || (remaining > 0.06 && rng.chance(0.55))) out = atThrowEnd;
    else if (remaining > 1.0 && rng.chance(0.8)) {
      out = other;
      end = this.throwEnd === 'striker' ? 'bowler' : 'striker';
    }
    if (out) {
      this.running = false;
      this.wicket = { kind: 'runOut', batterId: out.id, fielderId: this.ctx.fielders[this.plan!.fielder].id };
      this.emit({ type: 'runOut', end, batterId: out.id });
      this.phase = 'settle';
      this.settleUntil = this.t + 1.4;
    }
  }

  /** Time margin for one more run. Positive = the batters get home before the ball. */
  private runMargin(): number {
    const plan = this.plan!;
    const tp = this.playT;
    const dur = this.runsDone === 0 ? RUN_FIRST : RUN_NEXT;
    if (plan.kind === 'boundary') return 9;
    if (plan.kind === 'catch') return 0.1;
    let arriveIn: number;
    if (this.throwing) arriveIn = this.throwStart + this.throwDur - tp;
    else {
      const from = { x: plan.pos.x, y: 1.5, z: plan.pos.z };
      arriveIn = Math.max(plan.t + plan.delay - tp, 0) + Math.min(throwTime(from, 'striker'), throwTime(from, 'bowler'));
    }
    return arriveIn - dur;
  }

  private aiConsiderRun(): void {
    if (!this.canRun) return;
    const plan = this.plan!;
    if (plan.kind === 'boundary' || plan.kind === 'catch') return;
    const rng = this.ctx.rng;
    let safety = 0.32 + Math.abs(rng.gauss()) * 0.14;
    if (rng.chance(0.025)) safety = -0.45;
    if (this.runMargin() > safety) this.callRun();
  }

  // ---------- End ----------

  private finish(): void {
    const { ctx } = this;
    const spec = ctx.spec;
    const shot = this.shot;
    const wide = !!this.pass && this.pass.kind === 'wide' && !spec.noBall;
    let runsBat = 0;
    if (this.boundary) runsBat = this.boundary;
    else if (!this.caught) runsBat = this.runsDone;
    const event: BallEvent = { runsBat, boundary: this.boundary, wide, noBall: spec.noBall };
    if (this.wicket) {
      event.wicket = this.wicket;
      if (this.wicket.kind === 'runOut') event.swapEnds = (this.runsDone + 1) % 2 === 1;
      else event.swapEnds = false;
    }
    if (this.path && this.plan && shot && shot.contact !== 'miss') {
      const p = this.boundary ? this.path.samples[this.path.boundaryIndex] : this.plan.pos;
      event.angle = Math.atan2(p.x, p.z - STRIKER_CREASE_Z);
      event.dist = Math.hypot(p.x, p.z - STRIKER_CREASE_Z);
    }
    const fielderName = (id?: string) => ctx.fielders.find((f) => f.id === id);
    let text: string;
    let detail = shot && shot.contact !== 'miss' ? shot.name : '';
    if (this.wicket) {
      const k = this.wicket.kind;
      text = 'OUT!';
      const spot = fielderName(this.wicket.fielderId)?.spot;
      detail =
        k === 'bowled'
          ? 'Bowled'
          : k === 'lbw'
            ? 'LBW'
            : k === 'caught'
              ? `Caught at ${spot}`
              : k === 'caughtBehind'
                ? 'Caught behind'
                : k === 'stumped'
                  ? 'Stumped'
                  : 'Run out';
    } else if (wide) {
      text = 'WIDE';
      detail = '';
    } else if (this.boundary === 6) text = 'SIX!';
    else if (this.boundary === 4) text = 'FOUR!';
    else if (runsBat === 0) text = spec.noBall ? 'NO-BALL' : 'No run';
    else text = `${runsBat} run${runsBat > 1 ? 's' : ''}`;
    if (spec.noBall && !wide && text !== 'NO-BALL') text = `NO-BALL + ${text}`;
    if (this.saved) detail = ctx.freeHit ? 'Free hit: not out' : 'No-ball: not out';
    this.outcome = {
      event,
      text,
      detail,
      shot,
      speedKmh: spec.speedKmh,
      runs: runsBat + (wide ? 1 : 0) + (event.noBall ? 1 : 0),
      four: this.boundary === 4,
      six: this.boundary === 6,
      wicket: this.wicket,
      wide,
      noBall: !!event.noBall,
      saved: this.saved,
    };
    this.phase = 'done';
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }
}

export { BOWLER_CREASE_Z };
