import { aiChooseBowler, aiDelivery, aiFieldPlan, situationOf, userDelivery, type BowlInput } from './ai';
import { BallSim, buildFielders, type BallContext, type BallOutcome } from './ballsim';
import type { DeliverySpec } from './delivery';
import type { FieldPlan } from './field';
import type { Match } from './match';
import type { Rng } from './rng';
import type { TeamId } from './types';

/** Builds the context for the next ball of the match. */
export function makeBallContext(match: Match, spec: DeliverySpec, rng: Rng, userTeam: TeamId, userPlan: FieldPlan = 'balanced'): BallContext {
  const inn = match.current;
  const striker = match.player(inn.strikerId!);
  const nonStriker = match.player(inn.nonStrikerId!);
  const bowler = match.player(inn.bowlerId!);
  const sit = situationOf(match);
  const plan = inn.bowlingTeam === userTeam ? userPlan : aiFieldPlan(sit);
  const fielders = buildFielders(match.team(inn.bowlingTeam), bowler, striker, match.phase(inn), match.config.difficulty, plan);
  return {
    rng,
    difficulty: match.config.difficulty,
    striker,
    nonStriker,
    bowler,
    fielders,
    spec,
    freeHit: inn.freeHit,
    userBatting: inn.battingTeam === userTeam,
    situation: sit,
  };
}

/** Delivery of the computer's bowler for the next ball. */
export function nextAiDelivery(match: Match, rng: Rng): DeliverySpec {
  const inn = match.current;
  return aiDelivery(match.player(inn.bowlerId!), match.player(inn.strikerId!), situationOf(match), match.config.difficulty, rng);
}

export function nextUserDelivery(match: Match, input: BowlInput, rng: Rng): DeliverySpec {
  return userDelivery(match.player(match.current.bowlerId!), input, rng);
}

export function ensureAiBowler(match: Match, rng: Rng): void {
  if (match.needsBowler) match.setBowler(aiChooseBowler(match, rng).id);
}

export function applyOutcome(match: Match, outcome: BallOutcome) {
  return match.applyBall(outcome.event);
}

export { BallSim };
