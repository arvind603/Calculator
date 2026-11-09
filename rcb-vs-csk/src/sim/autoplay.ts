import { aiBatPlan, VARIATIONS, type BowlInput } from './ai';
import { BallSim, type BallOutcome } from './ballsim';
import { Delivery, slowFactor } from './delivery';
import { BAT_Z, IDEAL_TAP_DIST, legSign } from './field';
import { applyOutcome, ensureAiBowler, makeBallContext, nextAiDelivery, nextUserDelivery } from './flow';
import { Match, type MatchConfig } from './match';
import { clamp, Rng } from './rng';
import type { TeamId } from './types';

/** A model of a person who plays the game. Used for tests and the balance check. */
export interface BotProfile {
  /** Standard deviation of the timing error (m of ball travel). */
  timingSigma: number;
  /** Mean accuracy of the bowling meter (0 to 1). */
  bowlAccuracy: number;
  /** Runs on "tight" calls with this probability. */
  riskyRuns: number;
}

export const GOOD_PLAYER: BotProfile = { timingSigma: 0.75, bowlAccuracy: 0.8, riskyRuns: 0.25 };
export const AVERAGE_PLAYER: BotProfile = { timingSigma: 1.15, bowlAccuracy: 0.62, riskyRuns: 0.35 };
export const EXPERT_PLAYER: BotProfile = { timingSigma: 0.45, bowlAccuracy: 0.92, riskyRuns: 0.15 };

const STEP = 1 / 120;

/** Plays one ball to the end. The bot bats if the user team bats. */
export function playBall(match: Match, userTeam: TeamId, bot: BotProfile, rng: Rng): BallOutcome {
  const inn = match.current;
  const userBats = inn.battingTeam === userTeam;
  if (match.needsBowler) {
    if (userBats) ensureAiBowler(match, rng);
    else {
      // The bot selects the best-rated bowler that the rules allow.
      const el = match.eligibleBowlers().slice().sort((a, b) => b.bowling - a.bowling);
      match.setBowler(el[0].id);
    }
  }
  let spec;
  if (userBats) spec = nextAiDelivery(match, rng);
  else {
    const bowler = match.player(inn.bowlerId!);
    const striker = match.player(inn.strikerId!);
    const side = legSign(striker.hand);
    const kind = bowler.bowl!.kind;
    const r = rng.next();
    const length = kind === 'pace' ? (r < 0.5 ? 6.4 : r < 0.75 ? 1.9 : r < 0.9 ? 8.9 : 4.3) : r < 0.7 ? 4.9 : 3.4;
    const input: BowlInput = {
      variation: rng.pick(VARIATIONS[kind]),
      x: -side * 0.2 + (kind === 'spin' ? -(bowler.bowl!.turn ?? 1) * 0.25 : 0),
      length,
      accuracy: clamp(bot.bowlAccuracy + rng.gauss() * 0.13, 0, 1),
      overstep: rng.chance(0.01),
    };
    spec = nextUserDelivery(match, input, rng);
  }
  const ctx = makeBallContext(match, spec, rng, userTeam);
  const sim = new BallSim(ctx);

  // The bot reads the ball like a good batter and selects a sensible shot.
  let tapDist = 0;
  let plan: ReturnType<typeof aiBatPlan> | null = null;
  if (userBats) {
    const d = new Delivery(spec, slowFactor(spec.kind, match.config.difficulty));
    plan = aiBatPlan(d, { ...ctx.striker, bat: 90 }, ctx.bowler, ctx.fielders, ctx.situation, 'normal', rng, ctx.freeHit);
    tapDist = IDEAL_TAP_DIST + rng.gauss() * bot.timingSigma;
  }
  let guard = 0;
  while (sim.phase !== 'done' && guard++ < 120 * 60) {
    sim.step(STEP);
    if (userBats) {
      if (plan && !plan.leave && sim.canSwing && sim.ball.z - BAT_Z <= tapDist) sim.swing(plan.type, plan.angle);
      if (sim.canRun) {
        const h = sim.runHint();
        if (h === 'safe' || (h === 'tight' && rng.chance(bot.riskyRuns * STEP * 4))) sim.callRun();
      }
    }
    sim.takeEvents();
  }
  if (!sim.outcome) throw new Error('Ball did not finish');
  applyOutcome(match, sim.outcome);
  return sim.outcome;
}

export function playInnings(match: Match, userTeam: TeamId, bot: BotProfile, rng: Rng): void {
  let guard = 0;
  while (!match.current.complete && guard++ < 2000) playBall(match, userTeam, bot, rng);
}

export function playMatch(config: MatchConfig, userTeam: TeamId, bot: BotProfile, seed: number): Match {
  const rng = new Rng(seed);
  const match = new Match(config);
  playInnings(match, userTeam, bot, rng);
  match.startSecondInnings();
  playInnings(match, userTeam, bot, rng);
  return match;
}
