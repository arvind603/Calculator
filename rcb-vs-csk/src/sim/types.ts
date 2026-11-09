// Shared simulation types. No rendering or DOM imports are allowed in src/sim.

export type Hand = 'R' | 'L';
export type BowlKind = 'pace' | 'spin';
export type Role = 'bat' | 'wk' | 'ar' | 'bowl';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type TeamId = 'RCB' | 'CSK';
export type OversOption = 2 | 5 | 10 | 20;

export interface BowlStyle {
  arm: Hand;
  kind: BowlKind;
  /** Short label, for example "Right-arm fast-medium". */
  label: string;
  /** Typical speed range in km/h. */
  speed: [number, number];
  /** Spin only: sign of the world-x deviation after the ball pitches. */
  turn?: 1 | -1;
}

export interface Player {
  id: string;
  name: string;
  short: string;
  role: Role;
  hand: Hand;
  bowl?: BowlStyle;
  /** Ratings are for game balance only. Range 0 to 100. */
  bat: number;
  power: number;
  bowling: number;
  overseas: boolean;
  captain?: boolean;
  note?: string;
}

export interface TeamSheet {
  id: TeamId;
  name: string;
  short: string;
  xi: Player[];
  keeperId: string;
}

export type DismissalKind = 'bowled' | 'caught' | 'caughtBehind' | 'lbw' | 'runOut' | 'stumped';

export interface Wicket {
  kind: DismissalKind;
  batterId: string;
  fielderId?: string;
}

/** The outcome of one delivery, as input to the match engine. */
export interface BallEvent {
  runsBat: number;
  boundary?: 0 | 4 | 6;
  wide?: boolean;
  noBall?: boolean;
  byes?: number;
  legByes?: number;
  wicket?: Wicket;
  /** If set, it overrides the "odd runs swap the batters" rule. */
  swapEnds?: boolean;
  /** Wagon wheel data. Angle in radians: 0 = straight, + = world +x. */
  angle?: number;
  dist?: number;
}

export interface BatCard {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  batted: boolean;
  how: string;
}

export interface BowlCard {
  id: string;
  balls: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
  dots: number;
  maidens: number;
  thisOverRuns: number;
}

export interface BallRecord {
  over: number;
  ball: number;
  bowlerId: string;
  strikerId: string;
  runsBat: number;
  total: number;
  legal: boolean;
  label: string;
  wicket?: Wicket;
  boundary: 0 | 4 | 6;
  angle?: number;
  dist?: number;
  hand: Hand;
}

export interface FallOfWicket {
  wicket: number;
  score: number;
  batterId: string;
  balls: number;
}

export type Phase = 'powerplay' | 'middle' | 'death';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
