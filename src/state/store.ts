// state/store.ts
// ---------------------------------------------------------------------------
// The whole app's data, kept IN MEMORY only (no database, nothing saved).
// Closing or reloading the app starts fresh.
//
// Screens read it with the useStore() hook (re-renders on every change) or
// with the small get…() helpers. Every change goes through an action below,
// which builds a NEW state object (never edits the old one) and then calls
// emit() so React knows to re-render.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react';
import {
  LEVELS, addToHistory, emptyHistory, isMixedLevels, planMatches, sortByPriority,
  type Candidate, type History, type Level,
} from '../logic/matchmaking';
import { DEMO_DATA, DEMO_PLAYERS } from './demo-data';

export { LEVELS, type Level };
export type MatchType = 'singles' | 'doubles';
export type CourtStatus = 'open' | 'occupied' | 'closed';

export type Player = {
  player_id: number;
  name: string;
  level: Level;
  locked: boolean;           // locked players survive "Start new session"
  wins: number;
  losses: number;
  games: number;
  waitingSince: number;      // when they last became free (ms)
  lastFinished: number | null;
  lastDoneRound: number;     // highest round they finished a game in
  carryOver: boolean;        // couldn't be matched last round → priority
};

/**
 * proposed → (Ready) → queued → (free court) → playing → (winner) → finished
 * "finished" is the short celebration on court before the court is freed.
 */
export type Stage = 'proposed' | 'queued' | 'playing' | 'finished';
export type Match = {
  id: number;
  round: number;
  stage: Stage;
  team1: number[];
  team2: number[];
  queueNo: number | null;    // "Queue 1", "Queue 2", … once Ready is pressed
  readyAt: number | null;
  courtId: number | null;
  startedAt: number | null;
  winner: 1 | 2 | null;
  manual?: boolean;          // built by hand in "Build a match"
};

/** Seats of the match you are building by hand (null = empty seat). */
export type Draft = { team1: (number | null)[]; team2: (number | null)[] };
const emptyDraft = (): Draft => ({ team1: [null, null], team2: [null, null] });

type StoredCourt = { court_id: number; name: string; closed: boolean };
export type Court = { court_id: number; name: string; status: CourtStatus };
export type AppSettings = { matchType: MatchType; restMin: number };

export type State = {
  players: Player[];
  courts: StoredCourt[];
  matches: Match[];
  completed: { team1: number[]; team2: number[] }[]; // this session only, for "avoid repeats"
  round: number;
  queueCounter: number;
  settings: AppSettings;
  draft: Draft;
};

/** How long the warm-up shows at minimum before a queue goes on court. */
export const WARMUP_MS = 3000;
/** How long the winner celebration stays on court. */
export const CELEBRATE_MS = 3500;

// ============================ store plumbing ============================
let nextId = 1;
const newId = () => nextId++;

function freshCourts(): StoredCourt[] {
  return [{ court_id: newId(), name: 'Court 1', closed: false }, { court_id: newId(), name: 'Court 2', closed: false }];
}

let S: State = {
  players: [],
  courts: freshCourts(),
  matches: [],
  completed: [],
  round: 1,
  queueCounter: 0,
  settings: { matchType: 'doubles', restMin: 0 },
  draft: emptyDraft(),
};
/** Bumped on new session / reset so old celebration timers are ignored. */
let sessionToken = 0;

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Replace the state, run the automatic steps, then tell React. */
function commit(next: State) {
  S = maintain(next, Date.now());
  emit();
}

/** React hook: the current state; the component re-renders whenever it changes. */
export function useStore(): State {
  return useSyncExternalStore(subscribe, () => S, () => S);
}
export function getState(): State { return S; }

// ============================ derived helpers ============================
const ACTIVE: Stage[] = ['proposed', 'queued', 'playing', 'finished'];

export function matchOf(s: State, playerId: number): Match | undefined {
  return s.matches.find((m) => ACTIVE.includes(m.stage) && (m.team1.includes(playerId) || m.team2.includes(playerId)));
}
const draftIds = (d: Draft) => [...d.team1, ...d.team2].filter((id): id is number => id != null);

/** Players not in any match or "Build a match" seat (shown in the waiting list). */
export function freePlayers(s: State): Player[] {
  const busy = new Set([...s.matches.flatMap((m) => [...m.team1, ...m.team2]), ...draftIds(s.draft)]);
  return s.players.filter((p) => !busy.has(p.player_id));
}
function lastRound(s: State, p: Player): number {
  const m = matchOf(s, p.player_id);
  return Math.max(p.lastDoneRound, m ? m.round : 0);
}
function rested(s: State, p: Player, now: number): boolean {
  return s.settings.restMin <= 0 || p.lastFinished == null || now - p.lastFinished >= s.settings.restMin * 60000;
}
function historyOf(s: State): History {
  const h = emptyHistory();
  for (const m of s.completed) addToHistory(h, m.team1, m.team2);
  for (const m of s.matches) addToHistory(h, m.team1, m.team2);
  return h;
}
export function playerById(s: State, id: number): Player | undefined {
  return s.players.find((p) => p.player_id === id);
}
/** True when a match breaks the level rules (manual swaps). */
export function matchIsMixed(s: State, m: Match): boolean {
  const lv = (ids: number[]) => ids.map((id) => playerById(s, id)?.level ?? 'Beginner');
  return isMixedLevels(lv(m.team1), lv(m.team2));
}

// ============================ automatic steps ============================
/**
 * Runs after every change (and once a second):
 *  1. moves the next warmed-up Queue onto each free court
 *  2. creates "proposed" matches for the current round
 *  3. starts the next round when the current one can't fill any more matches
 */
function maintain(input: State, now: number): State {
  let s = input;

  // 1) Free courts take the lowest-numbered queue that has warmed up.
  const busyCourts = new Set(s.matches.filter((m) => m.stage === 'playing' || m.stage === 'finished').map((m) => m.courtId));
  for (const c of s.courts) {
    if (c.closed || busyCourts.has(c.court_id)) continue;
    const next = s.matches
      .filter((m) => m.stage === 'queued' && (m.readyAt ?? 0) + WARMUP_MS <= now)
      .sort((a, b) => (a.queueNo ?? 0) - (b.queueNo ?? 0))[0];
    if (!next) break;
    busyCourts.add(c.court_id);
    s = { ...s, matches: s.matches.map((m) => (m.id === next.id ? { ...m, stage: 'playing', courtId: c.court_id, startedAt: now } : m)) };
  }

  // 2 + 3) Proposals and rounds.
  const size = s.settings.matchType === 'singles' ? 2 : 4;
  for (let guard = 0; guard < 50; guard++) {
    const R = s.round;
    const free = new Set(freePlayers(s).map((p) => p.player_id));
    const eligible = s.players.filter((p) => free.has(p.player_id) && lastRound(s, p) < R && rested(s, p, now));
    const cands: Candidate[] = eligible.map((p) => ({
      id: p.player_id, level: p.level, games: p.games, waitingSince: p.waitingSince, carryOver: p.carryOver,
    }));
    const plans = planMatches(cands, size, historyOf(s));
    if (plans.length) {
      const used = new Set(plans.flatMap((p) => [...p.team1, ...p.team2]));
      const created: Match[] = plans.map((p) => ({
        id: newId(), round: R, stage: 'proposed', team1: p.team1, team2: p.team2,
        queueNo: null, readyAt: null, courtId: null, startedAt: null, winner: null,
      }));
      s = {
        ...s,
        matches: [...s.matches, ...created],
        players: s.players.map((p) => (used.has(p.player_id) ? { ...p, carryOver: false } : p)),
      };
      continue;
    }

    // Can the round end? Only when:
    //  - every proposal of this round has been readied,
    //  - someone actually got a game in this round,
    //  - everyone still owed a game this round is free and rested (so nobody
    //    is about to come back), and still no match can be made for them.
    const pendingProposal = s.matches.some((m) => m.stage === 'proposed' && m.round <= R);
    const someonePlayed = s.players.some((p) => lastRound(s, p) >= R);
    const owed = s.players.filter((p) => lastRound(s, p) < R);
    const owedAllWaiting = owed.every((p) => free.has(p.player_id) && rested(s, p, now));
    if (pendingProposal || !someonePlayed || !owedAllWaiting) break;

    const left = new Set(owed.map((p) => p.player_id));
    s = {
      ...s,
      round: R + 1,
      players: s.players.map((p) => (left.has(p.player_id) ? { ...p, carryOver: true } : p)),
    };
  }
  return s;
}

// Once a second: lets warm-ups finish and rested players come back.
setInterval(() => {
  const next = maintain(S, Date.now());
  if (next !== S) { S = next; emit(); }
}, 1000);

// ============================ players (Admin) ============================
export function addPlayer(name: string, level: Level): void {
  const p: Player = {
    player_id: newId(), name, level, locked: false, wins: 0, losses: 0, games: 0,
    waitingSince: Date.now(), lastFinished: null, lastDoneRound: 0, carryOver: false,
  };
  commit({ ...S, players: [...S.players, p] });
}

export function updatePlayer(playerId: number, name: string, level: Level): void {
  commit({ ...S, players: S.players.map((p) => (p.player_id === playerId ? { ...p, name, level } : p)) });
}

export function setLocked(playerId: number, locked: boolean): void {
  setLockedMany([playerId], locked);
}

/** Lock or unlock many players at once (Admin checkboxes). */
export function setLockedMany(ids: number[], locked: boolean): void {
  const set = new Set(ids);
  commit({ ...S, players: S.players.map((p) => (set.has(p.player_id) ? { ...p, locked } : p)) });
}

/** Removes players. Locked players and players on a court are skipped. */
function removePlayers(s: State, ids: number[]): { next: State; deleted: number; skipped: number } {
  const ok = new Set<number>();
  let skipped = 0;
  for (const id of ids) {
    const p = playerById(s, id);
    const m = matchOf(s, id);
    if (!p || p.locked || (m && (m.stage === 'playing' || m.stage === 'finished'))) { skipped++; continue; }
    ok.add(id);
  }
  // A proposed or queued match that loses a player is broken up; the others go back to waiting.
  const broken = new Set(s.matches.filter((m) => [...m.team1, ...m.team2].some((id) => ok.has(id))).map((m) => m.id));
  return {
    next: {
      ...s,
      players: s.players.filter((p) => !ok.has(p.player_id)),
      matches: s.matches.filter((m) => !broken.has(m.id)),
      draft: mapDraft(s.draft, (id) => (id != null && ok.has(id) ? null : id)),
    },
    deleted: ok.size,
    skipped,
  };
}

export function deletePlayer(playerId: number): { ok: boolean; reason?: string } {
  const p = playerById(S, playerId);
  if (!p) return { ok: false, reason: 'Player not found.' };
  if (p.locked) return { ok: false, reason: 'This player is locked. Unlock them first.' };
  const m = matchOf(S, playerId);
  if (m && (m.stage === 'playing' || m.stage === 'finished')) return { ok: false, reason: 'This player is on a court. Swap them out on the Live tab first.' };
  commit(removePlayers(S, [playerId]).next);
  return { ok: true };
}

export function deletePlayers(ids: number[]): { deleted: number; skipped: number } {
  const r = removePlayers(S, ids);
  commit(r.next);
  return { deleted: r.deleted, skipped: r.skipped };
}

// ============================ matches (Live) ============================
/** Ready: a proposed match becomes the next official "Queue N". */
export function readyMatch(matchId: number): void {
  const m = S.matches.find((x) => x.id === matchId);
  if (!m || m.stage !== 'proposed') return;
  const queueNo = S.queueCounter + 1;
  commit({
    ...S,
    queueCounter: queueNo,
    matches: S.matches.map((x) => (x.id === matchId ? { ...x, stage: 'queued', queueNo, readyAt: Date.now() } : x)),
  });
}

/** A place a player can be: a seat in a match, the waiting list, or a "Build a match" seat. */
export type Slot =
  | { kind: 'match'; matchId: number; team: 1 | 2; index: number; playerId: number }
  | { kind: 'pool'; playerId: number }
  | { kind: 'draft'; team: 1 | 2; index: number; playerId: number | null };

export const slotKey = (s: Slot) =>
  s.kind === 'pool' ? `pool-${s.playerId}` : s.kind === 'draft' ? `d-${s.team}-${s.index}` : `m${s.matchId}-${s.team}-${s.index}`;

// ---------------- Build a match (by hand) ----------------
function mapDraft(d: Draft, fn: (id: number | null) => number | null): Draft {
  return { team1: d.team1.map(fn), team2: d.team2.map(fn) };
}
function withSeat(d: Draft, team: 1 | 2, index: number, id: number | null): Draft {
  const key = team === 1 ? 'team1' : 'team2';
  const seats = [...d[key]];
  seats[index] = id;
  return { ...d, [key]: seats };
}

/** Puts a waiting player in a seat (or empties it with null). A player already in another seat moves. */
export function setDraftSeat(team: 1 | 2, index: number, playerId: number | null): void {
  if (playerId != null) {
    const inMatch = S.matches.some((m) => m.team1.includes(playerId) || m.team2.includes(playerId));
    if (inMatch || !playerById(S, playerId)) return;
  }
  const cleared = playerId == null ? S.draft : mapDraft(S.draft, (id) => (id === playerId ? null : id));
  commit({ ...S, draft: withSeat(cleared, team, index, playerId) });
}

export function clearDraft(): void {
  commit({ ...S, draft: emptyDraft() });
}

/** Seats in use for the current match type: 1 per team for singles, 2 for doubles. */
export function draftSeatCount(s: State): number {
  return s.settings.matchType === 'singles' ? 1 : 2;
}

/**
 * Dice: fills the empty seats at random, but prefers a fair match:
 *  1. levels that follow the matching rules (same level or mirrored nearby levels)
 *  2. players who have waited longest / played least
 * Seats you already filled stay. If every seat is filled, all seats are re-rolled.
 */
export function randomFillDraft(): void {
  const n = draftSeatCount(S);
  const start = [...S.draft.team1.slice(0, n), ...S.draft.team2.slice(0, n)].every((id) => id != null)
    ? emptyDraft()
    : S.draft;
  const seats: { team: 1 | 2; index: number }[] = [];
  for (const team of [1, 2] as const) {
    for (let index = 0; index < n; index++) {
      if ((team === 1 ? start.team1 : start.team2)[index] == null) seats.push({ team, index });
    }
  }
  const taken = new Set(draftIds(start));
  const waiting = freePlayers({ ...S, draft: start }).filter((p) => !taken.has(p.player_id));
  if (!seats.length || !waiting.length) return;

  // Best 10 by priority keeps the search quick; rank 0 = most deserving.
  const pool = sortByPriority(waiting.map((p) => ({
    id: p.player_id, level: p.level, games: p.games, waitingSince: p.waitingSince, carryOver: p.carryOver,
  }))).slice(0, 10);
  const k = Math.min(seats.length, pool.length);
  const levelOf = (id: number) => playerById(S, id)?.level ?? 'Beginner';

  let best: { pick: number[]; score: number } | null = null;
  const pick: number[] = [];
  const used = new Set<number>();
  const visit = () => {
    if (pick.length === k) {
      let d = start;
      pick.forEach((r, i) => { d = withSeat(d, seats[i].team, seats[i].index, pool[r].id); });
      const t1 = d.team1.slice(0, n);
      const t2 = d.team2.slice(0, n);
      const full = [...t1, ...t2].every((id) => id != null);
      const mixed = full && isMixedLevels((t1 as number[]).map(levelOf), (t2 as number[]).map(levelOf));
      // When a fair match is impossible, still keep levels as close and as even as we can.
      const li = (ids: (number | null)[]) => ids.filter((id): id is number => id != null).map((id) => LEVELS.indexOf(levelOf(id)));
      const all = [...li(t1), ...li(t2)];
      const spread = all.length ? Math.max(...all) - Math.min(...all) : 0;
      const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
      const uneven = Math.abs(sum(li(t1)) - sum(li(t2)));
      const fairness = mixed ? 1000 + spread * 60 + uneven * 30 : 0;
      const rankSum = pick.reduce((a, r) => a + r, 0);
      const score = fairness + rankSum + Math.random() * 6; // the dice: a little luck
      if (!best || score < best.score) best = { pick: [...pick], score };
      return;
    }
    for (let r = 0; r < pool.length; r++) {
      if (used.has(r)) continue;
      used.add(r); pick.push(r);
      visit();
      pick.pop(); used.delete(r);
    }
  };
  visit();
  if (!best) return;
  let d = start;
  (best as { pick: number[] }).pick.forEach((r, i) => { d = withSeat(d, seats[i].team, seats[i].index, pool[r].id); });
  commit({ ...S, draft: d });
}

/** Turns the filled seats into a proposed match. Returns false if a seat is empty. */
export function createDraftMatch(): boolean {
  const n = draftSeatCount(S);
  const t1 = S.draft.team1.slice(0, n);
  const t2 = S.draft.team2.slice(0, n);
  if ([...t1, ...t2].some((id) => id == null)) return false;
  const m: Match = {
    id: newId(), round: S.round, stage: 'proposed', team1: t1 as number[], team2: t2 as number[],
    queueNo: null, readyAt: null, courtId: null, startedAt: null, winner: null, manual: true,
  };
  commit({ ...S, matches: [...S.matches, m], draft: emptyDraft() });
  return true;
}

function slotStillValid(s: State, slot: Slot): boolean {
  if (slot.kind === 'pool') return freePlayers(s).some((p) => p.player_id === slot.playerId);
  if (slot.kind === 'draft') return (slot.team === 1 ? s.draft.team1 : s.draft.team2)[slot.index] === slot.playerId;
  const m = s.matches.find((x) => x.id === slot.matchId);
  return !!m && m.stage !== 'finished' && (slot.team === 1 ? m.team1 : m.team2)[slot.index] === slot.playerId;
}

/**
 * Swaps two players. Works between any two match seats (same match, other
 * match, on court) or a seat and the waiting list. Never touches wins,
 * losses or games — those are only recorded when a winner is confirmed.
 */
export function swapPlayers(a: Slot, b: Slot): void {
  if (a.playerId === b.playerId) return;
  // The screen can be a moment behind (e.g. a new match was proposed mid-drag):
  // only swap if both players are still where the drag said they were.
  if (!slotStillValid(S, a) || !slotStillValid(S, b)) return;
  if (a.kind === 'pool' && b.kind === 'pool') return; // both waiting: nothing to swap
  if (a.kind === 'draft' || b.kind === 'draft') {
    // "Build a match" seats trade with the waiting list, each other, or a match seat.
    const [d, o] = a.kind === 'draft' ? [a, b] : [b, a as Slot];
    if (d.kind !== 'draft') return;
    if (o.kind === 'pool') setDraftSeat(d.team, d.index, o.playerId);
    else if (o.kind === 'draft') {
      commit({ ...S, draft: withSeat(withSeat(S.draft, d.team, d.index, o.playerId), o.team, o.index, d.playerId) });
    } else if (d.playerId != null) {
      // Seat <-> match seat: the two players trade places.
      const incoming = d.playerId;
      const key = o.team === 1 ? 'team1' : 'team2';
      const matches = S.matches.map((m) => {
        if (m.id !== o.matchId) return m;
        const team = [...m[key]];
        team[o.index] = incoming;
        return { ...m, [key]: team };
      });
      commit({ ...S, matches, draft: withSeat(S.draft, d.team, d.index, o.playerId) });
    }
    return;
  }
  const put = (m: Match, seat: Slot, id: number): Match => {
    if (seat.kind !== 'match' || seat.matchId !== m.id) return m;
    const key = seat.team === 1 ? 'team1' : 'team2';
    const team = [...m[key]];
    team[seat.index] = id;
    return { ...m, [key]: team };
  };
  const matches = S.matches.map((m) => put(put(m, a, b.playerId), b, a.playerId));
  commit({ ...S, matches });
}

/** Confirms the winner: stats go to whoever is on the court right now. */
export function recordWinner(matchId: number, team: 1 | 2): void {
  const m = S.matches.find((x) => x.id === matchId);
  if (!m || m.stage !== 'playing') return;
  const winners = new Set(team === 1 ? m.team1 : m.team2);
  const all = new Set([...m.team1, ...m.team2]);
  commit({
    ...S,
    completed: [...S.completed, { team1: m.team1, team2: m.team2 }],
    matches: S.matches.map((x) => (x.id === matchId ? { ...x, stage: 'finished', winner: team } : x)),
    players: S.players.map((p) =>
      all.has(p.player_id)
        ? {
            ...p,
            wins: p.wins + (winners.has(p.player_id) ? 1 : 0),
            losses: p.losses + (winners.has(p.player_id) ? 0 : 1),
            games: p.games + 1,
            lastDoneRound: Math.max(p.lastDoneRound, m.round),
          }
        : p
    ),
  });

  // After the celebration, free the court and send the 4 players back to the pool.
  const token = sessionToken;
  setTimeout(() => {
    if (token !== sessionToken) return;
    const done = S.matches.find((x) => x.id === matchId);
    if (!done) return;
    const now = Date.now();
    const ids = new Set([...done.team1, ...done.team2]);
    commit({
      ...S,
      matches: S.matches.filter((x) => x.id !== matchId),
      players: S.players.map((p) => (ids.has(p.player_id) ? { ...p, waitingSince: now, lastFinished: now } : p)),
    });
  }, CELEBRATE_MS);
}

// ============================ courts + settings (Settings tab) ============================
export function getCourts(): Court[] {
  return S.courts.map((c) => {
    const inUse = S.matches.some((m) => m.courtId === c.court_id && (m.stage === 'playing' || m.stage === 'finished'));
    return { court_id: c.court_id, name: c.name, status: inUse ? 'occupied' : c.closed ? 'closed' : 'open' };
  });
}
export function addCourt(name: string): void {
  commit({ ...S, courts: [...S.courts, { court_id: newId(), name, closed: false }] });
}
export function setCourtStatus(courtId: number, status: CourtStatus): void {
  commit({ ...S, courts: S.courts.map((c) => (c.court_id === courtId ? { ...c, closed: status === 'closed' } : c)) });
}
export function removeCourt(courtId: number): { ok: boolean; reason?: string } {
  const c = getCourts().find((x) => x.court_id === courtId);
  if (!c) return { ok: false, reason: 'Court not found.' };
  if (c.status === 'occupied') return { ok: false, reason: 'Court is in use. End its match first.' };
  commit({ ...S, courts: S.courts.filter((x) => x.court_id !== courtId) });
  return { ok: true };
}

export function getSettings(): AppSettings { return S.settings; }
export function saveSettings(next: Partial<AppSettings>): void {
  const settings = { ...S.settings, ...next };
  // Switching to singles hides the 2nd "Build a match" seat of each team:
  // send anyone sitting there back to the waiting list so nobody disappears.
  const draft = settings.matchType === 'singles' && (S.draft.team1[1] != null || S.draft.team2[1] != null)
    ? withSeat(withSeat(S.draft, 1, 1, null), 2, 1, null)
    : S.draft;
  commit({ ...S, settings, draft });
}

// ============================ sessions ============================
/**
 * New session: clears every queue, court match and round, removes every
 * player who is NOT locked, and resets locked players' stats to 0.
 */
export function startNewSession(): void {
  sessionToken++;
  const now = Date.now();
  commit({
    ...S,
    matches: [],
    completed: [],
    round: 1,
    queueCounter: 0,
    draft: emptyDraft(),
    players: S.players
      .filter((p) => p.locked)
      .map((p) => ({ ...p, wins: 0, losses: 0, games: 0, waitingSince: now, lastFinished: null, lastDoneRound: 0, carryOver: false })),
  });
}

/** Deletes everything (players, courts, matches) and starts with 2 empty courts. */
export function resetAllData(): void {
  sessionToken++;
  commit({ ...S, players: [], courts: freshCourts(), matches: [], completed: [], round: 1, queueCounter: 0, draft: emptyDraft() });
}

// ============================ demo data ============================
/**
 * Fills the app with sample players (see demo-data.ts) and sets up every
 * Live section: 2 courts already playing, 1 queue warming up, 1 proposed
 * match waiting for Ready, and 2 players on the waiting list.
 */
export function loadDemoData(): void {
  const now = Date.now();
  const players: Player[] = DEMO_PLAYERS.map((d, i) => ({
    player_id: newId(), name: d.name, level: d.level, locked: !!d.locked,
    wins: d.wins, losses: d.losses, games: d.wins + d.losses,
    waitingSince: now - (DEMO_PLAYERS.length - i) * 60000, // staggered wait times
    lastFinished: null, lastDoneRound: 0, carryOver: false,
  }));
  commit({ ...S, players: [...S.players, ...players] }); // creates the proposed matches

  // Ready the first 3 proposals. The first 2 skip the warm-up so the courts are busy right away.
  const firstThree = S.matches.filter((m) => m.stage === 'proposed').slice(0, 3);
  firstThree.forEach((m) => readyMatch(m.id));
  const skipWarmup = new Set(firstThree.slice(0, 2).map((m) => m.id));
  commit({ ...S, matches: S.matches.map((m) => (skipWarmup.has(m.id) ? { ...m, readyAt: now - WARMUP_MS } : m)) });
}

if (DEMO_DATA) loadDemoData();
