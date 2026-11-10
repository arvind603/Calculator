import { World } from '../render/world';
import { VARIATIONS, VARIATION_LABEL, aiChooseBowler, type BowlInput } from '../sim/ai';
import { BallSim, type BallContext, type BallOutcome, type SimEvent } from '../sim/ballsim';
import type { DeliverySpec, Variation } from '../sim/delivery';
import { STRIKER_STUMPS_Z, legSign } from '../sim/field';
import { makeBallContext, nextAiDelivery, nextUserDelivery } from '../sim/flow';
import { Match, type BallSummary } from '../sim/match';
import { Rng, clamp } from '../sim/rng';
import type { ShotType } from '../sim/shot';
import { defaultXi, makeTeam } from '../sim/squads';
import type { Player, TeamId } from '../sim/types';
import { UI, type StartOptions } from '../ui/ui';
import { Sfx } from './audio';

type State = 'menu' | 'pickBowler' | 'prepare' | 'bowlAim' | 'bowlMeter' | 'ball' | 'result' | 'replay' | 'break' | 'end';

const USER: TeamId = 'RCB';
const METER_CENTRE = 0.48;
const METER_NOBALL = 0.92;

export class Game {
  readonly world: World;
  readonly ui: UI;
  readonly sfx = new Sfx();
  match: Match | null = null;
  sim: BallSim | null = null;
  state: State = 'menu';
  timeScale = 1;
  paused = false;
  lastOutcome: BallOutcome | null = null;
  /** Test hook: called after every simulation step. */
  onStep: (() => void) | null = null;

  private canvas: HTMLCanvasElement;
  private rng = new Rng((Date.now() ^ 0x5f3759df) >>> 0);
  private xi: Player[] = defaultXi('RCB');
  private ctx: BallContext | null = null;
  private stateT = 0;
  private wait = 0;
  private shotType: ShotType = 'ground';
  private keys = new Set<string>();
  private swipe: { x: number; y: number; id: number } | null = null;
  private variation: Variation = 'stock';
  private target = { x: 0, length: 6.4 };
  private meterT = 0;
  private meterPeriod = 1.3;
  private summary: BallSummary | null = null;
  private wantReplay = false;
  private pendingFreeHit = false;
  private last = 0;
  private w = 1;
  private h = 1;
  private pixelRatio = 1;
  private slowFrames = 0;
  private frames = 0;
  private fps = 60;
  private fpsT = 0;
  private fpsN = 0;
  private testMode: boolean;
  private bannerT = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    const q = new URLSearchParams(location.search);
    this.testMode = q.has('test');
    this.world = new World(canvas, this.testMode);
    this.ui = new UI(uiRoot, {
      start: (o) => this.startMatch(o),
      saveXi: (xi) => (this.xi = xi),
      shotType: (t) => this.setShotType(t),
      run: () => this.callRun(),
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      quit: () => this.toMenu(),
      sound: (on) => {
        this.sfx.unlock();
        this.sfx.setEnabled(on);
      },
      pickBowler: (id) => this.pickBowler(id),
      variation: (v) => this.setVariation(v),
      bowl: () => this.bowlPress(),
      next: () => this.startChase(),
      skipReplay: () => this.world.stopReplay(),
      uiClick: () => {
        this.sfx.unlock();
        this.sfx.click();
      },
    });
    this.pixelRatio = this.testMode ? 0.5 : Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', () => (this.swipe = null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state !== 'menu' && this.state !== 'end' && this.state !== 'break') this.setPaused(true);
    });
    this.world.snapCamera();
    this.ui.showMenu(this.xi);
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- Match flow ----------

  private startMatch(o: StartOptions) {
    this.sfx.unlock();
    const teams = { RCB: makeTeam('RCB', this.xi), CSK: makeTeam('CSK', defaultXi('CSK')) };
    this.match = new Match({ overs: o.overs, difficulty: o.difficulty, battingFirst: o.batFirst ? 'RCB' : 'CSK', teams });
    this.sim = null;
    this.lastOutcome = null;
    this.world.mode = 'live';
    this.ui.showHud(true);
    this.ui.banner(null);
    this.ui.updateScore(this.match);
    this.sfx.cheer(0.5, 2);
    this.nextBall(true);
  }

  private toMenu() {
    this.paused = false;
    this.match = null;
    this.sim = null;
    this.state = 'menu';
    this.world.stopReplay();
    this.world.clearPlayers();
    this.world.mode = 'menu';
    this.ui.replay(false);
    this.ui.showMenu(this.xi);
  }

  private get userBats(): boolean {
    return !!this.match && this.match.current.battingTeam === USER;
  }

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  private nextBall(instant = false) {
    const m = this.match!;
    if (m.complete) return this.finishMatch();
    if (m.current.complete) return this.inningsBreak();
    const inn = m.current;
    if (m.needsBowler) {
      if (this.userBats) {
        const b = aiChooseBowler(m, this.rng);
        m.setBowler(b.id);
        this.ui.toast(b.short, b.bowl!.label, 'plain', 1500);
      } else {
        this.setState('pickBowler');
        this.ui.setPanel('none');
        this.ui.showBowlerPicker(m);
        this.ui.updateScore(m);
        return;
      }
    }
    this.ui.updateScore(m);
    this.ui.banner(inn.freeHit ? 'FREE HIT' : null);
    const battingTeam = inn.battingTeam;
    const bowlingTeam = inn.bowlingTeam;
    if (this.userBats) {
      const spec = nextAiDelivery(m, this.rng);
      this.ctx = makeBallContext(m, spec, this.rng, USER);
      const dur = this.world.prepareBall(this.ctx, battingTeam, bowlingTeam, instant);
      this.world.mode = 'live';
      this.world.marker.group.visible = false;
      this.wait = Math.max(dur, 0.9) + 0.5;
      this.ui.setPanel('bat');
      this.ui.setHint('Tap around the batter when the ball is in the lit zone');
      this.setState('prepare');
    } else {
      const bowler = m.player(inn.bowlerId!);
      const striker = m.player(inn.strikerId!);
      const kind = bowler.bowl!.kind;
      if (!VARIATIONS[kind].includes(this.variation)) this.variation = 'stock';
      const side = legSign(striker.hand);
      this.target = { x: -side * 0.18 - (kind === 'spin' ? (bowler.bowl!.turn ?? 1) * 0.22 : 0), length: kind === 'pace' ? 6.4 : 4.9 };
      this.ctx = makeBallContext(m, this.placeholderSpec(bowler), this.rng, USER);
      this.world.prepareBall(this.ctx, battingTeam, bowlingTeam, instant);
      this.world.mode = 'aim';
      this.showTarget();
      this.ui.setPanel('bowl');
      this.ui.showBowlPanel(bowler, kind, this.variation, 'aim');
      this.setState('bowlAim');
    }
  }

  private placeholderSpec(bowler: Player): DeliverySpec {
    const st = bowler.bowl!;
    return { kind: st.kind, arm: st.arm, variation: 'stock', speedKmh: st.speed[0], pitchX: 0, length: 6, swing: 0, cut: 0, noBall: false };
  }

  private showTarget() {
    const mk = this.world.marker;
    mk.group.visible = true;
    mk.set(this.target.x, STRIKER_STUMPS_Z + this.target.length);
    mk.setSpread(0.5);
  }

  private pickBowler(id: string) {
    const m = this.match;
    if (!m || this.state !== 'pickBowler') return;
    if (!m.eligibleBowlers().some((p) => p.id === id)) return;
    m.setBowler(id);
    this.ui.closeSheet();
    this.nextBall();
  }

  private setVariation(v: Variation) {
    if (this.state !== 'bowlAim' || !this.match) return;
    this.variation = v;
    const b = this.match.player(this.match.current.bowlerId!);
    this.ui.showBowlPanel(b, b.bowl!.kind, v, 'aim');
  }

  private bowlPress() {
    const m = this.match;
    if (!m) return;
    const bowler = m.player(m.current.bowlerId!);
    if (this.state === 'bowlAim') {
      const d = m.config.difficulty;
      this.meterPeriod = 1.25 * (0.75 + bowler.bowling / 220) * (d === 'easy' ? 1.3 : d === 'hard' ? 0.8 : 1);
      this.meterT = 0;
      this.ui.showBowlPanel(bowler, bowler.bowl!.kind, this.variation, 'meter');
      this.setState('bowlMeter');
    } else if (this.state === 'bowlMeter' && this.stateT > 0.12) {
      const pos = this.meterPos();
      const input: BowlInput = {
        variation: this.variation,
        x: this.target.x,
        length: this.target.length,
        accuracy: clamp(1 - Math.abs(pos - METER_CENTRE) / METER_CENTRE, 0, 1),
        overstep: pos >= METER_NOBALL,
      };
      const spec = nextUserDelivery(m, input, this.rng);
      this.ctx = makeBallContext(m, spec, this.rng, USER);
      this.world.prepareBall(this.ctx, m.current.battingTeam, m.current.bowlingTeam, false);
      this.world.mode = 'live';
      this.world.marker.group.visible = false;
      this.ui.showBowlPanel(bowler, bowler.bowl!.kind, this.variation, 'done');
      this.startSim();
    }
  }

  private meterPos(): number {
    const k = (this.meterT / this.meterPeriod) % 2;
    return k < 1 ? k : 2 - k;
  }

  private startSim() {
    this.sim = new BallSim(this.ctx!);
    this.setState('ball');
  }

  private onBallDone() {
    const m = this.match!;
    const sim = this.sim!;
    const o = sim.outcome!;
    this.lastOutcome = o;
    const wasUserBatting = this.userBats;
    this.summary = m.applyBall(o.event);
    this.ui.updateScore(m);
    this.ui.showRun('none', 0, false);
    const kind = o.wicket ? 'out' : o.six ? 'six' : o.four ? 'four' : 'plain';
    this.ui.toast(o.text, o.detail, kind, o.wicket || o.six || o.four ? 2200 : 1500);
    if (o.wicket) this.world.signal('out');
    else if (o.six) this.world.signal('six');
    else if (o.four) this.world.signal('four');
    else if (o.wide) this.world.signal('wide');
    else if (o.noBall) this.world.signal('noball');
    if (wasUserBatting && o.shot) this.ui.timing(o.shot.timingNorm, o.shot.timing);
    // Crowd: louder for the player's team.
    if (o.wicket) this.sfx.cheer(wasUserBatting ? 0.45 : 1, 2.6);
    else if (o.six) this.sfx.cheer(wasUserBatting ? 1 : 0.5, 3);
    else if (o.four) this.sfx.cheer(wasUserBatting ? 0.75 : 0.4, 2.2);
    this.wantReplay = (!!o.wicket || o.six) && this.world.canReplay;
    this.pendingFreeHit = m.current.freeHit && !m.current.complete;
    this.wait = o.wicket || o.six ? 1.7 : o.four ? 2.0 : 1.35;
    this.setState('result');
  }

  private afterResult() {
    const m = this.match!;
    const s = this.summary!;
    if (this.pendingFreeHit) {
      this.world.signal('freehit');
      this.pendingFreeHit = false;
    }
    if (s.matchComplete) return this.finishMatch();
    if (s.inningsComplete) return this.inningsBreak();
    if (s.overComplete) {
      const inn = m.current;
      this.ui.toast(`End of over ${Math.floor(inn.legalBalls / 6)}`, `${inn.battingTeam} ${inn.score}/${inn.wickets}`, 'plain', 1500);
    }
    this.nextBall();
  }

  private inningsBreak() {
    this.setState('break');
    this.sfx.cheer(0.5, 2);
    this.ui.showInningsBreak(this.match!, USER);
  }

  private startChase() {
    const m = this.match;
    if (!m || this.state !== 'break') return;
    m.startSecondInnings();
    this.sim = null;
    this.ui.showHud(true);
    this.ui.updateScore(m);
    this.nextBall(true);
  }

  private finishMatch() {
    const m = this.match!;
    this.setState('end');
    this.sfx.cheer(m.result()!.winner === USER ? 1 : 0.4, 4);
    this.world.stadium.excite(1);
    this.ui.showResult(m, USER);
  }

  private setPaused(p: boolean) {
    if (this.state === 'menu' || this.state === 'end' || this.state === 'break') return;
    if (p === this.paused) return;
    this.paused = p;
    this.ui.showPause(p);
    if (!p && this.state === 'pickBowler' && this.match) this.ui.showBowlerPicker(this.match);
  }

  private setShotType(t: ShotType) {
    this.shotType = t;
    this.ui.setShotType(t);
  }

  private callRun() {
    this.sfx.unlock();
    if (this.state === 'ball' && this.userBats && this.sim && !this.paused) this.sim.callRun();
  }

  // ---------- Input ----------

  private batterScreen() {
    return this.world.batterScreen(this.w, this.h);
  }

  private get labelRadius(): number {
    return clamp(Math.min(this.w, this.h) * 0.21, 62, 120);
  }

  /** Converts a screen offset from the batter to a world shot angle. */
  private angleFromOffset(dx: number, dy: number): number {
    return Math.atan2(dx, dy);
  }

  private swingAt(dx: number, dy: number, type: ShotType = this.shotType): boolean {
    if (!this.sim || this.state !== 'ball' || !this.userBats || this.paused) return false;
    return this.sim.swing(type, this.angleFromOffset(dx, dy));
  }

  private onPointerDown(e: PointerEvent) {
    this.sfx.unlock();
    if (this.paused) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (this.state === 'ball' && this.userBats && this.sim?.canSwing) {
      const b = this.batterScreen();
      const dx = x - b.x;
      const dy = y - b.y;
      if (Math.hypot(dx, dy) < this.labelRadius * 0.3) {
        // On the batter: wait for a swipe. No swipe = defend.
        this.swipe = { x, y, id: e.pointerId };
      } else this.swingAt(dx, dy);
    } else if (this.state === 'bowlAim') {
      const p = this.world.pickGround((x / this.w) * 2 - 1, -((y / this.h) * 2 - 1));
      if (p) {
        this.target.x = clamp(p.x, -1.35, 1.35);
        this.target.length = clamp(p.z - STRIKER_STUMPS_Z, 0.8, 12.5);
        this.showTarget();
        this.sfx.click();
      }
    } else if (this.state === 'bowlMeter') this.bowlPress();
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.swipe || e.pointerId !== this.swipe.id) return;
    const r = this.canvas.getBoundingClientRect();
    const dx = e.clientX - r.left - this.swipe.x;
    const dy = e.clientY - r.top - this.swipe.y;
    if (Math.hypot(dx, dy) > 16) {
      this.swipe = null;
      this.swingAt(dx, dy);
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.swipe || e.pointerId !== this.swipe.id) return;
    this.swipe = null;
    this.swingAt(0, 1, 'defend');
  }

  /** Aim from the arrow keys, or null when no arrow key is down. */
  private keyAim(): number | null {
    const k = this.keys;
    const dx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    const dy = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    if (!dx && !dy) return null;
    return Math.atan2(dx, dy);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key.startsWith('Arrow')) {
      if (this.state !== 'menu') e.preventDefault();
      if (down) this.keys.add(key);
      else this.keys.delete(key);
      if (down && this.state === 'bowlAim') {
        const s = 0.12;
        if (key === 'ArrowLeft') this.target.x = clamp(this.target.x - s, -1.35, 1.35);
        if (key === 'ArrowRight') this.target.x = clamp(this.target.x + s, -1.35, 1.35);
        if (key === 'ArrowUp') this.target.length = clamp(this.target.length - 0.35, 0.8, 12.5);
        if (key === 'ArrowDown') this.target.length = clamp(this.target.length + 0.35, 0.8, 12.5);
        this.showTarget();
      }
      return;
    }
    if (!down || e.repeat) return;
    this.sfx.unlock();
    if (key === 'p' || key === 'Escape') return this.setPaused(!this.paused);
    if (key === 'm') {
      const on = !this.sfx.enabled;
      this.sfx.setEnabled(on);
      this.ui.setSound(on);
      return;
    }
    if (this.paused) return;
    if (key === ' ' || key === 'Enter') {
      if (this.state === 'menu' || this.ui.hasOverlay) return;
      e.preventDefault();
      if (this.state === 'ball' && this.userBats) {
        const a = this.keyAim();
        this.sim?.swing(this.shotType, a ?? 0);
      } else if (this.state === 'bowlAim' || this.state === 'bowlMeter') this.bowlPress();
      else if (this.state === 'replay') this.world.stopReplay();
      return;
    }
    if (key === 'z') this.setShotType('defend');
    else if (key === 'x') this.setShotType('ground');
    else if (key === 'c') this.setShotType('loft');
    else if (key === 'r') this.callRun();
    else if (this.state === 'bowlAim' && (key === '1' || key === '2' || key === '3')) {
      const b = this.match!.player(this.match!.current.bowlerId!);
      this.setVariation(VARIATIONS[b.bowl!.kind][Number(key) - 1]);
    }
  }

  // ---------- Loop ----------

  private resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.world.resize(this.w, this.h, this.pixelRatio);
  }

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    const raw = this.last ? (now - this.last) / 1000 : 0.016;
    this.last = now;
    const dt = Math.min(0.1, raw);
    this.frames++;
    this.fpsT += raw;
    this.fpsN++;
    if (this.fpsT >= 1) {
      this.fps = this.fpsN / this.fpsT;
      this.fpsT = 0;
      this.fpsN = 0;
      // Lower the resolution if the device cannot hold the frame rate.
      if (!this.testMode && this.fps < 48 && this.pixelRatio > 1) {
        if (++this.slowFrames >= 2) {
          this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
          this.slowFrames = 0;
          this.resize();
        }
      } else this.slowFrames = 0;
    }

    const events: SimEvent[] = [];
    let simDt = 0;
    if (!this.paused) {
      simDt = dt * this.timeScale;
      let rem = simDt;
      while (rem > 1e-6) {
        const st = Math.min(rem, 1 / 60);
        this.step(st, events);
        rem -= st;
      }
    }
    this.world.update(simDt, this.sim, events);
    if (!this.testMode || this.frames % 3 === 0) this.world.render();
    this.frameUi();
  }

  private step(dt: number, events: SimEvent[]) {
    this.stateT += dt;
    const sim = this.sim;
    switch (this.state) {
      case 'prepare':
        if (this.stateT >= this.wait) this.startSim();
        break;
      case 'bowlMeter':
        this.meterT += dt;
        break;
      case 'ball':
        if (sim) {
          sim.step(dt);
          const ev = sim.takeEvents();
          for (const e of ev) {
            events.push(e);
            this.onSimEvent(e, sim);
          }
          if (sim.phase === 'done') this.onBallDone();
        }
        break;
      case 'result':
        if (this.stateT >= this.wait) {
          if (this.wantReplay && this.world.startReplay()) {
            this.ui.hideToast();
            this.ui.replay(true);
            this.setState('replay');
          } else this.afterResult();
        }
        break;
      case 'replay':
        if (!this.world.replaying) {
          this.ui.replay(false);
          this.afterResult();
        }
        break;
    }
    this.onStep?.();
  }

  private onSimEvent(e: SimEvent, sim: BallSim) {
    const s = this.sfx;
    switch (e.type) {
      case 'release': {
        const b = sim.ctx.bowler;
        this.ui.speed(sim.ctx.spec.speedKmh, this.userBats ? b.short : VARIATION_LABEL[sim.ctx.spec.variation]);
        break;
      }
      case 'bounce':
        s.bounce();
        break;
      case 'contact':
        if (e.shot.contact === 'edge') s.edge();
        else s.bat(e.shot.type === 'defend' ? 0.25 : e.shot.speed / 38);
        break;
      case 'bowled':
        s.stumps();
        break;
      case 'pad':
        s.bounce();
        if (!e.out) s.ooh();
        break;
      case 'keeperTake':
        s.catchBall();
        if (sim.swung) s.ooh();
        break;
      case 'stumped':
      case 'runOut':
        s.stumps();
        break;
      case 'catch':
      case 'fielded':
      case 'arrive':
        s.catchBall();
        break;
      case 'drop':
        s.ooh();
        break;
      case 'landed':
        s.bounce();
        break;
    }
  }

  private frameUi() {
    const sim = this.sim;
    const batting = this.userBats && (this.state === 'prepare' || this.state === 'ball');
    const preSwing = batting && (!sim || this.state === 'prepare' || ((sim.phase === 'runup' || sim.phase === 'flight') && !sim.swung));
    if (preSwing && this.ctx) {
      const b = this.batterScreen();
      this.ui.showLabels(true, b.x, b.y, this.ctx.striker.hand, this.labelRadius, !!sim && sim.phase === 'flight', this.keyAim());
    } else this.ui.showLabels(false);
    if (this.state === 'ball' && this.userBats && sim) this.ui.showRun(sim.runHint(), sim.runsDone, sim.running);
    else if (this.state !== 'result') this.ui.showRun('none', 0, false);
    if (this.state === 'bowlMeter') this.ui.setMeter(this.meterPos());
    if (this.bannerT > 0) this.bannerT -= 1 / 60;
  }

  // ---------- Test support ----------

  /** State summary for the headless test. */
  info() {
    const m = this.match;
    const sim = this.sim;
    const inn = m?.current;
    const b = this.ctx ? this.batterScreen() : { x: 0, y: 0 };
    const o = this.lastOutcome;
    return {
      state: this.state,
      paused: this.paused,
      userBats: this.userBats,
      phase: sim?.phase ?? null,
      canSwing: !!sim && this.state === 'ball' && sim.canSwing,
      canRun: !!sim && this.state === 'ball' && sim.canRun,
      runHint: sim ? sim.runHint() : 'none',
      inZone: !!sim && sim.ballInZone,
      ballDist: sim ? sim.ballDist : null,
      innings: m ? m.inningsNumber : 0,
      score: inn?.score ?? 0,
      wickets: inn?.wickets ?? 0,
      legalBalls: inn?.legalBalls ?? 0,
      ballsBowled: inn?.balls.length ?? 0,
      target: inn?.target ?? null,
      complete: m?.complete ?? false,
      result: m?.result()?.text ?? null,
      strikerHand: this.ctx?.striker.hand ?? null,
      batter: b,
      labelRadius: this.labelRadius,
      fps: this.fps,
      meter: this.state === 'bowlMeter' ? this.meterPos() : null,
      last: o
        ? {
            text: o.text,
            runs: o.runs,
            wicket: o.wicket?.kind ?? null,
            contact: o.shot?.contact ?? null,
            timing: o.shot?.timing ?? null,
            aimed: o.shot?.aimed ?? null,
            angle: o.shot?.angle ?? null,
            type: o.shot?.type ?? null,
            name: o.shot?.name ?? null,
          }
        : null,
      render: this.world.debugState(),
    };
  }
}
