import { World } from '../render/world';
import { VARIATIONS, VARIATION_LABEL, aiChooseBowler, type BowlInput } from '../sim/ai';
import { BallSim, type BallContext, type BallOutcome, type SimEvent } from '../sim/ballsim';
import type { DeliverySpec, Variation } from '../sim/delivery';
import { STRIKER_CREASE_Z, STRIKER_STUMPS_Z, legSign, type FieldPlan } from '../sim/field';
import { makeBallContext, nextAiDelivery, nextUserDelivery } from '../sim/flow';
import { Match, type BallSummary } from '../sim/match';
import { Rng, clamp } from '../sim/rng';
import type { ShotType } from '../sim/shot';
import { RCB_SQUAD, defaultXi, makeTeam, validateXi } from '../sim/squads';
import type { Player, TeamId } from '../sim/types';
import { UI, type StartOptions } from '../ui/ui';
import { Sfx } from './audio';
import { loadSaved, saveSaved, type Saved } from './store';

type State = 'menu' | 'tie' | 'pickBowler' | 'prepare' | 'bowlAim' | 'bowlMeter' | 'ball' | 'result' | 'replay' | 'break' | 'end';

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
  private forceTie = false;
  private saved: Saved = loadSaved();
  private plan: FieldPlan = 'balanced';
  /** The tied main match while a super over is played. */
  private mainMatch: Match | null = null;
  private superRound = 0;
  private milestones = new Set<string>();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    const q = new URLSearchParams(location.search);
    this.testMode = q.has('test');
    this.forceTie = this.testMode && q.has('tie');
    this.world = new World(canvas, this.testMode);
    this.ui = new UI(uiRoot, {
      start: (o) => this.startMatch(o),
      saveXi: (xi) => {
        this.xi = xi;
        this.saved.xi = xi.map((p) => p.id);
        saveSaved(this.saved);
      },
      fieldPlan: (p) => this.setFieldPlan(p),
      superOver: () => this.startSuperOver(),
      options: (o) => {
        Object.assign(this.saved, o);
        saveSaved(this.saved);
      },
      shotType: (t) => this.setShotType(t),
      run: () => this.callRun(),
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      quit: () => this.toMenu(),
      sound: (on) => {
        this.sfx.unlock();
        this.sfx.setEnabled(on);
        this.saved.sound = on;
        saveSaved(this.saved);
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
    // Restore the saved settings.
    const xi = this.saved.xi.map((id) => RCB_SQUAD.find((p) => p.id === id)).filter((p): p is Player => !!p);
    if (xi.length === 11 && validateXi(xi).ok) this.xi = xi;
    this.ui.setOptions({ batFirst: this.saved.batFirst, overs: this.saved.overs, difficulty: this.saved.difficulty });
    this.sfx.setEnabled(this.saved.sound);
    this.ui.setSound(this.saved.sound);
    this.world.snapCamera();
    this.ui.showMenu(this.xi, this.recordHtml());
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- Match flow ----------

  private startMatch(o: StartOptions) {
    this.sfx.unlock();
    const teams = { RCB: makeTeam('RCB', this.xi), CSK: makeTeam('CSK', defaultXi('CSK')) };
    this.match = new Match({ overs: o.overs, difficulty: o.difficulty, battingFirst: o.batFirst ? 'RCB' : 'CSK', teams });
    this.sim = null;
    this.lastOutcome = null;
    this.mainMatch = null;
    this.superRound = 0;
    this.plan = 'balanced';
    this.milestones.clear();
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
    this.ui.radar(false);
    this.ui.showMenu(this.xi, this.recordHtml());
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
      this.ctx = makeBallContext(m, this.placeholderSpec(bowler), this.rng, USER, this.plan);
      this.world.prepareBall(this.ctx, battingTeam, bowlingTeam, instant);
      this.world.mode = 'aim';
      this.showTarget();
      this.ui.setPanel('bowl');
      this.ui.showBowlPanel(bowler, kind, this.variation, 'aim', this.plan);
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
    this.ui.showBowlPanel(b, b.bowl!.kind, v, 'aim', this.plan);
  }

  /** Changes the field setting. The fielders run to the new positions. */
  private setFieldPlan(p: FieldPlan) {
    const m = this.match;
    if (this.state !== 'bowlAim' || !m || p === this.plan) return;
    this.plan = p;
    const b = m.player(m.current.bowlerId!);
    this.ctx = makeBallContext(m, this.placeholderSpec(b), this.rng, USER, p);
    this.world.prepareBall(this.ctx, m.current.battingTeam, m.current.bowlingTeam, false);
    this.world.mode = 'aim';
    this.showTarget();
    this.ui.showBowlPanel(b, b.bowl!.kind, this.variation, 'aim', p);
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
      this.ctx = makeBallContext(m, spec, this.rng, USER, this.plan);
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
    const innBefore = m.current;
    const strikerId = innBefore.strikerId!;
    const bowlerId = innBefore.bowlerId!;
    this.summary = m.applyBall(o.event);
    this.ui.updateScore(m);
    this.checkMilestones(innBefore, strikerId, bowlerId, wasUserBatting);
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
    const res = m.result()!;
    this.ui.radar(false);
    // Test hook: ?tie forces one super over.
    if (res.winner === 'tie' || (this.forceTie && this.superRound === 0)) {
      // A tie goes to a super over (also a tied super over).
      this.setState('tie');
      this.sfx.cheer(0.8, 3);
      this.ui.showTie(m, this.superRound);
      return;
    }
    this.setState('end');
    this.sfx.cheer(res.winner === USER ? 1 : 0.4, 4);
    this.world.stadium.excite(1);
    const main = this.mainMatch ?? m;
    this.updateRecords(main, res.winner === USER);
    this.ui.showResult(main, USER, this.mainMatch ? m : null);
  }

  private startSuperOver() {
    const prev = this.match;
    if (!prev || this.state !== 'tie') return;
    if (!this.mainMatch) this.mainMatch = prev;
    this.superRound++;
    // The team that batted second bats first in the super over.
    this.match = new Match({ overs: 1, maxWickets: 2, difficulty: prev.config.difficulty, battingFirst: prev.innings[1].battingTeam, teams: prev.config.teams });
    this.sim = null;
    this.plan = 'balanced';
    this.ui.showHud(true);
    this.ui.updateScore(this.match);
    this.nextBall(true);
  }

  private checkMilestones(inn: Match['current'], strikerId: string, bowlerId: string, userBatting: boolean) {
    const m = this.match!;
    const card = m.batCard(inn, strikerId);
    for (const mark of [100, 50]) {
      const key = `${m.inningsNumber}:${strikerId}:${mark}`;
      if (card.runs >= mark && !this.milestones.has(key)) {
        this.milestones.add(key);
        this.milestones.add(`${m.inningsNumber}:${strikerId}:50`);
        this.ui.milestone(`${mark === 100 ? 'HUNDRED' : 'FIFTY'}! ${m.player(strikerId).name} ${card.runs} (${card.balls})`);
        this.sfx.cheer(userBatting ? 1 : 0.5, 3);
        this.world.stadium.excite(1);
        break;
      }
    }
    // Hat-trick: wickets with three legal balls in a row from the same bowler.
    const mine = inn.balls.filter((b) => b.bowlerId === bowlerId && b.legal).slice(-3);
    const key = `${m.inningsNumber}:${bowlerId}:hat:${inn.balls.length}`;
    if (mine.length === 3 && mine.every((b) => b.wicket && b.wicket.kind !== 'runOut') && inn.balls[inn.balls.length - 1].wicket && !this.milestones.has(key)) {
      this.milestones.add(key);
      this.ui.milestone(`HAT-TRICK! ${m.player(bowlerId).name}`);
      this.sfx.cheer(userBatting ? 0.5 : 1, 3);
    }
  }

  private updateRecords(m: Match, won: boolean) {
    const r = this.saved.records;
    r.played++;
    if (won) r.won++;
    else r.lost++;
    if (this.mainMatch) r.tied++;
    const bat = m.innings.find((i) => i.battingTeam === USER)!;
    const bowl = m.innings.find((i) => i.bowlingTeam === USER)!;
    if (bat.score > r.highScore) {
      r.highScore = bat.score;
      r.highScoreText = `${bat.score}/${bat.wickets} (${m.config.overs} ov)`;
    }
    for (const c of bat.bat) {
      r.sixes += c.sixes;
      if (c.runs > r.bestBat) {
        r.bestBat = c.runs;
        r.bestBatText = `${m.player(c.id).name} ${c.runs}${c.out ? '' : '*'} (${c.balls})`;
      }
    }
    for (const c of bowl.bowl) {
      if (c.balls && (c.wickets > r.bestBowlWkts || (c.wickets === r.bestBowlWkts && c.wickets > 0 && c.runs < r.bestBowlRuns))) {
        r.bestBowlWkts = c.wickets;
        r.bestBowlRuns = c.runs;
        r.bestBowlText = `${m.player(c.id).name} ${c.wickets}/${c.runs}`;
      }
    }
    saveSaved(this.saved);
  }

  private recordHtml(): string {
    const r = this.saved.records;
    if (!r.played) return '';
    const lines = [`Played <b>${r.played}</b> · Won <b>${r.won}</b> · Lost <b>${r.lost}</b>${r.tied ? ` · Super overs <b>${r.tied}</b>` : ''}`];
    if (r.highScoreText) lines.push(`Highest total <b>${r.highScoreText}</b> · Sixes <b>${r.sixes}</b>`);
    if (r.bestBatText) lines.push(`Best batting <b>${r.bestBatText}</b>`);
    if (r.bestBowlText) lines.push(`Best bowling <b>${r.bestBowlText}</b>`);
    return lines.join('<br>');
  }

  private setPaused(p: boolean) {
    if (this.state === 'menu' || this.state === 'end' || this.state === 'break') return;
    if (this.state === 'tie') return;
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
            this.ui.setPanel('none');
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
        if (!this.userBats) this.ui.setPanel('none');
        break;
      }
      case 'swing':
        this.ui.setHint('');
        break;
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
    // Field map.
    const live = this.match && this.ctx && this.state !== 'menu' && this.state !== 'end' && this.state !== 'break' && this.state !== 'tie' && this.state !== 'replay';
    if (live && this.ctx) {
      const c = this.ctx;
      const play = !!sim && sim.hasContact;
      const fs = c.fielders.map((f, i) => (play ? sim!.fielderPos(i) : f));
      const ball = sim && (sim.phase === 'flight' || play) ? sim.ball : null;
      const prog = sim ? sim.strikerProgress : 0;
      const z0 = STRIKER_CREASE_Z;
      this.ui.radar(true, fs, ball, this.userBats ? '#f9cd05' : '#ff4d5e', [
        { x: 0.6, z: z0 + (-2 * z0) * prog },
        { x: -0.6, z: -z0 + 2 * z0 * prog },
      ]);
    } else this.ui.radar(false);
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
      superOver: this.superRound,
      fieldPlan: this.plan,
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
