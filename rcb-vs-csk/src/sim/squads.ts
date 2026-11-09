import type { BowlStyle, Hand, Player, Role, TeamId, TeamSheet } from './types';

// IPL 2026 squads. Batting hand and bowling style come from public player
// profiles. Ratings (bat, power, bowling) are for game balance only.

type StyleKey = 'RF' | 'RFM' | 'RMF' | 'RM' | 'LF' | 'LFM' | 'LMF' | 'OB' | 'LB' | 'SLA' | 'LWS';

const STYLES: Record<StyleKey, BowlStyle> = {
  RF: { arm: 'R', kind: 'pace', label: 'Right-arm fast', speed: [138, 149] },
  RFM: { arm: 'R', kind: 'pace', label: 'Right-arm fast-medium', speed: [132, 143] },
  RMF: { arm: 'R', kind: 'pace', label: 'Right-arm medium-fast', speed: [126, 137] },
  RM: { arm: 'R', kind: 'pace', label: 'Right-arm medium', speed: [118, 130] },
  LF: { arm: 'L', kind: 'pace', label: 'Left-arm fast', speed: [138, 149] },
  LFM: { arm: 'L', kind: 'pace', label: 'Left-arm fast-medium', speed: [132, 143] },
  LMF: { arm: 'L', kind: 'pace', label: 'Left-arm medium-fast', speed: [126, 137] },
  OB: { arm: 'R', kind: 'spin', label: 'Right-arm off-break', speed: [84, 96], turn: 1 },
  LB: { arm: 'R', kind: 'spin', label: 'Right-arm leg-break', speed: [82, 95], turn: -1 },
  SLA: { arm: 'L', kind: 'spin', label: 'Slow left-arm orthodox', speed: [84, 96], turn: -1 },
  LWS: { arm: 'L', kind: 'spin', label: 'Left-arm wrist spin', speed: [82, 95], turn: 1 },
};

function p(
  name: string,
  role: Role,
  hand: Hand,
  style: StyleKey | null,
  bat: number,
  power: number,
  bowling: number,
  extra: Partial<Player> = {},
): Player {
  const parts = name.split(' ');
  const short = parts.length > 1 ? `${parts[0][0]} ${parts.slice(1).join(' ')}` : name;
  return {
    id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
    name,
    short,
    role,
    hand,
    bowl: style ? { ...STYLES[style] } : undefined,
    bat,
    power,
    bowling,
    overseas: false,
    ...extra,
  };
}

const OS = { overseas: true };

export const RCB_SQUAD: Player[] = [
  // Default XI (first 11)
  p('Phil Salt', 'wk', 'R', null, 86, 90, 0, OS),
  p('Virat Kohli', 'bat', 'R', 'RM', 94, 80, 28),
  p('Venkatesh Iyer', 'ar', 'L', 'RM', 80, 82, 55),
  p('Rajat Patidar', 'bat', 'R', 'OB', 84, 86, 25, { captain: true }),
  p('Jitesh Sharma', 'wk', 'R', null, 78, 84, 0),
  p('Tim David', 'bat', 'R', 'OB', 82, 95, 30, OS),
  p('Krunal Pandya', 'ar', 'L', 'SLA', 72, 74, 80),
  p('Bhuvneshwar Kumar', 'bowl', 'R', 'RMF', 45, 45, 86),
  p('Suyash Sharma', 'bowl', 'R', 'LB', 20, 20, 78),
  p('Yash Dayal', 'bowl', 'L', 'LFM', 22, 25, 80, { note: 'Did not play in IPL 2026' }),
  p('Josh Hazlewood', 'bowl', 'L', 'RFM', 25, 28, 92, OS),
  // Bench
  p('Devdutt Padikkal', 'bat', 'L', 'OB', 80, 76, 15),
  p('Jacob Bethell', 'ar', 'L', 'SLA', 78, 82, 58, OS),
  p('Romario Shepherd', 'ar', 'R', 'RFM', 70, 92, 70, OS),
  p('Jordan Cox', 'wk', 'R', null, 74, 74, 0, OS),
  p('Rasikh Dar', 'bowl', 'R', 'RFM', 25, 30, 72),
  p('Nuwan Thushara', 'bowl', 'R', 'RFM', 15, 15, 78, { ...OS, note: 'Injured in IPL 2026' }),
  p('Jacob Duffy', 'bowl', 'R', 'RFM', 20, 22, 82, OS),
  p('Mangesh Yadav', 'ar', 'L', 'LFM', 45, 55, 70),
  p('Swapnil Singh', 'ar', 'R', 'SLA', 55, 55, 68),
  p('Abhinandan Singh', 'bowl', 'R', 'RMF', 15, 15, 65),
  p('Satvik Deswal', 'ar', 'L', 'SLA', 50, 50, 60, { note: 'Style not verified' }),
  p('Vicky Ostwal', 'bowl', 'R', 'SLA', 35, 30, 66),
  p('Vihaan Malhotra', 'bat', 'L', 'OB', 62, 58, 40),
  p('Kanishk Chouhan', 'ar', 'R', 'OB', 58, 62, 58),
  p('Richard Gleeson', 'bowl', 'R', 'RFM', 15, 15, 76, { ...OS, note: 'Replacement for Thushara' }),
];

export const CSK_SQUAD: Player[] = [
  // Default XI (first 11)
  p('Ayush Mhatre', 'bat', 'R', 'OB', 80, 84, 20),
  p('Sanju Samson', 'wk', 'R', null, 88, 90, 0),
  p('Ruturaj Gaikwad', 'bat', 'R', 'OB', 88, 78, 15, { captain: true }),
  p('Dewald Brevis', 'bat', 'R', 'LB', 82, 94, 35, OS),
  p('Shivam Dube', 'ar', 'L', 'RM', 80, 93, 50),
  p('Prashant Veer', 'ar', 'L', 'SLA', 64, 72, 68),
  p('MS Dhoni', 'bat', 'R', null, 74, 86, 0),
  p('Jamie Overton', 'ar', 'R', 'RF', 58, 78, 78, OS),
  p('Noor Ahmad', 'bowl', 'R', 'LWS', 20, 20, 88, OS),
  p('Matt Henry', 'bowl', 'R', 'RFM', 35, 50, 85, OS),
  p('Khaleel Ahmed', 'bowl', 'R', 'LFM', 12, 12, 82),
  // Bench
  p('Urvil Patel', 'wk', 'R', null, 74, 84, 0),
  p('Sarfaraz Khan', 'bat', 'R', 'LB', 76, 72, 15),
  p('Kartik Sharma', 'wk', 'R', null, 72, 86, 0),
  p('Matthew Short', 'ar', 'R', 'OB', 76, 82, 50, OS),
  p('Rahul Chahar', 'bowl', 'R', 'LB', 25, 25, 76),
  p('Akeal Hosein', 'bowl', 'L', 'SLA', 35, 40, 80, OS),
  p('Nathan Ellis', 'bowl', 'R', 'RFM', 25, 30, 82, { ...OS, note: 'Injured in IPL 2026' }),
  p('Anshul Kamboj', 'bowl', 'R', 'RFM', 35, 35, 76),
  p('Mukesh Choudhary', 'bowl', 'L', 'LMF', 12, 12, 70),
  p('Gurjapneet Singh', 'bowl', 'R', 'LMF', 12, 12, 66),
  p('Shreyas Gopal', 'bowl', 'R', 'LB', 40, 35, 70),
  p('Ramakrishna Ghosh', 'ar', 'R', 'RMF', 50, 50, 60),
  p('Aman Khan', 'ar', 'R', 'RM', 55, 65, 45),
  p('Zak Foulkes', 'ar', 'R', 'RMF', 50, 55, 68, OS),
  p('Spencer Johnson', 'bowl', 'L', 'LF', 15, 20, 78, { ...OS, note: 'Replacement for Ellis' }),
  p('Kuldip Yadav', 'bowl', 'L', 'LMF', 12, 12, 62, { note: 'Replacement for Khaleel' }),
];

export const TEAM_NAMES: Record<TeamId, { name: string; short: string }> = {
  RCB: { name: 'Royal Challengers Bengaluru', short: 'RCB' },
  CSK: { name: 'Chennai Super Kings', short: 'CSK' },
};

export const MAX_OVERSEAS = 4;

export interface XiCheck {
  ok: boolean;
  problems: string[];
}

/** Checks that an XI can play a match of the given length. */
export function validateXi(xi: Player[]): XiCheck {
  const problems: string[] = [];
  if (xi.length !== 11) problems.push('Select 11 players.');
  if (new Set(xi.map((x) => x.id)).size !== xi.length) problems.push('A player is selected twice.');
  if (!xi.some((x) => x.role === 'wk')) problems.push('Select a wicketkeeper.');
  const overseas = xi.filter((x) => x.overseas).length;
  if (overseas > MAX_OVERSEAS) problems.push(`Maximum ${MAX_OVERSEAS} overseas players (now ${overseas}).`);
  const keeper = xi.find((x) => x.role === 'wk');
  const bowlers = xi.filter((x) => x.bowl && x.id !== keeper?.id).length;
  if (bowlers < 5) problems.push(`Select 5 or more bowlers (now ${bowlers}).`);
  return { ok: problems.length === 0, problems };
}

export function makeTeam(id: TeamId, xi: Player[]): TeamSheet {
  const keeper = xi.find((x) => x.role === 'wk') ?? xi[0];
  return { id, name: TEAM_NAMES[id].name, short: TEAM_NAMES[id].short, xi: [...xi], keeperId: keeper.id };
}

export const defaultXi = (id: TeamId): Player[] => (id === 'RCB' ? RCB_SQUAD : CSK_SQUAD).slice(0, 11);
