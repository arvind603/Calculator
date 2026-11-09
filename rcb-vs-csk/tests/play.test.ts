import { describe, expect, it } from 'vitest';
import { aiDelivery, aimAtStumps, userDelivery } from '../src/sim/ai';
import { GOOD_PLAYER, playMatch } from '../src/sim/autoplay';
import { BallSim, buildFielders, type BallContext } from '../src/sim/ballsim';
import { Delivery, type DeliverySpec } from '../src/sim/delivery';
import {
  ALL_FIELD_KEYS,
  BAT_Z,
  BOUNDARY_R,
  IDEAL_TAP_DIST,
  STRIKER_STUMPS_Z,
  checkField,
  getField,
  maxOutsideRing,
} from '../src/sim/field';
import { planFielding, simulatePath } from '../src/sim/fielding';
import type { MatchConfig } from '../src/sim/match';
import { Rng } from '../src/sim/rng';
import { resolveShot, shotName, type ShotType } from '../src/sim/shot';
import { CSK_SQUAD, RCB_SQUAD, defaultXi, makeTeam } from '../src/sim/squads';
import type { BowlKind, Hand, OversOption, Phase } from '../src/sim/types';

const kohli = RCB_SQUAD.find((p) => p.id === 'virat-kohli')!;
const iyer = RCB_SQUAD.find((p) => p.id === 'venkatesh-iyer')!;
const henry = CSK_SQUAD.find((p) => p.id === 'matt-henry')!;
const noor = CSK_SQUAD.find((p) => p.id === 'noor-ahmad')!;

const spec = (o: Partial<DeliverySpec> = {}): DeliverySpec => ({
  kind: 'pace',
  arm: 'R',
  variation: 'stock',
  speedKmh: 138,
  pitchX: -0.1,
  length: 6.3,
  swing: 0,
  cut: 0,
  noBall: false,
  ...o,
});

function ctx(o: Partial<BallContext> = {}, seed = 7): BallContext {
  const striker = o.striker ?? kohli;
  const bowler = o.bowler ?? henry;
  return {
    rng: new Rng(seed),
    difficulty: 'normal',
    striker,
    nonStriker: iyer,
    bowler,
    fielders: buildFielders(makeTeam('CSK', defaultXi('CSK')), bowler, striker, 'middle', 'normal'),
    spec: spec(),
    freeHit: false,
    userBatting: true,
    situation: { phase: 'middle', ballsLeft: 60, wicketsDown: 0, score: 0, target: null, oversTotal: 10 },
    ...o,
  };
}

/** Steps the sim. Swings when the ball is at the given distance. */
function play(sim: BallSim, type: ShotType | null, angle = 0, tapDist = IDEAL_TAP_DIST, run = false) {
  let guard = 0;
  while (sim.phase !== 'done' && guard++ < 20000) {
    sim.step(1 / 120);
    if (type && sim.canSwing && sim.ball.z - BAT_Z <= tapDist) sim.swing(type, angle);
    if (run && sim.canRun) sim.callRun();
  }
  return sim.outcome!;
}

describe('field settings', () => {
  it('obeys the powerplay and leg-side limits for both hands', () => {
    for (const key of ALL_FIELD_KEYS) {
      const [phase, kind] = key.split('-') as [Phase, BowlKind];
      for (const hand of ['R', 'L'] as Hand[]) {
        const f = getField(phase, kind, hand);
        const c = checkField(f, hand);
        expect(f).toHaveLength(9);
        expect(c.outsideRing, key).toBeLessThanOrEqual(maxOutsideRing(phase));
        expect(c.legSide, key).toBeLessThanOrEqual(5);
        expect(c.behindSquareLeg, key).toBeLessThanOrEqual(2);
        expect(c.insideBoundary, key).toBe(true);
      }
    }
  });

  it('mirrors the field for a left-hander', () => {
    const r = getField('middle', 'pace', 'R');
    const l = getField('middle', 'pace', 'L');
    r.forEach((s, i) => {
      expect(l[i].x).toBeCloseTo(-s.x);
      expect(l[i].z).toBeCloseTo(s.z);
    });
  });
});

describe('delivery', () => {
  it('pitches at the target and reaches the stumps', () => {
    const d = new Delivery(spec({ pitchX: 0.2, length: 6 }), 0.6);
    const p = d.pos(d.tPitch);
    expect(p.x).toBeCloseTo(0.2, 2);
    expect(p.y).toBeCloseTo(0, 2);
    expect(p.z).toBeCloseTo(STRIKER_STUMPS_Z + 6, 2);
    expect(d.tStumps).toBeGreaterThan(d.tPitch);
    expect(d.pos(d.tStumps).z).toBeCloseTo(STRIKER_STUMPS_Z, 2);
  });

  it('bounces higher for shorter balls', () => {
    const h = (length: number) => new Delivery(spec({ length }), 0.6).atBat().y;
    expect(h(2)).toBeLessThan(0.35);
    expect(h(6.3)).toBeGreaterThan(0.3);
    expect(h(6.3)).toBeLessThan(1.0);
    expect(h(9)).toBeGreaterThan(h(6.3));
    expect(h(11)).toBeGreaterThan(1.2);
  });

  it('turns in the direction of the spin', () => {
    const base = { kind: 'spin' as const, speedKmh: 90, pitchX: 0, length: 4.8 };
    const off = new Delivery(spec({ ...base, cut: 2 }), 0.8).atStumps().x;
    const leg = new Delivery(spec({ ...base, cut: -2 }), 0.8).atStumps().x;
    expect(off).toBeGreaterThan(leg + 0.3);
  });

  it('makes sensible computer and player deliveries', () => {
    const rng = new Rng(3);
    const sit = { phase: 'middle' as Phase, ballsLeft: 60, wicketsDown: 0, score: 0, target: null, oversTotal: 10 };
    let wides = 0;
    for (let i = 0; i < 400; i++) {
      const s = aiDelivery(i % 2 ? henry : noor, i % 3 ? kohli : iyer, sit, 'normal', rng);
      expect(s.length).toBeGreaterThan(0.4);
      expect(s.speedKmh).toBeGreaterThan(60);
      const d = new Delivery(s, 0.6);
      if (Math.abs(d.atStumps().x) > 0.95) wides++;
    }
    expect(wides).toBeLessThan(40);
    const perfect = userDelivery(henry, { variation: 'stock', x: 0.1, length: 6, accuracy: 1, overstep: false }, rng);
    expect(perfect.pitchX).toBeCloseTo(0.1, 0);
    expect(Math.abs(perfect.length - 6)).toBeLessThan(0.5);
    expect(userDelivery(henry, { variation: 'stock', x: 0, length: 6, accuracy: 0.5, overstep: true }, rng).noBall).toBe(true);
  });
});

describe('shots', () => {
  const dirs: [string, number][] = [
    ['straight', 0],
    ['leg', Math.PI / 2],
    ['off', -Math.PI / 2],
    ['behind', Math.PI],
    ['cover', -Math.PI / 4],
    ['mid-wicket', Math.PI / 4],
  ];

  it('sends a well-timed shot in the tapped direction', () => {
    for (const [name, angle] of dirs) {
      let n = 0;
      let within = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const d = new Delivery(spec({ pitchX: 0, length: 5.5 }), 0.6);
        const r = resolveShot(
          { type: 'ground', angle, ballDist: IDEAL_TAP_DIST },
          { delivery: d, batter: kohli, bowler: henry, difficulty: 'normal', human: true, rng: new Rng(seed) },
        );
        if (r.contact !== 'clean') continue;
        n++;
        const diff = Math.abs(Math.atan2(Math.sin(r.angle - angle), Math.cos(r.angle - angle)));
        if (diff < 0.35) within++;
      }
      expect(n, name).toBeGreaterThan(40);
      expect(within / n, name).toBeGreaterThan(0.95);
    }
  });

  it('drifts to the leg side when early and to the off side when late', () => {
    const mean = (hand: 'R' | 'L', dist: number) => {
      let sum = 0;
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const d = new Delivery(spec({ pitchX: 0, length: 5.5 }), 0.6);
        const r = resolveShot(
          { type: 'ground', angle: 0, ballDist: dist },
          { delivery: d, batter: hand === 'R' ? kohli : iyer, bowler: henry, difficulty: 'normal', human: true, rng: new Rng(seed) },
        );
        if (r.contact === 'clean') {
          sum += r.angle;
          n++;
        }
      }
      return sum / n;
    };
    // Right-hander: leg side is +x (positive angle).
    expect(mean('R', IDEAL_TAP_DIST + 1.2)).toBeGreaterThan(0.1);
    expect(mean('R', IDEAL_TAP_DIST - 1.2)).toBeLessThan(-0.1);
    // Left-hander: mirrored.
    expect(mean('L', IDEAL_TAP_DIST + 1.2)).toBeLessThan(-0.1);
    expect(mean('L', IDEAL_TAP_DIST - 1.2)).toBeGreaterThan(0.1);
  });

  it('misses when the timing is very bad', () => {
    const d = new Delivery(spec(), 0.6);
    const c = { delivery: d, batter: kohli, bowler: henry, difficulty: 'normal' as const, human: true, rng: new Rng(1) };
    expect(resolveShot({ type: 'ground', angle: 0, ballDist: 8 }, c).contact).toBe('miss');
    expect(resolveShot({ type: 'ground', angle: 0, ballDist: -1.5 }, c).contact).toBe('miss');
  });

  it('gives a wider timing window on easy than on hard', () => {
    const count = (difficulty: 'easy' | 'hard') => {
      let clean = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const d = new Delivery(spec(), 0.6);
        const r = resolveShot(
          { type: 'ground', angle: 0, ballDist: IDEAL_TAP_DIST + 1.5 },
          { delivery: d, batter: kohli, bowler: henry, difficulty, human: true, rng: new Rng(seed) },
        );
        if (r.contact === 'clean') clean++;
      }
      return clean;
    };
    expect(count('easy')).toBeGreaterThan(count('hard') + 30);
  });

  it('names shots by side for each hand', () => {
    expect(shotName('ground', -Math.PI / 4, kohli, 'front')).toBe('cover drive');
    expect(shotName('ground', Math.PI / 4, iyer, 'front')).toBe('cover drive');
    expect(shotName('ground', Math.PI / 2, kohli, 'back')).toBe('pull');
    expect(shotName('ground', -Math.PI / 2, kohli, 'back')).toBe('cut');
    expect(shotName('ground', Math.PI / 2, iyer, 'back')).toBe('cut');
    expect(shotName('ground', 0, kohli, 'front')).toBe('straight drive');
  });
});

describe('fielding', () => {
  const fielders = buildFielders(makeTeam('CSK', defaultXi('CSK')), henry, kohli, 'middle', 'normal');
  const start = { x: 0, y: 0.6, z: BAT_Z };
  const opt = { catchSkill: 1, speedScale: 1 };

  it('gives six for a big lofted hit and four for a hard ground shot in a gap', () => {
    const six = simulatePath(start, 40, 0.6, 0.55);
    expect(six.boundary).toBe(6);
    // Straight back past the bowler with no long-off or long-on straight behind.
    const four = simulatePath(start, 32, 0, 0.03);
    expect(four.boundary).toBe(4);
    const p = four.samples[four.boundaryIndex];
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(BOUNDARY_R - 0.6);
  });

  it('stops a ground shot that goes straight to a fielder', () => {
    const cover = fielders.find((f) => f.spot === 'cover')!;
    const angle = Math.atan2(cover.x - start.x, cover.z - start.z);
    const path = simulatePath(start, 26, angle, 0.02);
    const plan = planFielding(path, fielders, new Rng(1), opt);
    expect(plan.kind).toBe('fielded');
    expect(fielders[plan.fielder].spot).toBe('cover');
  });

  it('catches a lofted shot hit straight to a deep fielder', () => {
    const deep = fielders.find((f) => f.spot === 'deep mid-wicket')!;
    const angle = Math.atan2(deep.x - start.x, deep.z - start.z);
    let caught = 0;
    for (let v = 27; v <= 31; v += 0.5) {
      const path = simulatePath(start, v, angle, 0.6);
      const plan = planFielding(path, fielders, new Rng(1), { ...opt, forceCatch: true });
      if (plan.kind === 'catch' && fielders[plan.fielder].spot === 'deep mid-wicket') caught++;
    }
    expect(caught).toBeGreaterThan(2);
  });
});

describe('ball simulation', () => {
  const straight = () => {
    const s = spec({ length: 6.2 });
    aimAtStumps(s, 0);
    return s;
  };

  it('bowls the batter who leaves a straight ball', () => {
    const sim = new BallSim(ctx({ spec: straight() }));
    const o = play(sim, null);
    expect(o.wicket?.kind).toBe('bowled');
    expect(o.event.wicket?.batterId).toBe(kohli.id);
  });

  it('does not give a wicket on a free hit', () => {
    const sim = new BallSim(ctx({ spec: straight(), freeHit: true }));
    const o = play(sim, null);
    expect(o.wicket).toBeNull();
    expect(o.saved).toBe(true);
  });

  it('calls a wide for a ball far outside off and gives a no-ball one extra', () => {
    const wide = play(new BallSim(ctx({ spec: spec({ pitchX: -1.6, length: 6 }) })), null);
    expect(wide.wide).toBe(true);
    expect(wide.event.wide).toBe(true);
    const nb = play(new BallSim(ctx({ spec: spec({ pitchX: -0.6, length: 6, noBall: true }) })), null);
    expect(nb.noBall).toBe(true);
    expect(nb.runs).toBe(1);
  });

  it('gives runs for a hit and the hit goes in the tapped direction', () => {
    let hits = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new BallSim(ctx({ spec: spec({ pitchX: -0.25, length: 5 }) }, seed));
      const o = play(sim, 'ground', -Math.PI / 3, IDEAL_TAP_DIST, true);
      if (o.shot?.contact === 'clean') {
        hits++;
        expect(Math.abs(o.shot.angle + Math.PI / 3)).toBeLessThan(0.4);
        expect(o.event.angle).toBeDefined();
      }
    }
    expect(hits).toBeGreaterThan(20);
  });

  it('can run out a batter who runs when there is no run', () => {
    // A soft push straight to mid-off, then non-stop running.
    let runOuts = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const c = ctx({ spec: spec({ pitchX: -0.1, length: 5 }) }, seed);
      const sim = new BallSim(c);
      const o = play(sim, 'ground', -0.3, IDEAL_TAP_DIST, true);
      if (o.wicket?.kind === 'runOut') {
        runOuts++;
        expect(o.event.swapEnds).toBeDefined();
      }
    }
    expect(runOuts).toBeGreaterThan(10);
  });

  it('lets the computer bat without input', () => {
    let runs = 0;
    let wickets = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const c = ctx({ userBatting: false, striker: CSK_SQUAD[seed % 7], bowler: RCB_SQUAD[10] }, seed);
      c.fielders = buildFielders(makeTeam('RCB', defaultXi('RCB')), c.bowler, c.striker, 'middle', 'normal');
      const sim = new BallSim(c);
      const o = play(sim, null);
      runs += o.runs;
      if (o.wicket) wickets++;
    }
    expect(runs).toBeGreaterThan(100);
    expect(runs).toBeLessThan(900);
    expect(wickets).toBeGreaterThan(3);
    expect(wickets).toBeLessThan(60);
  });
});

describe('full matches with a bot', () => {
  const cfg = (overs: OversOption, battingFirst: 'RCB' | 'CSK'): MatchConfig => ({
    overs,
    difficulty: 'normal',
    battingFirst,
    teams: { RCB: makeTeam('RCB', defaultXi('RCB')), CSK: makeTeam('CSK', defaultXi('CSK')) },
  });

  it('completes matches with consistent scorecards', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const overs = ([2, 5, 10, 20] as OversOption[])[seed % 4];
      const m = playMatch(cfg(overs, seed % 2 ? 'RCB' : 'CSK'), 'RCB', GOOD_PLAYER, seed);
      expect(m.complete).toBe(true);
      expect(m.result()).not.toBeNull();
      for (const inn of m.innings) {
        const bat = inn.bat.reduce((s, b) => s + b.runs, 0);
        const ex = inn.extras.wides + inn.extras.noBalls + inn.extras.byes + inn.extras.legByes;
        expect(bat + ex).toBe(inn.score);
        expect(inn.legalBalls).toBeLessThanOrEqual(overs * 6);
        expect(inn.wickets).toBeLessThanOrEqual(10);
        expect(inn.bowl.reduce((s, b) => s + b.balls, 0)).toBe(inn.legalBalls);
        expect(inn.bowl.reduce((s, b) => s + b.wickets, 0)).toBeLessThanOrEqual(inn.wickets);
        const quota = Math.ceil(overs / 5) * 6;
        for (const b of inn.bowl) expect(b.balls).toBeLessThanOrEqual(quota);
        expect(inn.balls.reduce((s, b) => s + b.total, 0)).toBe(inn.score);
        // No bowler bowls two overs in a row.
        let lastBowler = '';
        let lastOver = -1;
        for (const b of inn.balls) {
          if (b.over !== lastOver) {
            expect(b.bowlerId).not.toBe(lastBowler);
            lastBowler = b.bowlerId;
            lastOver = b.over;
          }
        }
      }
      const second = m.innings[1];
      if (second.score >= second.target!) expect(m.result()!.winner).toBe(second.battingTeam);
    }
  });
});
