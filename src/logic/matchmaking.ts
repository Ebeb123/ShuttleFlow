// logic/matchmaking.ts
// ---------------------------------------------------------------------------
// Pure matchmaking rules (no React, no state). The store calls planMatches()
// with the players who are free and allowed to play in the current round.
//
// Level rules for doubles (2 teams of 2):
//   - all 4 players the same level            → B+B vs B+B, I+I vs I+I, …
//   - 2 players of a level + 2 of the next one → B+I vs B+I, I+A vs I+A, A+P vs A+P
//     and every team gets one of each level (mirrored teams).
//   Anything else (e.g. Beginner with Advance) is not auto-matched, with one exception:
//   when the free players can't make any fair match (e.g. 1 Pro + 3 Advance, or
//   3 Intermediate + 1 Advance + 3 Pro), they are matched with the closest level
//   (at most one level away) so nobody waits forever. A player left out of a
//   round gets this first, before others play again. This fallback is only
//   for Intermediate, Advance and Pro. The one exception: a Beginner who has
//   waited 20+ min may be matched with Intermediates.
// Singles: same level first, an adjacent level only as a fallback.
// ---------------------------------------------------------------------------
export const LEVELS = ['Beginner', 'Intermediate', 'Advance', 'Pro'] as const;
export type Level = (typeof LEVELS)[number];

const li = (l: Level) => LEVELS.indexOf(l);

/** A player who could be put into a new match. */
export type Candidate = {
  id: number;
  level: Level;
  games: number;        // games played this session (fewer = higher priority)
  waitingSince: number; // ms timestamp (earlier = higher priority)
  carryOver: boolean;   // left out of the previous round → top priority
  waitedLong?: boolean; // waiting 20+ min: may be matched one level away (even a Beginner with Intermediates)
};

/** How often two players were partners / opponents this session. */
export type History = { partners: Map<string, number>; opponents: Map<string, number> };
export type Plan = { team1: number[]; team2: number[] };

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const emptyHistory = (): History => ({ partners: new Map(), opponents: new Map() });

/** Adds one match to the history counts. */
export function addToHistory(h: History, team1: number[], team2: number[]): void {
  const bump = (m: Map<string, number>, a: number, b: number) => m.set(key(a, b), (m.get(key(a, b)) ?? 0) + 1);
  for (const team of [team1, team2]) {
    for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) bump(h.partners, team[i], team[j]);
  }
  for (const a of team1) for (const b of team2) bump(h.opponents, a, b);
}

/** Priority order: left-over players first, then fewest games, then longest wait. */
export function sortByPriority(list: Candidate[]): Candidate[] {
  return [...list].sort((a, b) =>
    Number(b.carryOver) - Number(a.carryOver) ||
    a.games - b.games ||
    a.waitingSince - b.waitingSince ||
    a.id - b.id
  );
}

/** Penalty for repeating partners (counts a lot) and opponents (counts a little). */
function repeatCost(h: History, team1: number[], team2: number[]): number {
  let cost = 0;
  for (const team of [team1, team2]) {
    for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) cost += 3 * (h.partners.get(key(team[i], team[j])) ?? 0);
  }
  for (const a of team1) for (const b of team2) cost += h.opponents.get(key(a, b)) ?? 0;
  return cost;
}

/** All ways to pick `k` items from `arr` (arr is small, so this is cheap). */
function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...combos(rest, k - 1).map((c) => [first, ...c]), ...combos(rest, k)];
}

type Shape = { counts: Map<Level, number>; penalty: number };

/** The level shapes a match containing `level` may have. */
function shapesFor(level: Level, size: number): Shape[] {
  const i = li(level);
  const lower = LEVELS[i - 1];
  const upper = LEVELS[i + 1];
  const shapes: Shape[] = [];
  if (size === 4) {
    shapes.push({ counts: new Map([[level, 4]]), penalty: 0 });
    if (upper) shapes.push({ counts: new Map([[level, 2], [upper, 2]]), penalty: 1 });
    if (lower) shapes.push({ counts: new Map([[lower, 2], [level, 2]]), penalty: 1 });
  } else {
    shapes.push({ counts: new Map([[level, 2]]), penalty: 0 });
    if (upper) shapes.push({ counts: new Map([[level, 1], [upper, 1]]), penalty: 3 });
    if (lower) shapes.push({ counts: new Map([[lower, 1], [level, 1]]), penalty: 3 });
  }
  return shapes;
}

/** Valid team splits for a group of 2 or 4 that follows the level rules. */
function splits(group: Candidate[]): [Candidate[], Candidate[]][] {
  if (group.length === 2) return [[[group[0]], [group[1]]]];
  const [a, b, c, d] = group;
  const all: [Candidate[], Candidate[]][] = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
  return all.filter(([t1, t2]) => !isMixedLevels(t1.map((p) => p.level), t2.map((p) => p.level)));
}

/** Best match that includes `anchor`, or null if the level rules make it impossible. */
function bestFor(anchor: Candidate, pool: Candidate[], size: number, h: History): Plan | null {
  const rank = new Map(pool.map((p, i) => [p.id, i]));
  let best: { plan: Plan; score: number } | null = null;

  for (const shape of shapesFor(anchor.level, size)) {
    // For each level in the shape, pick from the top few players of that level.
    const parts: Candidate[][][] = [];
    let ok = true;
    for (const [lvl, count] of shape.counts) {
      const need = lvl === anchor.level ? count - 1 : count;
      const options = pool.filter((p) => p.level === lvl && p.id !== anchor.id).slice(0, 6);
      const picks = combos(options, need);
      if (!picks.length) { ok = false; break; }
      parts.push(picks);
    }
    if (!ok) continue;

    // Every combination of the per-level picks.
    let groups: Candidate[][] = [[anchor]];
    for (const picks of parts) groups = groups.flatMap((g) => picks.map((p) => [...g, ...p]));

    for (const g of groups) {
      const prioritySum = g.reduce((s, p) => s + (rank.get(p.id) ?? 0), 0);
      for (const [t1, t2] of splits(g)) {
        const ids1 = t1.map((p) => p.id);
        const ids2 = t2.map((p) => p.id);
        const score = prioritySum + 4 * repeatCost(h, ids1, ids2) + shape.penalty;
        if (!best || score < best.score) best = { plan: { team1: ids1, team2: ids2 }, score };
      }
    }
  }
  return best ? best.plan : null;
}

/** All team splits of a group of 2 or 4, with no level filter. */
function allSplits(group: Candidate[]): [Candidate[], Candidate[]][] {
  if (group.length === 2) return [[[group[0]], [group[1]]]];
  const [a, b, c, d] = group;
  return [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
}

/**
 * Fallback for a left-out player with nobody at a fair level: closest levels
 * (max one level away), then the most even teams, then priority.
 */
function closestFor(anchor: Candidate, pool: Candidate[], size: number, h: History): Plan | null {
  // Beginners only get this after a long wait, and then only with Intermediates.
  if (anchor.level === 'Beginner' && !anchor.waitedLong) return null;
  const gap = (p: Candidate) => Math.abs(li(p.level) - li(anchor.level));
  const rank = new Map(pool.map((p, i) => [p.id, i]));
  // pool is already in priority order and sort is stable, so ties keep priority.
  const sum = (t: Candidate[]) => t.reduce((s, p) => s + li(p.level), 0);
  let best: { plan: Plan; score: number } | null = null;
  // Try one direction at a time (anchor's level + the level above, or + the level below),
  // so a match never spans more than two neighbouring levels (no Intermediate with Pro).
  for (const dir of [1, -1]) {
    const other = LEVELS[li(anchor.level) + dir];
    if (!other || other === 'Beginner') continue; // never pull Beginners in from above
    const options = pool.filter((p) => p.id !== anchor.id && (p.level === anchor.level || p.level === other)).sort((a, b) => gap(a) - gap(b)).slice(0, 6);
    if (options.length < size - 1) continue;
  for (const picks of combos(options, size - 1)) {
    const g = [anchor, ...picks];
    const levelCost = picks.reduce((s, p) => s + gap(p), 0);
    const prioritySum = picks.reduce((s, p) => s + (rank.get(p.id) ?? 0), 0);
    for (const [t1, t2] of allSplits(g)) {
      const ids1 = t1.map((p) => p.id);
      const ids2 = t2.map((p) => p.id);
      const score = 20 * levelCost + 10 * Math.abs(sum(t1) - sum(t2)) + prioritySum + 4 * repeatCost(h, ids1, ids2);
      if (!best || score < best.score) best = { plan: { team1: ids1, team2: ids2 }, score };
    }
  }
  }
  return best ? best.plan : null;
}

/**
 * Builds as many rule-following matches as possible from `candidates`.
 * The highest-priority player is always tried first; a player who can't be
 * matched is skipped (they wait and get priority later).
 */
export function planMatches(candidates: Candidate[], size: number, h: History): Plan[] {
  let pool = sortByPriority(candidates);
  const skipped = new Set<number>();
  const plans: Plan[] = [];
  while (true) {
    const anchor = pool.find((p) => !skipped.has(p.id));
    if (!anchor || pool.length < size) break;
    // A player left out last round who still can't get a fair match gets the closest one instead.
    // Left out last round, or waiting 20+ min (e.g. the odd Pro or Beginner): if there's
    // no fair match, they get the closest one before others play again.
    const plan = bestFor(anchor, pool, size, h) ?? (anchor.carryOver || anchor.waitedLong ? closestFor(anchor, pool, size, h) : null);
    if (!plan) { skipped.add(anchor.id); continue; }
    plans.push(plan);
    const used = new Set([...plan.team1, ...plan.team2]);
    pool = pool.filter((p) => !used.has(p.id));
  }

  // Second pass: whoever is still waiting has no fair match among the free players
  // (e.g. 3 Intermediate + 1 Advance + 3 Pro). Rather than everyone waiting forever,
  // match them with the closest level that is available (never Beginners).
  const stuck = new Set<number>();
  while (pool.length >= size) {
    const anchor = pool.find((p) => !stuck.has(p.id));
    if (!anchor) break;
    const plan = closestFor(anchor, pool, size, h);
    if (!plan) { stuck.add(anchor.id); continue; }
    plans.push(plan);
    const used = new Set([...plan.team1, ...plan.team2]);
    pool = pool.filter((p) => !used.has(p.id));
  }
  return plans;
}

/**
 * True when a match breaks the auto-match level rules (used for the
 * "Mixed levels" warning after a manual swap).
 */
export function isMixedLevels(team1: Level[], team2: Level[]): boolean {
  const all = [...team1, ...team2];
  if (all.length === 2) return Math.abs(li(all[0]) - li(all[1])) > 1;
  if (all.length !== 4 || team1.length !== 2) return true;
  const idx = all.map(li);
  const lo = Math.min(...idx);
  const hi = Math.max(...idx);
  if (lo === hi) return false;                          // all the same level
  if (hi - lo !== 1) return true;                       // levels too far apart
  const lowCount = idx.filter((x) => x === lo).length;
  if (lowCount !== 2) return true;                      // must be 2 + 2
  // Mirrored: each team has exactly one of each level.
  return li(team1[0]) === li(team1[1]);
}
