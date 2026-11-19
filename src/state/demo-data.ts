// state/demo-data.ts
// ---------------------------------------------------------------------------
// Sample players (nicknames) so you can try the app straight away.
// Set DEMO_DATA to false to start with an empty app instead.
//
// Because nothing is saved, this demo is loaded again every time the app
// starts or the page reloads. "Reset all data" in Settings clears it until
// the next reload.
// ---------------------------------------------------------------------------
import type { Level } from '../logic/matchmaking';

export const DEMO_DATA = true;

export type DemoPlayer = { name: string; level: Level; locked?: boolean; wins: number; losses: number };

// 5 Beginner, 5 Intermediate, 4 Advance, 4 Pro, all with fresh stats.
// 3 locked players to try "Start new session".
export const DEMO_PLAYERS: DemoPlayer[] = [
  { name: 'Ana', level: 'Beginner', wins: 0, losses: 0 },
  { name: 'Benji', level: 'Beginner', wins: 0, losses: 0 },
  { name: 'Cha', level: 'Beginner', wins: 0, losses: 0 },
  { name: 'Dan', level: 'Beginner', locked: true, wins: 0, losses: 0 },
  { name: 'Max', level: 'Beginner', wins: 0, losses: 0 },

  { name: 'Ella', level: 'Intermediate', wins: 0, losses: 0 },
  { name: 'Fix', level: 'Intermediate', wins: 0, losses: 0 },
  { name: 'Gigi', level: 'Intermediate', locked: true, wins: 0, losses: 0 },
  { name: 'Hugs', level: 'Intermediate', wins: 0, losses: 0 },
  { name: 'Bel', level: 'Intermediate', wins: 0, losses: 0 },

  { name: 'Jojo', level: 'Advance', wins: 0, losses: 0 },
  { name: 'Kiki', level: 'Advance', wins: 0, losses: 0 },
  { name: 'Leo', level: 'Advance', wins: 0, losses: 0 },
  { name: 'Mimi', level: 'Advance', wins: 0, losses: 0 },

  { name: 'Marco', level: 'Pro', locked: true, wins: 0, losses: 0 },
  { name: 'Nini', level: 'Pro', wins: 0, losses: 0 },
  { name: 'Oca', level: 'Pro', wins: 0, losses: 0 },
  { name: 'Pau', level: 'Pro', wins: 0, losses: 0 },
];
