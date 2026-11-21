// state/store.ts
// ---------------------------------------------------------------------------
// The whole app's data. It is saved on the device (lib/persist) after every
// change and restored when the app opens, so closing the app keeps players.
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
import { loadSaved, scheduleSave } from '../lib/persist';
import type { BgId } from '../theme';

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
  /** Queue number they lost when their queued match was broken up; their next match takes it back. */
  heldQueue?: number | null;
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
export type AppSettings = { matchType: MatchType; restMin: number; bg?: BgId };

export type State = {
  players: Player[];
  courts: StoredCourt[];
  matches: Match[];
  completed: { team1: number[]; team2: number[] }[]; // this session only, for "avoid repeats"
  round: number;
  queueCounter: number;
  settings: AppSettings;
  draft: Draft;
  /** False after "Start new session" until "Start Game" is pressed on Live: no timers, no matches. */
  started: boolean;
};

/** How long the warm-up shows at minimum before a queue goes on court. */
export const WARMUP_MS = 3000;
/** How long the winner celebration stays on court. */
export const CELEBRATE_MS = 3500;

// ============================ store plumbing ============================
let nextId = 1;
const newId = () => nextId++;

/** Courts in number order: "Court 2" before "Court 10", "4" before "5". */
const sortCourts = (cs: StoredCourt[]) =>
  [...cs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

/** After this long on the waiting list, a player may be matched one level away (Beginners with Intermediates too). */
export const LONG_WAIT_MIN = 20;

/** Standard match play: 2 minutes' rest between games. */
export const STANDARD_REST_MIN = 2;

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
  settings: { matchType: 'doubles', restMin: STANDARD_REST_MIN },
  draft: emptyDraft(),
  started: false,
};
/** Bumped on new session / reset so old celebration timers are ignored. */
let sessionToken = 0;

// ---- saved on the device (one versioned key), restored when the app opens ----
const SAVE_VERSION = 1;
const SETTINGS_VERSION = 2;
const onCourtIds = (s: State) =>
  new Set(s.matches.filter((m) => m.stage === 'playing' || m.stage === 'finished').flatMap((m) => [...m.team1, ...m.team2]));

function restore() {
  const text = loadSaved();
  if (!text) return;
  try {
    const saved = JSON.parse(text) as { v: number; nextId: number; state: State; sv?: number };
    if (saved.v !== SAVE_VERSION || !Array.isArray(saved.state?.players)) return;
    const st = saved.state;
    const now = Date.now();
    // A winner celebration can't resume after a restart: finish it now and send those players back to waiting.
    const done = st.matches.filter((m) => m.stage === 'finished');
    const back = new Set(done.flatMap((m) => [...m.team1, ...m.team2]));
    S = {
      ...S,
      ...st,
      // Saves made before the 2-minute standard rest existed get the new default once.
      settings: { ...S.settings, ...st.settings, ...((saved.sv ?? 1) < SETTINGS_VERSION ? { restMin: STANDARD_REST_MIN } : null) },
      courts: sortCourts(st.courts ?? S.courts),
      draft: st.draft ?? emptyDraft(),
      started: !!st.started,
      matches: st.matches.filter((m) => m.stage !== 'finished'),
      players: st.players.map((p) => (back.has(p.player_id) ? { ...p, waitingSince: now, lastFinished: now } : p)),
    };
    nextId = Math.max(nextId, saved.nextId ?? 1);
  } catch {
    // Unreadable save: start fresh.
  }
}
restore();

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
  scheduleSave(() => JSON.stringify({ v: SAVE_VERSION, sv: SETTINGS_VERSION, nextId, state: S }));
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Replace the state, run the automatic steps, then tell React. */
function commit(next: State) {
  const now = Date.now();
  // Wait timers pause on court and restart from 0 when a player comes off (e.g. swapped out).
  const before = onCourtIds(S);
  const after = onCourtIds(next);
  const left = [...before].filter((id) => !after.has(id));
  if (left.length) {
    const ids = new Set(left);
    next = { ...next, players: next.players.map((p) => (ids.has(p.player_id) ? { ...p, waitingSince: now } : p)) };
  }
  S = maintain(next, now);
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

  // 2 + 3) Proposals and rounds (only once the game has started).
  if (!s.started) return s;
  const size = s.settings.matchType === 'singles' ? 2 : 4;
  for (let guard = 0; guard < 50; guard++) {
    const R = s.round;
    const free = new Set(freePlayers(s).map((p) => p.player_id));
    const eligible = s.players.filter((p) => free.has(p.player_id) && lastRound(s, p) < R && rested(s, p, now));
    const cands: Candidate[] = eligible.map((p) => ({
      id: p.player_id, level: p.level, games: p.games, waitingSince: p.waitingSince, carryOver: p.carryOver,
      waitedLong: now - p.waitingSince >= LONG_WAIT_MIN * 60000,
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
  // A proposed or queued match that loses a player keeps its place in the queue.
  // The seat goes to the best waiting player: same level, then same level still
  // resting, then one level up/down (never mixing Beginners). Only if nobody fits
  // is the match broken up and the others go back to waiting.
  const now = Date.now();
  const waitingNow = sortByPriority(
    freePlayers(s)
      .filter((p) => !ok.has(p.player_id))
      .map((p) => ({ id: p.player_id, level: p.level, games: p.games, waitingSince: p.waitingSince, carryOver: p.carryOver }))
  );
  const isRested = (id: number) => { const p = playerById(s, id); return !!p && rested(s, p, now); };
  const near = (a: Level, b: Level) =>
    a !== 'Beginner' && b !== 'Beginner' && Math.abs(LEVELS.indexOf(a) - LEVELS.indexOf(b)) === 1;
  const taken = new Set<number>();
  const broken = new Set<number>();
  const bumped: number[] = [];
  const matches = s.matches.map((m) => {
    if (![...m.team1, ...m.team2].some((id) => ok.has(id))) return m;
    const fill = (team: number[]) => team.map((id) => {
      if (!ok.has(id)) return id;
      const lvl = playerById(s, id)?.level ?? 'Beginner';
      // Never hand someone an extra game: the substitute must not have played this match's round yet.
      const owes = (pid: number) => (playerById(s, pid)?.lastDoneRound ?? 0) < m.round;
      const free = waitingNow.filter((c) => !taken.has(c.id) && owes(c.id));
      const sub =
        free.find((c) => c.level === lvl && isRested(c.id)) ??
        free.find((c) => c.level === lvl) ??
        free.find((c) => near(c.level, lvl) && isRested(c.id));
      if (sub) { taken.add(sub.id); return sub.id; }
      // Nobody free: borrow a same-level player from a NEWER queue/proposal (it has waited
      // the least). That newer match is broken up instead and its players go to the top
      // of the waiting list.
      const order = (x: Match) => (x.stage === 'proposed' ? 1e9 + x.id : x.queueNo ?? 0);
      const donors = s.matches
        .filter((x) => x.id !== m.id && (x.stage === 'proposed' || x.stage === 'queued') && order(x) > order(m) && !broken.has(x.id))
        .sort((x, y) => order(y) - order(x));
      for (const d of donors) {
        const pickId = [...d.team1, ...d.team2].find((pid) => !ok.has(pid) && !taken.has(pid) && owes(pid) && playerById(s, pid)?.level === lvl);
        if (pickId != null) { taken.add(pickId); broken.add(d.id); bumped.push(...[...d.team1, ...d.team2].filter((x) => x !== pickId)); return pickId; }
      }
      broken.add(m.id);
      return id;
    });
    return { ...m, team1: fill(m.team1), team2: fill(m.team2) };
  });
  // Players left over from a broken match get priority for the next match, and if it was
  // a queued match they keep its queue number: their next match takes that spot back.
  const priority = new Map<number, number | null>();
  for (const m of s.matches) {
    if (!broken.has(m.id)) continue;
    for (const id of [...m.team1, ...m.team2]) if (!taken.has(id) && !ok.has(id)) priority.set(id, m.stage === 'queued' ? m.queueNo : null);
  }
  return {
    next: {
      ...s,
      players: s.players
        .filter((p) => !ok.has(p.player_id))
        .map((p) => (priority.has(p.player_id) ? { ...p, carryOver: true, heldQueue: priority.get(p.player_id) ?? p.heldQueue ?? null } : p)),
      matches: matches.filter((m) => !broken.has(m.id)),
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
  // A player who lost their queue spot (someone left) gets it back: this match takes
  // their old queue number, so it goes on court in that place instead of at the back.
  const ids = new Set([...m.team1, ...m.team2]);
  const inUse = new Set(S.matches.filter((x) => x.stage !== 'proposed').map((x) => x.queueNo));
  const held = S.players
    .filter((p) => ids.has(p.player_id) && p.heldQueue != null && !inUse.has(p.heldQueue))
    .map((p) => p.heldQueue as number);
  const queueNo = held.length ? Math.min(...held) : S.queueCounter + 1;
  commit({
    ...S,
    queueCounter: Math.max(S.queueCounter, queueNo),
    matches: S.matches.map((x) => (x.id === matchId ? { ...x, stage: 'queued', queueNo, readyAt: Date.now() } : x)),
    players: S.players.map((p) => (ids.has(p.player_id) && p.heldQueue != null ? { ...p, heldQueue: null } : p)),
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

/**
 * Warning text when a swap would put a player who has played MORE games into a
 * match (or Build-a-match seats) with players who have played fewer, e.g. a
 * 2nd game while others are still waiting for their 1st in Round 1. null = fine.
 */
export function gamesWarning(a: Slot, b: Slot): string | null {
  const s = S;
  if (a.kind === 'match' && b.kind === 'match' && a.matchId === b.matchId) return null; // same match: nobody joins
  if (a.kind === 'draft' && b.kind === 'draft') return null;
  const othersAt = (dest: Slot, moverId: number): number[] => {
    if (dest.kind === 'pool') return [];
    let ids: (number | null)[];
    if (dest.kind === 'draft') {
      const n = draftSeatCount(s);
      ids = [...s.draft.team1.slice(0, n), ...s.draft.team2.slice(0, n)];
    } else {
      const m = s.matches.find((x) => x.id === dest.matchId);
      ids = m ? [...m.team1, ...m.team2] : [];
    }
    return ids.filter((id): id is number => id != null && id !== dest.playerId && id !== moverId);
  };
  const check = (moverId: number | null, dest: Slot): string | null => {
    if (moverId == null) return null;
    const mover = playerById(s, moverId);
    if (!mover) return null;
    const fewer = othersAt(dest, moverId).map((id) => playerById(s, id)).filter((p): p is Player => !!p && p.games < mover.games);
    if (!fewer.length) return null;
    const g = (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`;
    const who = fewer.length === 1 ? `${fewer[0].name} has played ${g(fewer[0].games)}` : `${fewer.map((p) => p.name).join(', ')} have played fewer`;
    return `${mover.name} has already played ${g(mover.games)}, but ${who}. Wait for Round ${s.round + 1}, or replace anyway?`;
  };
  return check(a.playerId, b) ?? check(b.playerId, a);
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
  commit({ ...S, courts: sortCourts([...S.courts, { court_id: newId(), name, closed: false }]) });
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
    started: false, // no timers until "Start Game"
    players: S.players
      .filter((p) => p.locked)
      .map((p) => ({ ...p, wins: 0, losses: 0, games: 0, waitingSince: now, lastFinished: null, lastDoneRound: 0, carryOver: false, heldQueue: null })),
  });
}

/** "Start Game" on Live: every current player's wait timer starts at the same moment. */
/** Players needed before "Start Game": one full match (4 for doubles, 2 for singles). */
export function playersToStart(s: State): number {
  return s.settings.matchType === 'singles' ? 2 : 4;
}

export function startGame(): void {
  if (S.started || S.players.length < playersToStart(S)) return;
  const now = Date.now();
  commit({ ...S, started: true, players: S.players.map((p) => ({ ...p, waitingSince: now })) });
}

/** Deletes everything (players, courts, matches) and starts with 2 empty courts. */
export function resetAllData(): void {
  sessionToken++;
  commit({ ...S, players: [], courts: freshCourts(), matches: [], completed: [], round: 1, queueCounter: 0, draft: emptyDraft(), started: false });
}
