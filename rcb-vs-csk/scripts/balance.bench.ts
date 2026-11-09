// Balance check. Run with: npm run balance
// A bot that models a person plays many innings. The script prints runs per over.
import { describe, it } from 'vitest';
import { AVERAGE_PLAYER, EXPERT_PLAYER, GOOD_PLAYER, playMatch, type BotProfile } from '../src/sim/autoplay';
import type { MatchConfig } from '../src/sim/match';
import { defaultXi, makeTeam } from '../src/sim/squads';
import type { Difficulty, OversOption } from '../src/sim/types';

function run(label: string, bot: BotProfile, overs: OversOption, difficulty: Difficulty, n: number) {
  const user = { runs: 0, balls: 0, wkts: 0, fours: 0, sixes: 0, dots: 0, inns: 0 };
  const ai = { runs: 0, balls: 0, wkts: 0, fours: 0, sixes: 0, dots: 0, inns: 0 };
  const kinds: Record<string, number> = {};
  let wins = 0;
  let extras = 0;
  for (let seed = 1; seed <= n; seed++) {
    const config: MatchConfig = {
      overs,
      difficulty,
      battingFirst: seed % 2 ? 'RCB' : 'CSK',
      teams: { RCB: makeTeam('RCB', defaultXi('RCB')), CSK: makeTeam('CSK', defaultXi('CSK')) },
    };
    const m = playMatch(config, 'RCB', bot, seed * 7919);
    if (m.result()!.winner === 'RCB') wins++;
    for (const inn of m.innings) {
      const t = inn.battingTeam === 'RCB' ? user : ai;
      t.runs += inn.score;
      t.balls += inn.legalBalls;
      t.wkts += inn.wickets;
      t.inns++;
      extras += inn.extras.wides + inn.extras.noBalls;
      for (const b of inn.balls) {
        if (b.boundary === 4) t.fours++;
        if (b.boundary === 6) t.sixes++;
        if (b.legal && b.total === 0) t.dots++;
        if (b.wicket) kinds[`${inn.battingTeam === 'RCB' ? 'user' : 'ai'}:${b.wicket.kind}`] = (kinds[`${inn.battingTeam === 'RCB' ? 'user' : 'ai'}:${b.wicket.kind}`] ?? 0) + 1;
      }
    }
  }
  const line = (name: string, t: typeof user) =>
    `${name}: ${((t.runs * 6) / t.balls).toFixed(2)} rpo, avg score ${(t.runs / t.inns).toFixed(0)}, wkts/inn ${(t.wkts / t.inns).toFixed(1)}, ` +
    `4s ${((t.fours * 100) / t.balls).toFixed(1)}%, 6s ${((t.sixes * 100) / t.balls).toFixed(1)}%, dots ${((t.dots * 100) / t.balls).toFixed(0)}%`;
  console.log(`\n=== ${label} | ${overs} overs | ${difficulty} | ${n} matches ===`);
  console.log(line('  Player bats ', user));
  console.log(line('  Computer bats', ai));
  console.log(`  Player wins ${((wins * 100) / n).toFixed(0)}% | extras/match ${(extras / n).toFixed(1)}`);
  console.log('  ' + Object.entries(kinds).sort().map(([k, v]) => `${k} ${v}`).join(', '));
}

describe('balance', () => {
  it('prints run rates', () => {
    run('good player', GOOD_PLAYER, 5, 'normal', 150);
    run('good player', GOOD_PLAYER, 20, 'normal', 40);
    run('average player', AVERAGE_PLAYER, 5, 'normal', 150);
    run('expert player', EXPERT_PLAYER, 5, 'normal', 150);
    run('good player', GOOD_PLAYER, 5, 'easy', 150);
    run('good player', GOOD_PLAYER, 5, 'hard', 150);
  });
});
