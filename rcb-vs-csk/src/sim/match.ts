import type {
  BallEvent,
  BallRecord,
  BatCard,
  BowlCard,
  Difficulty,
  DismissalKind,
  FallOfWicket,
  OversOption,
  Phase,
  Player,
  TeamId,
  TeamSheet,
  Wicket,
} from './types';

export interface MatchConfig {
  overs: OversOption;
  difficulty: Difficulty;
  /** Team that bats first. */
  battingFirst: TeamId;
  teams: Record<TeamId, TeamSheet>;
}

export interface Innings {
  battingTeam: TeamId;
  bowlingTeam: TeamId;
  bat: BatCard[];
  bowl: BowlCard[];
  score: number;
  wickets: number;
  legalBalls: number;
  extras: { wides: number; noBalls: number; byes: number; legByes: number };
  strikerId: string | null;
  nonStrikerId: string | null;
  nextBatIdx: number;
  bowlerId: string | null;
  lastOverBowlerId: string | null;
  balls: BallRecord[];
  fow: FallOfWicket[];
  freeHit: boolean;
  complete: boolean;
  target: number | null;
}

export interface BallSummary {
  record: BallRecord;
  wicket: Wicket | null;
  /** True if the event had a wicket that the rules do not allow (free hit, no-ball, wide). */
  wicketDisallowed: boolean;
  overComplete: boolean;
  inningsComplete: boolean;
  matchComplete: boolean;
  runs: number;
}

export interface MatchResult {
  winner: TeamId | 'tie';
  text: string;
}

export const POWERPLAY_OVERS: Record<OversOption, number> = { 2: 1, 5: 2, 10: 3, 20: 6 };
export const DEATH_OVERS: Record<OversOption, number> = { 2: 1, 5: 1, 10: 2, 20: 4 };

export const maxOversPerBowler = (overs: number) => Math.ceil(overs / 5);

const DISMISSAL_TEXT: Record<DismissalKind, string> = {
  bowled: 'b',
  caught: 'c',
  caughtBehind: 'c †',
  lbw: 'lbw b',
  runOut: 'run out',
  stumped: 'st †',
};

export class Match {
  readonly config: MatchConfig;
  readonly innings: Innings[] = [];
  private playerIndex = new Map<string, Player>();

  constructor(config: MatchConfig) {
    this.config = config;
    for (const t of Object.values(config.teams)) for (const pl of t.xi) this.playerIndex.set(pl.id, pl);
    this.innings.push(this.newInnings(config.battingFirst, null));
  }

  // ---------- Queries ----------

  get current(): Innings {
    return this.innings[this.innings.length - 1];
  }

  get inningsNumber(): number {
    return this.innings.length;
  }

  get complete(): boolean {
    return this.innings.length === 2 && this.innings[1].complete;
  }

  get totalBalls(): number {
    return this.config.overs * 6;
  }

  player(id: string): Player {
    const pl = this.playerIndex.get(id);
    if (!pl) throw new Error(`Unknown player ${id}`);
    return pl;
  }

  team(id: TeamId): TeamSheet {
    return this.config.teams[id];
  }

  batCard(inn: Innings, id: string): BatCard {
    return inn.bat.find((b) => b.id === id)!;
  }

  bowlCard(inn: Innings, id: string): BowlCard {
    return inn.bowl.find((b) => b.id === id)!;
  }

  /** Completed overs in the current innings. */
  oversText(inn: Innings = this.current): string {
    return `${Math.floor(inn.legalBalls / 6)}.${inn.legalBalls % 6}`;
  }

  ballsLeft(inn: Innings = this.current): number {
    return this.totalBalls - inn.legalBalls;
  }

  runRate(inn: Innings = this.current): number {
    return inn.legalBalls ? (inn.score * 6) / inn.legalBalls : 0;
  }

  runsNeeded(inn: Innings = this.current): number | null {
    return inn.target === null ? null : Math.max(0, inn.target - inn.score);
  }

  requiredRate(inn: Innings = this.current): number | null {
    if (inn.target === null) return null;
    const left = this.ballsLeft(inn);
    const need = Math.max(0, inn.target - inn.score);
    if (left <= 0) return need > 0 ? Infinity : 0;
    return (need * 6) / left;
  }

  phase(inn: Innings = this.current): Phase {
    const over = Math.floor(inn.legalBalls / 6);
    if (over < POWERPLAY_OVERS[this.config.overs]) return 'powerplay';
    if (over >= this.config.overs - DEATH_OVERS[this.config.overs]) return 'death';
    return 'middle';
  }

  /** True when a new over must start and a bowler must be selected. */
  get needsBowler(): boolean {
    return !this.current.complete && this.current.bowlerId === null;
  }

  /** Bowlers that the rules allow for the next over. */
  eligibleBowlers(inn: Innings = this.current): Player[] {
    const team = this.team(inn.bowlingTeam);
    const quota = maxOversPerBowler(this.config.overs) * 6;
    const candidates = team.xi.filter((pl) => pl.bowl && pl.id !== team.keeperId);
    const notLast = candidates.filter((pl) => pl.id !== inn.lastOverBowlerId);
    const withQuota = notLast.filter((pl) => this.bowlCard(inn, pl.id).balls < quota);
    // If the captain has used the quotas badly, relax the quota. The no-consecutive-overs rule stays.
    return withQuota.length ? withQuota : notLast;
  }

  oversBowled(inn: Innings, id: string): string {
    const c = this.bowlCard(inn, id);
    return `${Math.floor(c.balls / 6)}${c.balls % 6 ? '.' + (c.balls % 6) : ''}`;
  }

  thisOver(inn: Innings = this.current): BallRecord[] {
    if (inn.bowlerId === null) {
      // Over just completed: show the last over.
      const lastOver = Math.floor((inn.legalBalls - 1) / 6);
      return inn.balls.filter((b) => b.over === lastOver);
    }
    const over = Math.floor(inn.legalBalls / 6);
    return inn.balls.filter((b) => b.over === over);
  }

  // ---------- Commands ----------

  setBowler(id: string): void {
    const inn = this.current;
    if (inn.complete) throw new Error('Innings is complete');
    if (inn.bowlerId !== null) throw new Error('An over is in progress');
    if (!this.eligibleBowlers(inn).some((pl) => pl.id === id)) throw new Error(`${id} cannot bowl this over`);
    inn.bowlerId = id;
    this.bowlCard(inn, id).thisOverRuns = 0;
  }

  applyBall(ev: BallEvent): BallSummary {
    const inn = this.current;
    if (inn.complete) throw new Error('Innings is complete');
    if (!inn.bowlerId) throw new Error('No bowler selected');
    if (!inn.strikerId || !inn.nonStrikerId) throw new Error('No batters at the crease');

    const bowler = this.bowlCard(inn, inn.bowlerId);
    const strikerId = inn.strikerId;
    const striker = this.batCard(inn, strikerId);
    const wide = !!ev.wide;
    const noBall = !!ev.noBall && !wide;
    const legal = !wide && !noBall;
    const byes = ev.byes ?? 0;
    const legByes = ev.legByes ?? 0;
    const runsBat = wide ? 0 : ev.runsBat;
    const boundary = wide ? 0 : (ev.boundary ?? 0);

    // --- Wicket validity ---
    let wicket: Wicket | null = ev.wicket ?? null;
    let wicketDisallowed = false;
    if (wicket) {
      const k = wicket.kind;
      const freeHitBall = inn.freeHit || noBall;
      if (freeHitBall && k !== 'runOut') wicket = null;
      else if (wide && k !== 'runOut' && k !== 'stumped') wicket = null;
      if (!wicket) wicketDisallowed = true;
    }

    // --- Runs ---
    const wideRuns = wide ? 1 + byes : 0;
    const total = runsBat + wideRuns + (noBall ? 1 : 0) + (wide ? 0 : byes + legByes);
    inn.score += total;
    if (wide) inn.extras.wides += wideRuns;
    else {
      inn.extras.byes += byes;
      inn.extras.legByes += legByes;
    }
    if (noBall) inn.extras.noBalls += 1;

    striker.batted = true;
    if (!wide) striker.balls += 1;
    striker.runs += runsBat;
    if (boundary === 4) striker.fours += 1;
    if (boundary === 6) striker.sixes += 1;

    const conceded = runsBat + wideRuns + (noBall ? 1 : 0);
    bowler.runs += conceded;
    bowler.thisOverRuns += conceded;
    if (wide) bowler.wides += wideRuns;
    if (noBall) bowler.noBalls += 1;
    if (legal) {
      bowler.balls += 1;
      inn.legalBalls += 1;
      if (total === 0) bowler.dots += 1;
    }

    // --- Ends ---
    const runsRun = boundary ? 0 : runsBat + byes + legByes;
    const swap = ev.swapEnds ?? runsRun % 2 === 1;
    if (swap) this.swapEnds(inn);

    // --- Wicket ---
    if (wicket) {
      const outCard = this.batCard(inn, wicket.batterId);
      outCard.out = true;
      outCard.batted = true;
      outCard.how = this.howOut(wicket, inn.bowlerId);
      inn.wickets += 1;
      if (wicket.kind !== 'runOut') bowler.wickets += 1;
      inn.fow.push({ wicket: inn.wickets, score: inn.score, batterId: wicket.batterId, balls: inn.legalBalls });
      const next = inn.nextBatIdx < inn.bat.length ? inn.bat[inn.nextBatIdx] : null;
      if (next) {
        inn.nextBatIdx += 1;
        next.batted = true;
      }
      if (inn.strikerId === wicket.batterId) inn.strikerId = next ? next.id : null;
      else inn.nonStrikerId = next ? next.id : null;
    }

    // --- Record ---
    const overIndex = legal ? Math.floor((inn.legalBalls - 1) / 6) : Math.floor(inn.legalBalls / 6);
    const record: BallRecord = {
      over: overIndex,
      ball: legal ? ((inn.legalBalls - 1) % 6) + 1 : (inn.legalBalls % 6) + 1,
      bowlerId: inn.bowlerId,
      strikerId,
      runsBat,
      total,
      legal,
      label: this.label(runsBat, wide, noBall, byes, legByes, wicket),
      wicket: wicket ?? undefined,
      boundary: boundary as 0 | 4 | 6,
      angle: wide ? undefined : ev.angle,
      dist: wide ? undefined : ev.dist,
      hand: this.player(strikerId).hand,
    };
    inn.balls.push(record);

    // --- Free hit ---
    inn.freeHit = noBall || (inn.freeHit && !legal);

    // --- Innings end ---
    const chaseWon = inn.target !== null && inn.score >= inn.target;
    const allOut = inn.wickets >= 10 || inn.strikerId === null || inn.nonStrikerId === null;
    const oversDone = inn.legalBalls >= this.totalBalls;
    let overComplete = false;
    if (legal && inn.legalBalls % 6 === 0) {
      overComplete = true;
      if (bowler.thisOverRuns === 0) bowler.maidens += 1;
      inn.lastOverBowlerId = inn.bowlerId;
      inn.bowlerId = null;
      if (!chaseWon && !allOut && !oversDone) this.swapEnds(inn);
    }
    if (chaseWon || allOut || oversDone) {
      inn.complete = true;
      inn.freeHit = false;
    }

    return {
      record,
      wicket,
      wicketDisallowed,
      overComplete,
      inningsComplete: inn.complete,
      matchComplete: this.complete,
      runs: total,
    };
  }

  /** Starts the second innings. Call it after the first innings is complete. */
  startSecondInnings(): Innings {
    if (this.innings.length !== 1 || !this.innings[0].complete) throw new Error('First innings is not complete');
    const first = this.innings[0];
    const inn = this.newInnings(first.bowlingTeam, first.score + 1);
    this.innings.push(inn);
    return inn;
  }

  result(): MatchResult | null {
    if (!this.complete) return null;
    const [a, b] = this.innings;
    const nameA = this.team(a.battingTeam).short;
    const nameB = this.team(b.battingTeam).short;
    if (b.score > a.score) {
      const wk = 10 - b.wickets;
      const left = this.ballsLeft(b);
      return {
        winner: b.battingTeam,
        text: `${nameB} won by ${wk} wicket${wk === 1 ? '' : 's'} (${left} ball${left === 1 ? '' : 's'} left)`,
      };
    }
    if (a.score > b.score) {
      const r = a.score - b.score;
      return { winner: a.battingTeam, text: `${nameA} won by ${r} run${r === 1 ? '' : 's'}` };
    }
    return { winner: 'tie', text: 'Match tied' };
  }

  /** Simple impact score to select the player of the match. */
  playerOfTheMatch(): { player: Player; team: TeamId; line: string } | null {
    const res = this.result();
    if (!res) return null;
    let best: { player: Player; team: TeamId; line: string; score: number } | null = null;
    for (const inn of this.innings) {
      const consider = (id: string, team: TeamId) => {
        const pl = this.player(id);
        const bat = this.innings.find((i) => i.battingTeam === team)?.bat.find((c) => c.id === id);
        const bowl = this.innings.find((i) => i.bowlingTeam === team)?.bowl.find((c) => c.id === id);
        let score = 0;
        const parts: string[] = [];
        if (bat && bat.batted) {
          const sr = bat.balls ? (bat.runs * 100) / bat.balls : 0;
          score += bat.runs * (1 + Math.max(0, sr - 120) / 200) + bat.sixes;
          if (bat.balls > 0) parts.push(`${bat.runs}${bat.out ? '' : '*'} (${bat.balls})`);
        }
        if (bowl && bowl.balls > 0) {
          const econ = (bowl.runs * 6) / bowl.balls;
          score += bowl.wickets * 22 + Math.max(0, 9 - econ) * (bowl.balls / 6) * 2.5;
          parts.push(`${bowl.wickets}/${bowl.runs} (${Math.floor(bowl.balls / 6)}.${bowl.balls % 6})`);
        }
        if (res.winner === team) score *= 1.25;
        if (!best || score > best.score) best = { player: pl, team, line: parts.join(' and '), score };
      };
      for (const c of inn.bat) consider(c.id, inn.battingTeam);
    }
    return best;
  }

  // ---------- Internals ----------

  private newInnings(battingTeam: TeamId, target: number | null): Innings {
    const bowlingTeam: TeamId = battingTeam === 'RCB' ? 'CSK' : 'RCB';
    const bat: BatCard[] = this.team(battingTeam).xi.map((pl) => ({
      id: pl.id,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      batted: false,
      how: '',
    }));
    const bowl: BowlCard[] = this.team(bowlingTeam).xi.map((pl) => ({
      id: pl.id,
      balls: 0,
      runs: 0,
      wickets: 0,
      wides: 0,
      noBalls: 0,
      dots: 0,
      maidens: 0,
      thisOverRuns: 0,
    }));
    bat[0].batted = true;
    bat[1].batted = true;
    return {
      battingTeam,
      bowlingTeam,
      bat,
      bowl,
      score: 0,
      wickets: 0,
      legalBalls: 0,
      extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
      strikerId: bat[0].id,
      nonStrikerId: bat[1].id,
      nextBatIdx: 2,
      bowlerId: null,
      lastOverBowlerId: null,
      balls: [],
      fow: [],
      freeHit: false,
      complete: false,
      target,
    };
  }

  private swapEnds(inn: Innings): void {
    const s = inn.strikerId;
    inn.strikerId = inn.nonStrikerId;
    inn.nonStrikerId = s;
  }

  private howOut(w: Wicket, bowlerId: string): string {
    const b = this.player(bowlerId).short;
    const f = w.fielderId ? this.player(w.fielderId).short : '';
    switch (w.kind) {
      case 'bowled':
        return `b ${b}`;
      case 'lbw':
        return `lbw b ${b}`;
      case 'caught':
        return w.fielderId === bowlerId ? `c & b ${b}` : `c ${f} b ${b}`;
      case 'caughtBehind':
        return `c †${f} b ${b}`;
      case 'stumped':
        return `st †${f} b ${b}`;
      case 'runOut':
        return f ? `run out (${f})` : 'run out';
    }
  }

  private label(runs: number, wide: boolean, noBall: boolean, byes: number, legByes: number, w: Wicket | null): string {
    let s: string;
    if (wide) s = byes ? `${byes + 1}wd` : 'wd';
    else if (noBall) s = runs ? `nb+${runs}` : 'nb';
    else if (byes) s = `${byes}b`;
    else if (legByes) s = `${legByes}lb`;
    else s = runs === 0 ? '•' : String(runs);
    if (w) s = s === '•' ? 'W' : `${s}+W`;
    return s;
  }
}

export { DISMISSAL_TEXT };
