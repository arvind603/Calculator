import { describe, expect, it } from 'vitest';
import { Match, maxOversPerBowler, POWERPLAY_OVERS, type MatchConfig } from '../src/sim/match';
import { defaultXi, makeTeam, validateXi, RCB_SQUAD, CSK_SQUAD } from '../src/sim/squads';
import type { BallEvent, OversOption, TeamId } from '../src/sim/types';

function config(overs: OversOption = 2, battingFirst: TeamId = 'RCB'): MatchConfig {
  return {
    overs,
    difficulty: 'normal',
    battingFirst,
    teams: { RCB: makeTeam('RCB', defaultXi('RCB')), CSK: makeTeam('CSK', defaultXi('CSK')) },
  };
}

const run = (n: number): BallEvent => ({ runsBat: n });
const dot = run(0);

function start(overs: OversOption = 2): Match {
  const m = new Match(config(overs));
  m.setBowler(m.eligibleBowlers()[0].id);
  return m;
}

/** Bowls dots until the over ends, then selects the next bowler. */
function nextOver(m: Match) {
  if (m.needsBowler && !m.current.complete) m.setBowler(m.eligibleBowlers()[0].id);
}

describe('scoring', () => {
  it('adds runs to the team, the striker and the bowler', () => {
    const m = start();
    const inn = m.current;
    const striker = inn.strikerId!;
    m.applyBall(run(2));
    m.applyBall({ runsBat: 4, boundary: 4 });
    m.applyBall({ runsBat: 6, boundary: 6 });
    expect(inn.score).toBe(12);
    const card = m.batCard(inn, striker);
    expect(card).toMatchObject({ runs: 12, balls: 3, fours: 1, sixes: 1 });
    expect(m.bowlCard(inn, inn.bowlerId!)).toMatchObject({ runs: 12, balls: 3 });
  });

  it('counts a wide as one extra and does not count the ball', () => {
    const m = start();
    const inn = m.current;
    const striker = inn.strikerId!;
    const s = m.applyBall({ runsBat: 0, wide: true });
    expect(inn.score).toBe(1);
    expect(inn.legalBalls).toBe(0);
    expect(inn.extras.wides).toBe(1);
    expect(m.batCard(inn, striker).balls).toBe(0);
    expect(m.bowlCard(inn, inn.bowlerId!)).toMatchObject({ runs: 1, wides: 1, balls: 0 });
    expect(s.record.label).toBe('wd');
  });

  it('counts a no-ball as one extra plus the runs off the bat', () => {
    const m = start();
    const inn = m.current;
    const striker = inn.strikerId!;
    m.applyBall({ runsBat: 4, boundary: 4, noBall: true });
    expect(inn.score).toBe(5);
    expect(inn.legalBalls).toBe(0);
    expect(inn.extras.noBalls).toBe(1);
    expect(m.batCard(inn, striker)).toMatchObject({ runs: 4, balls: 1 });
    expect(m.bowlCard(inn, inn.bowlerId!).runs).toBe(5);
  });

  it('does not charge byes and leg byes to the bowler', () => {
    const m = start();
    const inn = m.current;
    m.applyBall({ runsBat: 0, byes: 2 });
    m.applyBall({ runsBat: 0, legByes: 1 });
    expect(inn.score).toBe(3);
    expect(m.bowlCard(inn, inn.bowlerId!).runs).toBe(0);
    expect(inn.extras).toMatchObject({ byes: 2, legByes: 1 });
  });

  it('calculates the run rate', () => {
    const m = start();
    for (let i = 0; i < 3; i++) m.applyBall(run(2));
    expect(m.runRate()).toBeCloseTo(12);
    expect(m.oversText()).toBe('0.3');
  });
});

describe('overs', () => {
  it('ends the over after six legal balls only', () => {
    const m = start();
    const inn = m.current;
    for (let i = 0; i < 5; i++) expect(m.applyBall(dot).overComplete).toBe(false);
    expect(m.applyBall({ runsBat: 0, wide: true }).overComplete).toBe(false);
    expect(m.applyBall({ runsBat: 0, noBall: true }).overComplete).toBe(false);
    expect(m.applyBall(dot).overComplete).toBe(true);
    expect(inn.legalBalls).toBe(6);
    expect(m.needsBowler).toBe(true);
    expect(m.oversText()).toBe('1.0');
  });

  it('records a maiden over', () => {
    const m = start();
    const bowler = m.current.bowlerId!;
    for (let i = 0; i < 6; i++) m.applyBall(dot);
    expect(m.bowlCard(m.current, bowler).maidens).toBe(1);
  });

  it('ends the innings when the overs are complete', () => {
    const m = start(2);
    for (let o = 0; o < 2; o++) {
      nextOver(m);
      for (let i = 0; i < 6; i++) m.applyBall(run(1));
    }
    expect(m.current.complete).toBe(true);
    expect(m.current.score).toBe(12);
    expect(() => m.applyBall(dot)).toThrow();
  });

  it('gives the correct phases', () => {
    const m = start(20);
    expect(m.phase()).toBe('powerplay');
    m.current.legalBalls = 6 * POWERPLAY_OVERS[20];
    expect(m.phase()).toBe('middle');
    m.current.legalBalls = 6 * 16;
    expect(m.phase()).toBe('death');
  });
});

describe('strike rotation', () => {
  it('swaps the batters on odd runs', () => {
    const m = start();
    const inn = m.current;
    const [a, b] = [inn.strikerId, inn.nonStrikerId];
    m.applyBall(run(1));
    expect(inn.strikerId).toBe(b);
    m.applyBall(run(2));
    expect(inn.strikerId).toBe(b);
    m.applyBall(run(3));
    expect(inn.strikerId).toBe(a);
  });

  it('does not swap on a boundary', () => {
    const m = start();
    const a = m.current.strikerId;
    m.applyBall({ runsBat: 4, boundary: 4 });
    m.applyBall({ runsBat: 6, boundary: 6 });
    expect(m.current.strikerId).toBe(a);
  });

  it('swaps the batters at the end of the over', () => {
    const m = start();
    const inn = m.current;
    const [a, b] = [inn.strikerId, inn.nonStrikerId];
    for (let i = 0; i < 6; i++) m.applyBall(dot);
    expect(inn.strikerId).toBe(b);
    expect(inn.nonStrikerId).toBe(a);
  });

  it('a single off the last ball keeps the same batter on strike', () => {
    const m = start();
    const inn = m.current;
    const a = inn.strikerId;
    for (let i = 0; i < 5; i++) m.applyBall(dot);
    m.applyBall(run(1));
    expect(inn.strikerId).toBe(a);
  });

  it('puts the new batter on strike after a catch', () => {
    const m = start();
    const inn = m.current;
    const [a, b] = [inn.strikerId!, inn.nonStrikerId!];
    m.applyBall({ runsBat: 0, wicket: { kind: 'caught', batterId: a, fielderId: 'ms-dhoni' }, swapEnds: false });
    expect(inn.wickets).toBe(1);
    expect(inn.nonStrikerId).toBe(b);
    expect(inn.strikerId).toBe(inn.bat[2].id);
    expect(m.batCard(inn, a).out).toBe(true);
  });

  it('handles a run out of the non-striker on the second run', () => {
    const m = start();
    const inn = m.current;
    const [a, b] = [inn.strikerId!, inn.nonStrikerId!];
    // One run completed. B is run out at the bowler's end on the second run.
    m.applyBall({ runsBat: 1, wicket: { kind: 'runOut', batterId: b }, swapEnds: false });
    expect(inn.score).toBe(1);
    expect(inn.strikerId).toBe(a);
    expect(inn.nonStrikerId).toBe(inn.bat[2].id);
    expect(m.bowlCard(inn, inn.bowlerId!).wickets).toBe(0);
  });
});

describe('bowler quotas', () => {
  it('gives one fifth of the overs to each bowler', () => {
    expect(maxOversPerBowler(20)).toBe(4);
    expect(maxOversPerBowler(10)).toBe(2);
    expect(maxOversPerBowler(5)).toBe(1);
    expect(maxOversPerBowler(2)).toBe(1);
  });

  it('does not let a bowler bowl two overs in a row', () => {
    const m = start(10);
    const first = m.current.bowlerId!;
    for (let i = 0; i < 6; i++) m.applyBall(dot);
    expect(m.eligibleBowlers().some((p) => p.id === first)).toBe(false);
    expect(() => m.setBowler(first)).toThrow();
    const second = m.eligibleBowlers()[0].id;
    m.setBowler(second);
    for (let i = 0; i < 6; i++) m.applyBall(dot);
    expect(m.eligibleBowlers().some((p) => p.id === first)).toBe(true);
    expect(m.eligibleBowlers().some((p) => p.id === second)).toBe(false);
  });

  it('removes a bowler who has completed the quota', () => {
    const m = start(10);
    const first = m.current.bowlerId!;
    const other = m.eligibleBowlers().find((p) => p.id !== first)!.id;
    for (let o = 0; o < 4; o++) {
      if (m.needsBowler) m.setBowler(o % 2 === 0 ? first : other);
      for (let i = 0; i < 6; i++) m.applyBall(dot);
    }
    // Both have bowled 2 overs = the quota for a 10-over match.
    const el = m.eligibleBowlers().map((p) => p.id);
    expect(el).not.toContain(first);
    expect(el).not.toContain(other);
  });

  it('does not let the keeper bowl and does not change the bowler during an over', () => {
    const m = start();
    const keeper = m.team(m.current.bowlingTeam).keeperId;
    expect(m.eligibleBowlers().some((p) => p.id === keeper)).toBe(false);
    const other = m.eligibleBowlers().find((p) => p.id !== m.current.bowlerId)!.id;
    expect(() => m.setBowler(other)).toThrow();
  });

  it('can always complete a 20-over innings with the default XIs', () => {
    for (const first of ['RCB', 'CSK'] as TeamId[]) {
      const m = new Match(config(20, first));
      for (let o = 0; o < 20; o++) {
        const el = m.eligibleBowlers();
        expect(el.length).toBeGreaterThan(0);
        m.setBowler(el[0].id);
        for (let i = 0; i < 6; i++) m.applyBall(dot);
      }
      const max = Math.max(...m.current.bowl.map((b) => b.balls));
      expect(max).toBeLessThanOrEqual(24);
    }
  });
});

describe('free hits', () => {
  it('gives a free hit after a no-ball', () => {
    const m = start();
    expect(m.current.freeHit).toBe(false);
    m.applyBall({ runsBat: 0, noBall: true });
    expect(m.current.freeHit).toBe(true);
    m.applyBall(run(1));
    expect(m.current.freeHit).toBe(false);
  });

  it('keeps the free hit after a wide or a second no-ball', () => {
    const m = start();
    m.applyBall({ runsBat: 0, noBall: true });
    m.applyBall({ runsBat: 0, wide: true });
    expect(m.current.freeHit).toBe(true);
    m.applyBall({ runsBat: 0, noBall: true });
    expect(m.current.freeHit).toBe(true);
    m.applyBall(dot);
    expect(m.current.freeHit).toBe(false);
  });

  it('does not allow bowled, caught, LBW or stumped on a free hit', () => {
    for (const kind of ['bowled', 'caught', 'caughtBehind', 'lbw', 'stumped'] as const) {
      const m = start();
      const striker = m.current.strikerId!;
      m.applyBall({ runsBat: 0, noBall: true });
      const s = m.applyBall({ runsBat: 0, wicket: { kind, batterId: striker } });
      expect(s.wicket).toBeNull();
      expect(s.wicketDisallowed).toBe(true);
      expect(m.current.wickets).toBe(0);
      expect(m.batCard(m.current, striker).out).toBe(false);
    }
  });

  it('allows a run out on a free hit and on a no-ball', () => {
    const m = start();
    const striker = m.current.strikerId!;
    m.applyBall({ runsBat: 0, noBall: true });
    const s = m.applyBall({ runsBat: 0, wicket: { kind: 'runOut', batterId: striker }, swapEnds: false });
    expect(s.wicket?.kind).toBe('runOut');
    expect(m.current.wickets).toBe(1);
    const m2 = start();
    const s2 = m2.applyBall({ runsBat: 0, noBall: true, wicket: { kind: 'bowled', batterId: m2.current.strikerId! } });
    expect(s2.wicket).toBeNull();
  });

  it('allows only a run out or a stumping off a wide', () => {
    const m = start();
    const striker = m.current.strikerId!;
    expect(m.applyBall({ runsBat: 0, wide: true, wicket: { kind: 'bowled', batterId: striker } }).wicket).toBeNull();
    expect(m.applyBall({ runsBat: 0, wide: true, wicket: { kind: 'stumped', batterId: striker } }).wicket?.kind).toBe('stumped');
  });
});

describe('wickets and all out', () => {
  it('ends the innings after 10 wickets', () => {
    const m = start(20);
    for (let w = 0; w < 10; w++) {
      nextOver(m);
      const s = m.applyBall({ runsBat: 0, wicket: { kind: 'bowled', batterId: m.current.strikerId! } });
      expect(s.inningsComplete).toBe(w === 9);
    }
    expect(m.current.wickets).toBe(10);
    expect(m.current.fow).toHaveLength(10);
    expect(m.current.bat.filter((b) => b.out)).toHaveLength(10);
  });

  it('credits the bowler but not for a run out', () => {
    const m = start();
    const bowler = m.current.bowlerId!;
    m.applyBall({ runsBat: 0, wicket: { kind: 'lbw', batterId: m.current.strikerId! } });
    m.applyBall({ runsBat: 0, wicket: { kind: 'runOut', batterId: m.current.strikerId! }, swapEnds: false });
    expect(m.bowlCard(m.current, bowler).wickets).toBe(1);
    expect(m.current.wickets).toBe(2);
  });
});

describe('end of chase', () => {
  function firstInnings(m: Match, runsPerBall: number) {
    while (!m.current.complete) {
      nextOver(m);
      m.applyBall(run(runsPerBall));
    }
  }

  it('sets the target to one more than the first innings score', () => {
    const m = new Match(config(2));
    firstInnings(m, 2);
    expect(m.innings[0].score).toBe(24);
    const inn2 = m.startSecondInnings();
    expect(inn2.target).toBe(25);
    expect(inn2.battingTeam).toBe('CSK');
    expect(m.requiredRate()).toBeCloseTo(12.5);
    expect(m.runsNeeded()).toBe(25);
  });

  it('ends the match as soon as the target is reached', () => {
    const m = new Match(config(2));
    firstInnings(m, 1);
    m.startSecondInnings();
    nextOver(m);
    m.applyBall({ runsBat: 6, boundary: 6 });
    expect(m.complete).toBe(false);
    m.applyBall({ runsBat: 6, boundary: 6 });
    expect(m.complete).toBe(false);
    const s = m.applyBall(run(1));
    expect(s.matchComplete).toBe(true);
    expect(m.complete).toBe(true);
    expect(m.current.legalBalls).toBe(3);
    const r = m.result()!;
    expect(r.winner).toBe('CSK');
    expect(r.text).toContain('10 wickets');
    expect(r.text).toContain('9 balls left');
    expect(() => m.applyBall(dot)).toThrow();
  });

  it('gives the win to the team that defends the score', () => {
    const m = new Match(config(2));
    firstInnings(m, 2);
    m.startSecondInnings();
    firstInnings(m, 1);
    expect(m.complete).toBe(true);
    expect(m.result()).toMatchObject({ winner: 'RCB', text: 'RCB won by 12 runs' });
  });

  it('reports a tie', () => {
    const m = new Match(config(2));
    firstInnings(m, 1);
    m.startSecondInnings();
    firstInnings(m, 1);
    expect(m.result()!.winner).toBe('tie');
  });

  it('ends the chase when the chasing team is all out', () => {
    const m = new Match(config(2));
    firstInnings(m, 3);
    m.startSecondInnings();
    while (!m.complete) {
      nextOver(m);
      m.applyBall({ runsBat: 0, wicket: { kind: 'bowled', batterId: m.current.strikerId! } });
    }
    expect(m.current.wickets).toBe(10);
    expect(m.result()!.winner).toBe('RCB');
    expect(m.playerOfTheMatch()).not.toBeNull();
  });

  it('a target reached with a wide ends the match', () => {
    const m = new Match(config(2));
    firstInnings(m, 0);
    m.startSecondInnings();
    nextOver(m);
    const s = m.applyBall({ runsBat: 0, wide: true });
    expect(s.matchComplete).toBe(true);
  });
});

describe('squads', () => {
  it('has valid default XIs', () => {
    expect(validateXi(defaultXi('RCB')).ok).toBe(true);
    expect(validateXi(defaultXi('CSK')).ok).toBe(true);
    expect(RCB_SQUAD.length).toBeGreaterThanOrEqual(25);
    expect(CSK_SQUAD.length).toBeGreaterThanOrEqual(25);
  });

  it('rejects an XI with too many overseas players or no keeper', () => {
    const xi = defaultXi('RCB');
    const overseas = RCB_SQUAD.filter((p) => p.overseas && !xi.includes(p)).slice(0, 2);
    const bad = [...xi.filter((p) => !p.overseas || p.role === 'wk').slice(0, 9), ...overseas];
    const many = [...xi];
    many[1] = overseas[0];
    many[2] = overseas[1];
    expect(validateXi(many).ok).toBe(false);
    const noKeeper = xi.filter((p) => p.role !== 'wk');
    expect(validateXi([...noKeeper, ...RCB_SQUAD.filter((p) => !xi.includes(p) && p.role === 'bat')].slice(0, 11)).ok).toBe(false);
    void bad;
  });

  it('has unique player ids', () => {
    const ids = [...RCB_SQUAD, ...CSK_SQUAD].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
