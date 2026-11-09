import { describe, it } from 'vitest';
import { GOOD_PLAYER, playBall } from '../src/sim/autoplay';
import { Match } from '../src/sim/match';
import { Rng } from '../src/sim/rng';
import { simulatePath } from '../src/sim/fielding';
import { defaultXi, makeTeam } from '../src/sim/squads';

describe('diag', () => {
  it('range table', () => {
    for (const el of [0.45, 0.52, 0.6]) {
      const row: string[] = [];
      for (const v of [24, 27, 30, 33, 36, 39]) {
        const p = simulatePath({ x: 0, y: 0.6, z: -8.34 }, v, 0, el);
        const fb = p.samples.find((s) => !s.air) ?? p.samples[p.samples.length - 1];
        row.push(`${v}:${(fb.z + 8.34).toFixed(0)}m/${fb.t.toFixed(1)}s`);
      }
      console.log('elev', el, row.join('  '));
    }
    for (const v of [10, 14, 18, 22, 26, 30]) {
      const p = simulatePath({ x: 0, y: 0.6, z: -8.34 }, v, 0, 0.02, 20);
      const at = (d: number) => p.samples.find((s) => s.z + 8.34 >= d)?.t.toFixed(2) ?? '-';
      const last = p.samples[p.samples.length - 1];
      console.log('ground', v, 't@27m', at(27), 't@62m', at(62), 'stops', (last.z + 8.34).toFixed(0), p.boundary);
    }
  });
  it('breakdown', () => {
    for (const who of ['RCB', 'CSK'] as const) {
      const agg: Record<string, { n: number; runs: number; w: number }> = {};
      const runsHist: Record<string, number> = {};
      let balls = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const rng = new Rng(seed * 31);
        const m = new Match({
          overs: 20,
          difficulty: 'normal',
          battingFirst: who,
          teams: { RCB: makeTeam('RCB', defaultXi('RCB')), CSK: makeTeam('CSK', defaultXi('CSK')) },
        });
        while (!m.current.complete) {
          const o = playBall(m, 'RCB', GOOD_PLAYER, rng);
          balls++;
          const sh = o.shot;
          const key = sh ? `${sh.type}/${sh.contact}/${sh.timing}` : 'leave';
          const a = (agg[key] ??= { n: 0, runs: 0, w: 0 });
          a.n++;
          a.runs += o.runs;
          if (o.wicket) a.w++;
          const rk = o.wicket ? 'W' : o.wide ? 'wd' : String(o.runs);
          runsHist[rk] = (runsHist[rk] ?? 0) + 1;
        }
      }
      console.log(`--- ${who} batting (20 overs) ---`);
      console.log(Object.entries(runsHist).sort().map(([k, v]) => `${k}:${((v * 100) / balls).toFixed(1)}%`).join('  '));
      for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].n - a[1].n))
        console.log(`${k.padEnd(22)} ${((v.n * 100) / balls).toFixed(1).padStart(5)}%  avg ${(v.runs / v.n).toFixed(2)}  wkt ${((v.w * 100) / v.n).toFixed(0)}%`);
    }
  });
});
