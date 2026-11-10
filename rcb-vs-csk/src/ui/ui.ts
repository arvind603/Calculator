import { VARIATIONS, VARIATION_LABEL } from '../sim/ai';
import type { Variation } from '../sim/delivery';
import { Match, maxOversPerBowler } from '../sim/match';
import type { ShotType, TimingClass } from '../sim/shot';
import { MAX_OVERSEAS, RCB_SQUAD, validateXi } from '../sim/squads';
import type { BowlKind, Difficulty, Hand, OversOption, Player, TeamId } from '../sim/types';
import { scorecard } from './scorecard';

export interface StartOptions {
  batFirst: boolean;
  overs: OversOption;
  difficulty: Difficulty;
}

export interface UIHandlers {
  start(o: StartOptions): void;
  saveXi(xi: Player[]): void;
  shotType(t: ShotType): void;
  run(): void;
  pause(): void;
  resume(): void;
  quit(): void;
  sound(on: boolean): void;
  pickBowler(id: string): void;
  variation(v: Variation): void;
  bowl(): void;
  next(): void;
  skipReplay(): void;
  uiClick(): void;
}

const ICON = {
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
};

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const el = <T extends HTMLElement = HTMLElement>(html: string): T => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
};

const ROLE: Record<string, string> = { bat: 'Batter', wk: 'Wicketkeeper', ar: 'All-rounder', bowl: 'Bowler' };

export class UI {
  private root: HTMLElement;
  private h: UIHandlers;
  private hud: HTMLElement;
  private screen: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private q: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private timingTimer = 0;
  private speedTimer = 0;
  private opts: StartOptions = { batFirst: true, overs: 5, difficulty: 'normal' };
  private soundOn = true;
  private xi: Player[] = [];
  private xiSel: string | null = null;
  private lastScoreKey = '';

  constructor(root: HTMLElement, handlers: UIHandlers) {
    this.root = root;
    this.h = handlers;
    this.hud = el(`<div class="hud hidden">
      <div class="sb" data-q="sb"></div>
      <div class="hud-btns">
        <button class="icon-btn" data-act="sound" aria-label="Sound on or off" data-q="soundBtn">${ICON.soundOn}</button>
        <button class="icon-btn" data-act="pause" aria-label="Pause">${ICON.pause}</button>
      </div>
      <div class="labels hidden" data-q="labels">
        <div class="ring" data-q="ring"></div>
        <div class="lab" data-q="labUp">BEHIND</div>
        <div class="lab" data-q="labDown">STRAIGHT</div>
        <div class="lab" data-q="labLeft"></div>
        <div class="lab" data-q="labRight"></div>
        <div class="aim hidden" data-q="aim"><i data-q="aimLine"></i></div>
      </div>
      <div class="banner hidden" data-q="banner"></div>
      <div class="replay-tag hidden" data-q="replay">REPLAY</div>
      <button class="skip hidden" data-act="skip" data-q="skip">Skip</button>
      <div class="speed" data-q="speed"></div>
      <div class="toast" data-q="toast"><div class="big" data-q="toastBig"></div><div class="small" data-q="toastSmall"></div></div>
      <div class="timing" data-q="timing">
        <div class="ends"><span>LATE</span><span>EARLY</span></div>
        <div class="bar"><div class="pin" data-q="pin"></div></div>
        <div class="word" data-q="timingWord"></div>
      </div>
      <div class="runinfo hidden" data-q="runinfo"></div>
      <button class="run hidden" data-act="run" data-q="run">RUN<small data-q="runHint"></small></button>
      <div class="batpanel hidden" data-q="batpanel">
        <div class="hint" data-q="hint"></div>
        <div class="seg" data-q="seg">
          <button data-shot="defend" class="def">DEFEND<small>safe</small></button>
          <button data-shot="ground" class="sel">GROUND<small>along the grass</small></button>
          <button data-shot="loft" class="loft">LOFT<small>risk for six</small></button>
        </div>
      </div>
      <div class="bowlpanel hidden" data-q="bowlpanel">
        <div class="who" data-q="bowlWho"></div>
        <div class="seg" data-q="varSeg"></div>
        <div class="meter" data-q="meter"><div class="nb">NO-BALL</div><div class="needle" data-q="needle"></div></div>
        <button class="cta" data-act="bowl" data-q="bowlBtn">BOWL</button>
      </div>
    </div>`);
    root.appendChild(this.hud);
    this.hud.querySelectorAll<HTMLElement>('[data-q]').forEach((n) => (this.q[n.dataset.q!] = n));
    root.addEventListener('click', (e) => this.onClick(e));
    // The run button must react at once, also on touch screens.
    this.q.run.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.h.run();
    });
  }

  // ---------- Events ----------

  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-shot],[data-var],[data-opt],[data-pl],[data-bowler],[data-tab]');
    if (!t) return;
    const d = t.dataset;
    if (d.act !== 'run') this.h.uiClick();
    if (d.shot) return this.h.shotType(d.shot as ShotType);
    if (d.var) return this.h.variation(d.var as Variation);
    if (d.bowler) return this.h.pickBowler(d.bowler);
    if (d.pl) return this.xiTap(d.pl);
    if (d.tab) return this.showTab(Number(d.tab));
    if (d.opt) {
      const [k, v] = d.opt.split(':');
      if (k === 'first') this.opts.batFirst = v === 'bat';
      if (k === 'overs') this.opts.overs = Number(v) as OversOption;
      if (k === 'diff') this.opts.difficulty = v as Difficulty;
      t.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b === t));
      return;
    }
    switch (d.act) {
      case 'start':
        return this.h.start({ ...this.opts });
      case 'xi':
        return this.showXi();
      case 'xiSave':
        if (validateXi(this.xi).ok) {
          this.h.saveXi([...this.xi]);
          this.showMenu(this.xi);
        }
        return;
      case 'xiReset':
        this.xi = RCB_SQUAD.slice(0, 11);
        this.xiSel = null;
        return this.renderXi();
      case 'help':
        return this.showHelp();
      case 'closeSheet':
        return this.closeSheet();
      case 'pause':
        return this.h.pause();
      case 'resume':
        return this.h.resume();
      case 'quit':
        return this.h.quit();
      case 'sound':
        this.setSound(!this.soundOn);
        return this.h.sound(this.soundOn);
      case 'bowl':
        return this.h.bowl();
      case 'next':
        return this.h.next();
      case 'skip':
        return this.h.skipReplay();
    }
  }

  setSound(on: boolean) {
    this.soundOn = on;
    this.q.soundBtn.innerHTML = on ? ICON.soundOn : ICON.soundOff;
    this.root.querySelectorAll<HTMLElement>('[data-soundlabel]').forEach((n) => (n.textContent = on ? 'Sound: on' : 'Sound: off'));
  }

  private setScreen(node: HTMLElement | null) {
    this.screen?.remove();
    this.screen = node;
    if (node) this.root.appendChild(node);
  }

  private setSheet(node: HTMLElement | null) {
    this.sheet?.remove();
    this.sheet = node;
    if (node) this.root.appendChild(node);
  }

  closeSheet() {
    this.setSheet(null);
  }

  get hasOverlay(): boolean {
    return this.screen !== null || this.sheet !== null;
  }

  // ---------- Menu ----------

  showMenu(xi: Player[]) {
    this.xi = [...xi];
    this.hud.classList.add('hidden');
    this.setSheet(null);
    const o = this.opts;
    const sel = (c: boolean) => (c ? 'class="sel"' : '');
    this.setScreen(
      el(`<div class="screen"><div class="inner">
      <div class="title">
        <div class="vs"><span class="a">RCB</span><span class="v">vs</span><span class="b">CSK</span></div>
        <p>You play as Royal Challengers Bengaluru. The computer plays as Chennai Super Kings.</p>
      </div>
      <div class="card"><h3>You start with</h3>
        <div class="opts">
          <button data-opt="first:bat" ${sel(o.batFirst)}>Bat first</button>
          <button data-opt="first:bowl" ${sel(!o.batFirst)}>Bowl first</button>
        </div>
      </div>
      <div class="card"><h3>Overs per side</h3>
        <div class="opts">${[2, 5, 10, 20].map((n) => `<button data-opt="overs:${n}" ${sel(o.overs === n)}>${n}</button>`).join('')}</div>
      </div>
      <div class="card"><h3>Difficulty</h3>
        <div class="opts">
          <button data-opt="diff:easy" ${sel(o.difficulty === 'easy')}>Easy<small>wide timing</small></button>
          <button data-opt="diff:normal" ${sel(o.difficulty === 'normal')}>Normal</button>
          <button data-opt="diff:hard" ${sel(o.difficulty === 'hard')}>Hard<small>tight timing</small></button>
        </div>
      </div>
      <button class="cta" data-act="start">START MATCH</button>
      <div class="row">
        <button class="ghost" data-act="xi">Change RCB XI</button>
        <button class="ghost" data-act="help">How to play</button>
        <button class="ghost" data-act="sound" data-soundlabel>${this.soundOn ? 'Sound: on' : 'Sound: off'}</button>
      </div>
    </div></div>`),
    );
  }

  // ---------- XI editor ----------

  private showXi() {
    this.xiSel = null;
    this.setScreen(el(`<div class="screen solid top"><div class="inner" data-xi></div></div>`));
    this.renderXi();
  }

  private plRow(p: Player, idx: number | null): string {
    const badges =
      (p.role === 'wk' ? '<span class="badge wk">WK</span>' : '') +
      (p.captain ? '<span class="badge c">C</span>' : '') +
      (p.overseas ? '<span class="badge os">OS</span>' : '') +
      (p.hand === 'L' ? '<span class="badge lh">LHB</span>' : '');
    const style = p.bowl ? p.bowl.label : 'Does not bowl';
    return `<button class="pl ${this.xiSel === p.id ? 'sel' : ''}" data-pl="${p.id}">
      <span class="n">${idx !== null ? idx + 1 : '·'}</span>
      <span class="nm"><b>${esc(p.name)}${badges}</b><span>${ROLE[p.role]} · ${p.hand === 'L' ? 'Left' : 'Right'}-hand bat · ${esc(style)}${p.note ? ' · ' + esc(p.note) : ''}</span></span>
      <span class="rt">BAT <b>${p.bat}</b><br>BOWL <b>${p.bowl ? p.bowling : '-'}</b></span>
    </button>`;
  }

  private renderXi() {
    const host = this.screen?.querySelector<HTMLElement>('[data-xi]');
    if (!host) return;
    const bench = RCB_SQUAD.filter((p) => !this.xi.some((x) => x.id === p.id));
    const check = validateXi(this.xi);
    const os = this.xi.filter((p) => p.overseas).length;
    host.innerHTML = `
      <h2 class="head">RCB playing XI</h2>
      <p class="sub">Tap a player, then tap another player to swap them. The list order is the batting order. Overseas: ${os}/${MAX_OVERSEAS}.</p>
      <div class="warn ${check.ok ? 'okmsg' : ''}">${check.ok ? 'This XI is valid.' : esc(check.problems.join(' '))}</div>
      <div class="xi-cols">
        <div class="card"><h3>Playing XI (batting order)</h3><div class="xi-list">${this.xi.map((p, i) => this.plRow(p, i)).join('')}</div></div>
        <div class="card"><h3>Bench</h3><div class="xi-list">${bench.map((p) => this.plRow(p, null)).join('')}</div></div>
      </div>
      <div class="row">
        <button class="ghost" data-act="xiReset">Reset</button>
        <button class="cta gold" data-act="xiSave" ${check.ok ? '' : 'disabled'}>SAVE XI</button>
      </div>`;
  }

  private xiTap(id: string) {
    if (!this.xiSel) this.xiSel = id;
    else if (this.xiSel === id) this.xiSel = null;
    else {
      const a = this.xi.findIndex((p) => p.id === this.xiSel);
      const b = this.xi.findIndex((p) => p.id === id);
      const pa = RCB_SQUAD.find((p) => p.id === this.xiSel)!;
      const pb = RCB_SQUAD.find((p) => p.id === id)!;
      if (a >= 0 && b >= 0) [this.xi[a], this.xi[b]] = [this.xi[b], this.xi[a]];
      else if (a >= 0) this.xi[a] = pb;
      else if (b >= 0) this.xi[b] = pa;
      this.xiSel = null;
    }
    const sc = this.screen?.scrollTop ?? 0;
    this.renderXi();
    if (this.screen) this.screen.scrollTop = sc;
  }

  // ---------- Help and pause ----------

  private helpHtml(): string {
    return `<div class="help">
      <h4>Batting</h4>
      <ul>
        <li>Tap when the ball is in the <b>lit zone</b> on the pitch (after it bounces, about 2 m in front of the bat).</li>
        <li>The <b>place you tap</b> around the batter is the direction of the shot. Or put your finger on the batter and swipe.</li>
        <li>Select <b>Defend</b>, <b>Ground</b> or <b>Loft</b> before the ball.</li>
        <li>Early = the ball goes to the leg side. Late = the ball goes to the off side.</li>
        <li>Press <b>RUN</b> to run. Green = safe, amber = tight, red = danger.</li>
        <li>Keyboard: <kbd>Arrows</kbd> aim, <kbd>Space</kbd> swing, <kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> shot type, <kbd>R</kbd> run.</li>
      </ul>
      <h4>Bowling</h4>
      <ul>
        <li>Select a variation. Tap the pitch to set the line and the length.</li>
        <li>Press <b>BOWL</b>, then press again to stop the meter near the centre.</li>
        <li>If the meter stops in the dark red zone at the end, it is a no-ball.</li>
      </ul>
      <h4>Other keys</h4>
      <ul><li><kbd>P</kbd> or <kbd>Esc</kbd> pause, <kbd>M</kbd> sound.</li></ul>
    </div>`;
  }

  private showHelp() {
    this.setSheet(el(`<div class="sheet"><h2>How to play</h2>${this.helpHtml()}<button class="cta gold" data-act="closeSheet">OK</button></div>`));
  }

  showPause(show: boolean) {
    if (!show) return this.setSheet(null);
    this.setSheet(
      el(`<div class="sheet"><h2>Paused</h2>
        <button class="cta" data-act="resume">RESUME</button>
        <div class="row">
          <button class="ghost" data-act="sound" data-soundlabel>${this.soundOn ? 'Sound: on' : 'Sound: off'}</button>
          <button class="ghost" data-act="quit">Quit to menu</button>
        </div>
        ${this.helpHtml()}
      </div>`),
    );
  }

  // ---------- HUD ----------

  showHud(show: boolean) {
    this.hud.classList.toggle('hidden', !show);
    if (show) this.setScreen(null);
  }

  updateScore(match: Match) {
    const inn = match.current;
    const name = (id: string | null) => (id ? match.player(id).short : '');
    const card = (id: string | null, on: boolean) => {
      if (!id) return '<span></span>';
      const c = match.batCard(inn, id);
      return `<span class="${on ? 'on' : ''}"><b>${esc(name(id))}</b> ${c.runs} (${c.balls})</span>`;
    };
    const bowlerId = inn.bowlerId ?? inn.lastOverBowlerId;
    let bowl = '<span></span>';
    if (bowlerId) {
      const c = match.bowlCard(inn, bowlerId);
      bowl = `<span><b>${esc(name(bowlerId))}</b> ${Math.floor(c.balls / 6)}.${c.balls % 6}-${c.maidens}-${c.runs}-${c.wickets}</span>`;
    }
    const chips = match
      .thisOver(inn)
      .slice(-8)
      .map((b) => {
        const cls = b.wicket ? 'w' : b.boundary === 6 ? 'r6' : b.boundary === 4 ? 'r4' : !b.legal ? 'x' : '';
        return `<span class="chip ${cls}">${esc(b.label)}</span>`;
      })
      .join('');
    let chase = '';
    if (inn.target !== null) {
      const need = match.runsNeeded(inn)!;
      const left = match.ballsLeft(inn);
      const rrr = match.requiredRate(inn)!;
      chase = need > 0 ? `Target ${inn.target} · Need ${need} off ${left} · RRR ${isFinite(rrr) ? rrr.toFixed(2) : '-'}` : `Target ${inn.target} reached`;
    }
    const phase = match.phase(inn);
    const tags = (phase === 'powerplay' ? '<span class="tag">PP</span>' : '') + (inn.freeHit ? '<span class="tag fh">FREE HIT</span>' : '');
    const html = `
      <div class="sb-main"><span class="team ${inn.battingTeam}">${inn.battingTeam}</span><span class="score">${inn.score}/${inn.wickets}</span>
        <span class="overs">${match.oversText(inn)}<small> / ${match.config.overs}</small></span>${tags}<span class="rate">CRR ${match.runRate(inn).toFixed(2)}</span></div>
      ${chase ? `<div class="sb-chase">${chase}</div>` : ''}
      <div class="sb-row">${card(inn.strikerId, true)}${card(inn.nonStrikerId, false)}</div>
      <div class="sb-row">${bowl}<span class="chips">${chips}</span></div>`;
    if (html !== this.lastScoreKey) {
      this.lastScoreKey = html;
      this.q.sb.innerHTML = html;
    }
  }

  setPanel(mode: 'bat' | 'bowl' | 'none') {
    this.q.batpanel.classList.toggle('hidden', mode !== 'bat');
    this.q.bowlpanel.classList.toggle('hidden', mode !== 'bowl');
  }

  setShotType(t: ShotType) {
    this.q.seg.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('sel', b.dataset.shot === t));
  }

  setHint(text: string) {
    if (this.q.hint.textContent !== text) this.q.hint.textContent = text;
  }

  showRun(hint: 'none' | 'safe' | 'tight' | 'danger', runs: number, running: boolean) {
    const btn = this.q.run;
    btn.classList.toggle('hidden', hint === 'none');
    if (hint !== 'none') {
      btn.classList.toggle('tight', hint === 'tight');
      btn.classList.toggle('danger', hint === 'danger');
      this.q.runHint.textContent = hint === 'safe' ? 'SAFE' : hint === 'tight' ? 'TIGHT' : 'DANGER';
    }
    const info = running ? `Running… ${runs + 1}` : runs > 0 ? `${runs} run${runs > 1 ? 's' : ''}` : '';
    this.q.runinfo.classList.toggle('hidden', !info);
    if (info) this.q.runinfo.textContent = info;
  }

  /** Direction labels around the batter. x, y = screen position of the batter. */
  showLabels(show: boolean, x = 0, y = 0, hand: Hand = 'R', radius = 80, dim = false, aim: number | null = null) {
    const l = this.q.labels;
    l.classList.toggle('hidden', !show);
    if (!show) return;
    l.style.opacity = dim ? '0.35' : '1';
    const set = (n: HTMLElement, dx: number, dy: number) => {
      n.style.left = `${x + dx}px`;
      n.style.top = `${y + dy}px`;
    };
    const left = hand === 'R' ? 'OFF' : 'LEG';
    const right = hand === 'R' ? 'LEG' : 'OFF';
    this.q.labLeft.textContent = `◀ ${left}`;
    this.q.labRight.textContent = `${right} ▶`;
    this.q.labLeft.className = `lab ${left.toLowerCase()}`;
    this.q.labRight.className = `lab ${right.toLowerCase()}`;
    set(this.q.labUp, 0, -radius);
    set(this.q.labDown, 0, radius * 0.9);
    set(this.q.labLeft, -radius * 1.05, 0);
    set(this.q.labRight, radius * 1.05, 0);
    const ring = this.q.ring;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = ring.style.height = `${radius * 1.3}px`;
    this.q.aim.classList.toggle('hidden', aim === null);
    if (aim !== null) {
      this.q.aim.style.left = `${x}px`;
      this.q.aim.style.top = `${y}px`;
      // aim: 0 = down the screen, positive = right.
      this.q.aimLine.style.height = `${radius * 0.62}px`;
      this.q.aimLine.style.transform = `rotate(${-aim}rad)`;
    }
  }

  toast(big: string, small = '', kind: 'four' | 'six' | 'out' | 'plain' | '' = '', ms = 1700) {
    const t = this.q.toast;
    this.q.toastBig.textContent = big;
    this.q.toastSmall.textContent = small;
    t.className = `toast show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  }

  hideToast() {
    clearTimeout(this.toastTimer);
    this.q.toast.classList.remove('show');
  }

  /** norm: timing error in window units. Positive = early. */
  timing(norm: number, cls: TimingClass, ms = 2200) {
    const pos = 50 + Math.max(-2.6, Math.min(2.6, norm)) * (50 / 2.6);
    this.q.pin.style.left = `${pos}%`;
    const word =
      cls === 'perfect' ? 'PERFECT' : cls === 'miss' ? (norm > 0 ? 'TOO EARLY' : 'TOO LATE') : `${cls === 'good' ? 'GOOD' : cls === 'ok' ? 'OK' : 'POOR'} · ${norm > 0 ? 'EARLY' : 'LATE'}`;
    this.q.timingWord.textContent = word;
    this.q.timingWord.style.color = cls === 'perfect' || cls === 'good' ? '#7dffb0' : cls === 'ok' ? '#ffd27f' : '#ff9a9a';
    this.q.timing.classList.add('show');
    clearTimeout(this.timingTimer);
    this.timingTimer = window.setTimeout(() => this.q.timing.classList.remove('show'), ms);
  }

  speed(kmh: number, label: string) {
    this.q.speed.innerHTML = `${kmh.toFixed(1)} km/h<small>${esc(label)}</small>`;
    this.q.speed.classList.add('show');
    clearTimeout(this.speedTimer);
    this.speedTimer = window.setTimeout(() => this.q.speed.classList.remove('show'), 3200);
  }

  banner(text: string | null, info = false) {
    this.q.banner.classList.toggle('hidden', !text);
    this.q.banner.classList.toggle('info', info);
    if (text) this.q.banner.textContent = text;
  }

  replay(show: boolean) {
    this.q.replay.classList.toggle('hidden', !show);
    this.q.skip.classList.toggle('hidden', !show);
  }

  // ---------- Bowling ----------

  showBowlPanel(bowler: Player, kind: BowlKind, variation: Variation, stage: 'aim' | 'meter' | 'done') {
    this.q.bowlWho.textContent =
      stage === 'aim' ? `${bowler.name}: select a variation, tap the pitch, then press BOWL` : stage === 'meter' ? 'Stop the meter near the centre' : '';
    this.q.varSeg.innerHTML = VARIATIONS[kind]
      .map((v) => `<button data-var="${v}" class="${v === variation ? 'sel' : ''}">${VARIATION_LABEL[v].toUpperCase()}</button>`)
      .join('');
    this.q.varSeg.classList.toggle('hidden', stage !== 'aim');
    this.q.meter.classList.toggle('hidden', stage === 'aim');
    const btn = this.q.bowlBtn as HTMLButtonElement;
    btn.textContent = stage === 'aim' ? 'BOWL' : 'STOP';
    btn.classList.toggle('hidden', stage === 'done');
  }

  /** pos: 0 to 1 along the meter. */
  setMeter(pos: number) {
    this.q.needle.style.left = `${pos * 100}%`;
  }

  showBowlerPicker(match: Match) {
    const inn = match.current;
    const eligible = match.eligibleBowlers(inn);
    const quota = maxOversPerBowler(match.config.overs);
    const team = match.team(inn.bowlingTeam);
    const rows = team.xi
      .filter((p) => p.bowl && p.id !== team.keeperId)
      .map((p) => {
        const c = match.bowlCard(inn, p.id);
        const ok = eligible.some((e) => e.id === p.id);
        const why = ok ? '' : p.id === inn.lastOverBowlerId ? ' · bowled the last over' : ' · quota complete';
        return `<button class="pl" data-bowler="${p.id}" ${ok ? '' : 'disabled style="opacity:.4"'}>
          <span class="nm"><b>${esc(p.name)}</b><span>${esc(p.bowl!.label)}${why}</span></span>
          <span class="rt">${Math.floor(c.balls / 6)}.${c.balls % 6}/${quota} ov · ${c.runs}-${c.wickets}<br>BOWL <b>${p.bowling}</b></span></button>`;
      })
      .join('');
    const over = Math.floor(inn.legalBalls / 6) + 1;
    this.setSheet(el(`<div class="sheet"><h2>Over ${over}: select the bowler</h2><p class="sub">A bowler cannot bowl two overs in a row. Maximum ${quota} over${quota > 1 ? 's' : ''} each.</p>${rows}</div>`));
  }

  // ---------- Break and result ----------

  private tabs: string[] = [];

  private showTab(i: number) {
    const host = this.screen?.querySelector<HTMLElement>('[data-tabhost]');
    if (!host) return;
    host.innerHTML = this.tabs[i];
    this.screen!.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('sel', Number(b.dataset.tab) === i));
  }

  showInningsBreak(match: Match, userTeam: TeamId) {
    const inn = match.innings[0];
    const target = inn.score + 1;
    const chasing = match.team(inn.bowlingTeam);
    this.hud.classList.add('hidden');
    this.setSheet(null);
    this.tabs = [scorecard(match, inn)];
    this.setScreen(
      el(`<div class="screen solid top"><div class="inner">
        <h2 class="head">Innings break</h2>
        <div class="result-line">${esc(match.team(inn.battingTeam).short)} ${inn.score}/${inn.wickets} <small>(${match.oversText(inn)} ov)</small></div>
        <p class="sub">${esc(chasing.name)} need <b>${target}</b> runs in ${match.config.overs} overs. Required rate ${(target / match.config.overs).toFixed(2)}.
        ${chasing.id === userTeam ? 'You bat now.' : 'You bowl now.'}</p>
        <button class="cta" data-act="next">START THE CHASE</button>
        <div data-tabhost>${this.tabs[0]}</div>
        <button class="ghost" data-act="next">Continue</button>
      </div></div>`),
    );
  }

  showResult(match: Match, userTeam: TeamId) {
    const res = match.result()!;
    const potm = match.playerOfTheMatch();
    const won = res.winner === userTeam;
    this.hud.classList.add('hidden');
    this.setSheet(null);
    this.tabs = match.innings.map((inn) => scorecard(match, inn));
    const [a, b] = match.innings;
    const line = (inn: typeof a) => `${match.team(inn.battingTeam).short} ${inn.score}/${inn.wickets} (${match.oversText(inn)})`;
    this.setScreen(
      el(`<div class="screen solid top"><div class="inner">
        <h2 class="head">Match result</h2>
        <div class="result-line ${res.winner === 'tie' ? '' : won ? 'win' : 'lose'}">${esc(res.text)}</div>
        <p class="sub">${line(a)} · ${line(b)}</p>
        ${potm ? `<div class="card potm"><div class="star">★</div><div><span>Player of the match</span><b>${esc(potm.player.name)} (${potm.team})</b><span>${esc(potm.line)}</span></div></div>` : ''}
        <button class="cta" data-act="quit">PLAY AGAIN</button>
        <div class="tabs">
          <button data-tab="0" class="sel">${match.team(a.battingTeam).short} innings</button>
          <button data-tab="1">${match.team(b.battingTeam).short} innings</button>
        </div>
        <div data-tabhost>${this.tabs[0]}</div>
        <button class="ghost" data-act="quit">Back to menu</button>
      </div></div>`),
    );
  }
}
