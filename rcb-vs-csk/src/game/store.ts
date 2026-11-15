import type { Difficulty, OversOption } from '../sim/types';

// Saved settings and records. Browser storage can be missing or blocked, so every access is guarded.

const KEY = 'rcb-vs-csk-v1';

export interface Records {
  played: number;
  won: number;
  lost: number;
  tied: number;
  /** Highest RCB total, for example "78/2 (5 ov)". */
  highScore: number;
  highScoreText: string;
  bestBat: number;
  bestBatText: string;
  bestBowlWkts: number;
  bestBowlRuns: number;
  bestBowlText: string;
  sixes: number;
}

export interface Saved {
  batFirst: boolean;
  overs: OversOption;
  difficulty: Difficulty;
  sound: boolean;
  xi: string[];
  records: Records;
}

export const emptyRecords = (): Records => ({
  played: 0,
  won: 0,
  lost: 0,
  tied: 0,
  highScore: 0,
  highScoreText: '',
  bestBat: 0,
  bestBatText: '',
  bestBowlWkts: 0,
  bestBowlRuns: 0,
  bestBowlText: '',
  sixes: 0,
});

const DEFAULTS: Saved = { batFirst: true, overs: 5, difficulty: 'normal', sound: true, xi: [], records: emptyRecords() };

export function loadSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, records: emptyRecords() };
    const p = JSON.parse(raw) as Partial<Saved>;
    return {
      batFirst: typeof p.batFirst === 'boolean' ? p.batFirst : DEFAULTS.batFirst,
      overs: [2, 5, 10, 20].includes(p.overs as number) ? (p.overs as OversOption) : DEFAULTS.overs,
      difficulty: ['easy', 'normal', 'hard'].includes(p.difficulty as string) ? (p.difficulty as Difficulty) : DEFAULTS.difficulty,
      sound: typeof p.sound === 'boolean' ? p.sound : true,
      xi: Array.isArray(p.xi) ? p.xi.filter((x) => typeof x === 'string') : [],
      records: { ...emptyRecords(), ...(p.records ?? {}) },
    };
  } catch {
    return { ...DEFAULTS, records: emptyRecords() };
  }
}

export function saveSaved(s: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage is not available. The game works without it.
  }
}
