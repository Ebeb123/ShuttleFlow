import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { LEVELS, type Level, type Stage } from '../state/store';
import { levelColor, type Palette } from '../theme';
import { Badge, Button, DiceIcon, EmptyText, Glass, Grid, LevelBadge, List } from './ui/kit';
import { DropSeat, EditButton, PlayerChip, useSwap } from './swap-layer';

const ND = Platform.OS !== 'web'; // native driver isn't available on web

const RATIO = 13.4 / 6.1; // doubles court length : width
const PAD = 10; // floor run-off around the playing surface
const GAP = 12;

// Classic green badminton court.
const FLOOR = '#1f5e46';
const SURFACE = '#2e8b63';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type Ease = (v: number) => number;
function tm(v: Animated.Value | Animated.ValueXY, toValue: number | { x: number; y: number }, duration: number, easing: Ease = Easing.inOut(Easing.quad), delay = 0) {
  return Animated.timing(v, { toValue, duration, easing, delay, useNativeDriver: ND });
}

function useLoop(duration: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([tm(v, 1, duration), tm(v, 0, duration)]));
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  return v;
}

// ================================================================ people
/** Simple person icon. `outline` adds a white edge so coloured icons stand out on the court. */
export function Person({ size = 18, color = '#fff', outline = false }: { size?: number; color?: string; outline?: boolean }) {
  const edge = outline ? { borderWidth: Math.max(1.5, size * 0.07), borderColor: '#fff' } : null;
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={[{ width: size * 0.48, height: size * 0.48, borderRadius: size, backgroundColor: color }, edge]} />
      <View style={[{ width: size * 0.86, height: size * 0.46, marginTop: size * 0.04, borderTopLeftRadius: size, borderTopRightRadius: size, backgroundColor: color }, edge]} />
    </View>
  );
}

/** Person doing a warm-up stretch: arms up → lean left → lean right → arms down with a squat. */
function WarmupPerson({ size, color, delay }: { size: number; color: string; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([tm(t, 1, 450), tm(t, 2, 550), tm(t, 3, 900), tm(t, 4, 600), Animated.delay(450)]));
    const id = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(id); loop.stop(); };
  }, [t, delay]);

  const lean = t.interpolate({ inputRange: [0, 1, 2, 3, 4], outputRange: ['0deg', '0deg', '-18deg', '18deg', '0deg'] });
  const armL = t.interpolate({ inputRange: [0, 1, 3, 4], outputRange: ['25deg', '165deg', '165deg', '25deg'] });
  const armR = t.interpolate({ inputRange: [0, 1, 3, 4], outputRange: ['-25deg', '-165deg', '-165deg', '-25deg'] });
  const squat = t.interpolate({ inputRange: [0, 3, 3.5, 4], outputRange: [0, 0, size * 0.12, 0] });

  const head = size * 0.42;
  const torsoW = size * 0.66;
  const armLen = size * 0.4;
  const armT = Math.max(2, size * 0.12);
  const shoulderY = head + size * 0.06 + armT * 0.6;
  const arm = (side: -1 | 1, rotate: Animated.AnimatedInterpolation<string>) => (
    <Animated.View
      style={{
        position: 'absolute', width: armT, height: armLen * 2,
        left: size / 2 + side * (torsoW / 2 - armT * 0.2) - armT / 2, top: shoulderY - armLen,
        transform: [{ rotate }],
      }}
    >
      <View style={{ marginTop: armLen, width: armT, height: armLen, borderRadius: armT, backgroundColor: color }} />
    </Animated.View>
  );

  return (
    <View style={{ width: size * 1.6, height: size, marginTop: size * 0.35, alignItems: 'center' }}>
      {/* 2× tall wrapper so rotation pivots at the feet */}
      <Animated.View style={{ width: size, height: size * 2, transform: [{ translateY: squat }, { rotate: lean }] }}>
        <View style={{ width: size, height: size, alignItems: 'center' }}>
          <View style={{ width: head, height: head, borderRadius: size, backgroundColor: color }} />
          <View style={{ width: torsoW, height: size * 0.5, marginTop: size * 0.06, borderTopLeftRadius: size * 0.3, borderTopRightRadius: size * 0.3, backgroundColor: color }} />
          {arm(-1, armL)}
          {arm(1, armR)}
        </View>
      </Animated.View>
    </View>
  );
}

// ================================================================ court geometry
// u = along the court length (0 = team 1 baseline, 0.5 = net, 1 = team 2 baseline)
// v = across the court width
type Orient = 'h' | 'v';
type UV = { u: number; v: number };
const toXY = (p: UV, sw: number, sh: number, o: Orient) => (o === 'h' ? { x: p.u * sw, y: p.v * sh } : { x: p.v * sw, y: p.u * sh });

function CourtLines({ sw, sh, o }: { sw: number; sh: number; o: Orient }) {
  const across = (u: number) =>
    o === 'h'
      ? <View key={`a${u}`} style={[styles.line, { left: u * sw - 1, top: 0, width: 2, height: sh }]} />
      : <View key={`a${u}`} style={[styles.line, { top: u * sh - 1, left: 0, height: 2, width: sw }]} />;
  const along = (v: number, u0: number, u1: number) =>
    o === 'h'
      ? <View key={`l${v}${u0}`} style={[styles.line, { top: v * sh - 1, left: u0 * sw, width: (u1 - u0) * sw, height: 2 }]} />
      : <View key={`l${v}${u0}`} style={[styles.line, { left: v * sw - 1, top: u0 * sh, height: (u1 - u0) * sh, width: 2 }]} />;
  const span = (o === 'h' ? sh : sw) + 24;
  const dashes = Array.from({ length: Math.max(8, Math.round(span / 10)) });
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: '#fff' }]} />
      {along(0.075, 0, 1)}{along(0.925, 0, 1)}
      {across(0.057)}{across(0.943)}
      {across(0.352)}{across(0.648)}
      {along(0.5, 0, 0.352)}{along(0.5, 0.648, 1)}
      <View style={[styles.net, o === 'h'
        ? { left: sw / 2 - 1.5, top: -12, width: 3, height: sh + 24, flexDirection: 'column' }
        : { top: sh / 2 - 1.5, left: -12, height: 3, width: sw + 24, flexDirection: 'row' }]}>
        {dashes.map((_, i) => <View key={i} style={[styles.netDash, o === 'h' ? { marginVertical: 1.5 } : { marginHorizontal: 1.5 }]} />)}
      </View>
      {(o === 'h' ? [{ left: sw / 2 - 5, top: -17 }, { left: sw / 2 - 5, top: sh + 7 }] : [{ top: sh / 2 - 5, left: -17 }, { top: sh / 2 - 5, left: sw + 7 }]).map((p, i) => (
        <View key={i} style={[styles.post, p]} />
      ))}
    </>
  );
}

// ================================================================ rally engine
type Shot = 'serve' | 'clear' | 'drop' | 'drive' | 'smash';
// d = distance from the net where the shuttle lands (fraction of court length)
const SHOTS: Record<Shot, { d: [number, number]; dur: number; peak: number }> = {
  serve: { d: [0.15, 0.22], dur: 900, peak: 1.5 },
  clear: { d: [0.33, 0.43], dur: 1300, peak: 2.4 },
  drop: { d: [0.05, 0.14], dur: 1000, peak: 1.6 },
  drive: { d: [0.16, 0.3], dur: 600, peak: 1.15 },
  smash: { d: [0.2, 0.36], dur: 420, peak: 1.08 },
};
// what usually comes back after each shot
const NEXT: Record<Shot, [Shot, number][]> = {
  serve: [['drop', 0.35], ['clear', 0.45], ['drive', 0.2]],
  clear: [['smash', 0.45], ['drop', 0.25], ['clear', 0.3]],
  drop: [['drop', 0.4], ['clear', 0.5], ['drive', 0.1]],
  drive: [['drive', 0.5], ['drop', 0.25], ['clear', 0.25]],
  smash: [['drive', 0.45], ['drop', 0.35], ['clear', 0.2]],
};
function pickShot(prev: Shot): Shot {
  let r = Math.random();
  for (const [s, w] of NEXT[prev]) if ((r -= w) <= 0) return s;
  return 'clear';
}

const HOME_D: UV[][] = [[{ u: 0.22, v: 0.3 }, { u: 0.3, v: 0.72 }], [{ u: 0.78, v: 0.7 }, { u: 0.7, v: 0.28 }]];
const HOME_S: UV[][] = [[{ u: 0.25, v: 0.5 }], [{ u: 0.75, v: 0.5 }]];

type Anim = {
  xy: Animated.ValueXY[][];
  swing: Animated.Value[][];
  sxy: Animated.ValueXY;
  g1: Animated.ValueXY;
  g2: Animated.ValueXY;
  scale: Animated.Value;
};

type RallyMatch = { match_id: number; team1: Member[]; team2: Member[] };

function RallyCourt({ match, sw, sh, o }: { match: RallyMatch; sw: number; sh: number; o: Orient }) {
  const teams = [match.team1, match.team2];
  const singles = teams[0].length === 1 && teams[1].length === 1;
  const homes = singles ? HOME_S : HOME_D;
  const home = (t: number, i: number) => homes[t][i] ?? homes[t][0];
  const map = (p: UV) => toXY(p, sw, sh, o);

  const ref = useRef<Anim | null>(null);
  if (!ref.current) {
    const start = map(home(0, 0));
    ref.current = {
      xy: teams.map((team, t) => team.map((_, i) => new Animated.ValueXY(map(home(t, i))))),
      swing: teams.map((team) => team.map(() => new Animated.Value(0))),
      sxy: new Animated.ValueXY(start),
      g1: new Animated.ValueXY(start),
      g2: new Animated.ValueXY(start),
      scale: new Animated.Value(1),
    };
  }
  const A = ref.current;

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(() => { if (alive) fn(); }, ms)); };
    const pos: UV[][] = teams.map((team, t) => team.map((_, i) => ({ ...home(t, i) })));

    const moveTo = (t: number, i: number, p: UV, dur: number) => {
      pos[t][i] = p;
      tm(A.xy[t][i], map(p), dur, Easing.out(Easing.quad)).start();
    };
    const swing = (t: number, i: number) =>
      Animated.sequence([tm(A.swing[t][i], 1, 110, Easing.out(Easing.quad)), tm(A.swing[t][i], 0, 240)]).start();
    const fly = (to: UV, dur: number, peak: number) => {
      const p = map(to);
      const ease = Easing.out(Easing.quad); // shuttles fly fast then slow down
      Animated.parallel([
        tm(A.sxy, p, dur, ease), tm(A.g1, p, dur, ease, 40), tm(A.g2, p, dur, ease, 80),
        Animated.sequence([tm(A.scale, peak, dur * 0.45, Easing.out(Easing.quad)), tm(A.scale, 1, dur * 0.55, Easing.in(Easing.quad))]),
      ]).start();
    };
    const nearest = (t: number, target: UV) => {
      let best = 0, bestD = Infinity;
      pos[t].forEach((p, i) => {
        const d = ((p.u - target.u) * RATIO) ** 2 + (p.v - target.v) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    };
    // partner of the receiver covers the open part of the court
    const cover = (t: number, target: UV): UV => {
      const nearNet = Math.abs(target.u - 0.5) < 0.17;
      return nearNet ? { u: t === 0 ? 0.17 : 0.83, v: 0.5 } : { u: t === 0 ? 0.3 : 0.7, v: target.v < 0.5 ? 0.7 : 0.3 };
    };
    // after hitting, go back to a base position that complements the partner
    const recover = (t: number, i: number): UV => {
      if (teams[t].length === 1) return { u: t === 0 ? 0.27 : 0.73, v: 0.5 };
      const mate = pos[t][1 - i];
      const mateFront = Math.abs(mate.u - 0.5) < 0.2;
      return { u: mateFront ? (t === 0 ? 0.18 : 0.82) : (t === 0 ? 0.3 : 0.7), v: clamp(1 - mate.v, 0.25, 0.75) };
    };

    let rally = 0;
    const shot = (hT: number, hI: number, kind: Shot) => {
      const rT = 1 - hT;
      const s = SHOTS[kind];
      const d = rand(s.d[0], s.d[1]);
      const target = { u: rT === 1 ? 0.5 + d : 0.5 - d, v: rand(0.14, 0.86) };
      rally++;
      const winner = rally > 3 && Math.random() < 0.1;
      const rI = nearest(rT, target);
      const from = pos[rT][rI];
      const stand = { u: clamp(target.u + (rT === 1 ? 0.035 : -0.035), 0.04, 0.96), v: target.v };
      const reach = winner ? { u: from.u + (stand.u - from.u) * 0.5, v: from.v + (stand.v - from.v) * 0.5 } : stand;

      swing(hT, hI);
      fly(target, s.dur, s.peak);
      later(() => {
        moveTo(rT, rI, reach, s.dur * 0.8);
        if (teams[rT].length > 1) moveTo(rT, 1 - rI, cover(rT, target), s.dur * 0.9);
      }, 60);
      later(() => moveTo(hT, hI, recover(hT, hI), 650), 180);
      later(() => (winner ? point(hT) : shot(rT, rI, pickShot(kind))), s.dur);
    };

    // rally over: shuttle drops, everyone resets, winner serves
    const point = (winT: number) => {
      rally = 0;
      tm(A.scale, 0.75, 150).start();
      later(() => {
        teams.forEach((team, t) => team.forEach((_, i) => moveTo(t, i, home(t, i), 800)));
        const sI = Math.floor(Math.random() * teams[winT].length);
        const h = home(winT, sI);
        const p = map({ u: h.u + (winT === 0 ? 0.03 : -0.03), v: h.v });
        Animated.parallel([tm(A.sxy, p, 800), tm(A.g1, p, 800), tm(A.g2, p, 800), tm(A.scale, 1, 300)]).start();
        later(() => shot(winT, sI, 'serve'), 1300);
      }, 1100);
    };

    const first = Math.random() < 0.5 ? 0 : 1;
    const h = home(first, 0);
    const p = map({ u: h.u + (first === 0 ? 0.03 : -0.03), v: h.v });
    A.sxy.setValue(p); A.g1.setValue(p); A.g2.setValue(p);
    later(() => shot(first, 0, 'serve'), 700);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      [...A.xy.flat(), A.sxy, A.g1, A.g2].forEach((v) => v.stopAnimation());
      [...A.swing.flat(), A.scale].forEach((v) => v.stopAnimation());
    };
    // engine is keyed by match + size, so it only needs to run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon = clamp(Math.min(sw, sh) * 0.09, 16, 30);
  const dot = clamp(icon * 0.4, 7, 12);
  const shadowX = Animated.add(A.sxy.x, Animated.multiply(Animated.add(A.scale, -1), 7));
  const shadowY = Animated.add(A.sxy.y, Animated.multiply(Animated.add(A.scale, -1), 9));
  const dotStyle = { position: 'absolute' as const, left: -dot / 2, top: -dot / 2, width: dot, height: dot, borderRadius: dot };

  return (
    <>
      {teams.map((team, t) =>
        team.map((p, i) => (
          <PlayerSprite key={p.player_id} name={p.name} level={p.level} xy={A.xy[t][i]} swing={A.swing[t][i]} facing={t === 0 ? 1 : -1} icon={icon} phase={t * 2 + i} nameW={clamp(sw * 0.22, 64, 96)} />
        ))
      )}
      {/* ground shadow drifts away from the shuttle as it rises */}
      <Animated.View pointerEvents="none" style={[dotStyle, { backgroundColor: 'rgba(0,0,0,0.28)', transform: [{ translateX: shadowX }, { translateY: shadowY }] }]} />
      <Animated.View pointerEvents="none" style={[dotStyle, { backgroundColor: '#fff', opacity: 0.15, transform: [{ translateX: A.g2.x }, { translateY: A.g2.y }, { scale: A.scale }] }]} />
      <Animated.View pointerEvents="none" style={[dotStyle, { backgroundColor: '#fff', opacity: 0.35, transform: [{ translateX: A.g1.x }, { translateY: A.g1.y }, { scale: A.scale }] }]} />
      <Animated.View pointerEvents="none" style={[dotStyle, styles.shuttle, { transform: [{ translateX: A.sxy.x }, { translateY: A.sxy.y }, { scale: A.scale }] }]}>
        <View style={{ width: dot * 0.4, height: dot * 0.4, borderRadius: dot, backgroundColor: '#cfcfcf' }} />
      </Animated.View>
    </>
  );
}

function PlayerSprite({ name, level, xy, swing, facing, icon, phase, nameW }: {
  name: string; level: Level; xy: Animated.ValueXY; swing: Animated.Value; facing: 1 | -1; icon: number; phase: number;
  /** Max width of the name label; long names wrap inside it. */
  nameW: number;
}) {
  const ready = useLoop(280 + phase * 35); // little ready bounce
  const bob = ready.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] });
  const rot = swing.interpolate({ inputRange: [0, 1], outputRange: [`${-35 * facing}deg`, `${75 * facing}deg`] });
  const W = nameW;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -W / 2, top: -icon * 0.6, width: W, alignItems: 'center', transform: [{ translateX: xy.x }, { translateY: xy.y }] }}>
      <Animated.View style={{ flexDirection: facing === 1 ? 'row' : 'row-reverse', alignItems: 'center', transform: [{ translateY: bob }] }}>
        <View style={{ width: icon * 0.5 }} />
        <Person size={icon} color={levelColor(level, false).dot} outline />
        {/* 2× tall wrapper so the racket pivots at the hand */}
        <Animated.View style={{ width: icon * 0.5, height: icon * 2, marginVertical: -icon / 2, alignItems: 'center', transform: [{ rotate: rot }] }}>
          <View style={{ width: icon * 0.42, height: icon * 0.52, borderRadius: icon, borderWidth: 1.5, borderColor: '#fff' }} />
          <View style={{ width: 1.5, height: icon * 0.48, backgroundColor: '#fff' }} />
        </Animated.View>
      </Animated.View>
      <Text style={[styles.playerName, { fontSize: clamp(icon * 0.36, 9, 11), lineHeight: clamp(icon * 0.36, 9, 11) + 2 }]}>{name}</Text>
    </Animated.View>
  );
}

// ================================================================ shared match data
export type Member = { player_id: number; name: string; level: Level; note?: string };
/** A match ready to draw: player ids already turned into names + levels. */
export type MatchView = {
  id: number;
  round: number;
  stage: Stage;
  queueNo: number | null;
  team1: Member[];
  team2: Member[];
  winner: 1 | 2 | null;
  mixed: boolean; // breaks the level rules (manual swap) → warning badge
  manual: boolean; // built by hand in Build a match
};

const GOLD = '#f5c518';
const GRAY = '#9aa0a6';

// ================================================================ team brackets
/**
 * Court teams, side by side: [Team A: P1 & P2] | VS | [Team B: P3 & P4]. Names wrap, never cut off.
 */
export function TeamBrackets({ C, match, where, onTeamPress }: {
  C: Palette; match: MatchView; where: 'court' | 'card'; onTeamPress?: (team: 1 | 2) => void;
}) {
  const { editMode } = useSwap();
  if (where === 'card') return <StackedBrackets C={C} match={match} />;
  const finished = match.stage === 'finished';
  const warm = match.stage === 'queued';
  const tappable = !!onTeamPress && !editMode && match.stage === 'playing';

  const bracket = (team: 1 | 2) => {
    const members = team === 1 ? match.team1 : match.team2;
    const color = team === 1 ? C.accent : C.amber;
    const won = finished && match.winner === team;
    const lost = finished && match.winner !== team;
    const edge = won ? GOLD : lost ? GRAY : color;
    const content = (
      <View
        style={[
          styles.bracket,
          { borderColor: `${edge}88`, backgroundColor: won ? `${GOLD}22` : C.card2 },
          team === 1 ? { borderLeftWidth: 5, borderLeftColor: edge } : { borderRightWidth: 5, borderRightColor: edge },
          lost && { opacity: 0.6 },
        ]}
      >
        <Text style={[styles.bracketLabel, { color: won ? (C.dark ? GOLD : '#9a7400') : lost ? C.muted : color }]}>
          Team {team === 1 ? 'A' : 'B'}{lost ? ' · lost' : won ? ' · won' : ''}
        </Text>
        <View style={styles.stackChips}>
          {members.map((p, index) => (
            <PlayerChip
              key={`${team}-${index}`}
              slot={{ kind: 'match', matchId: match.id, team, index, playerId: p.player_id }}
              player={p}
              look="compact"
              droppable
              disabled={finished}
              warmDelay={warm ? (team - 1) * 2 * 180 + index * 180 : undefined}
            />
          ))}
        </View>
      </View>
    );
    if (!tappable) return <View style={styles.bracketWrap}>{content}</View>;
    return (
      <Pressable
        style={({ pressed }) => [styles.bracketWrap, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
        onPress={() => onTeamPress?.(team)}
        accessibilityLabel={`Team ${team === 1 ? 'A' : 'B'} won`}
      >
        {content}
      </Pressable>
    );
  };

  return (
    <View style={styles.brackets}>
      {bracket(1)}
      <View style={styles.vsBox}>
        <View style={[styles.vsLine, { backgroundColor: C.line }]} />
        <Text style={[styles.vs, { color: C.muted }]}>VS</Text>
        <View style={[styles.vsLine, { backgroundColor: C.line }]} />
      </View>
      {bracket(2)}
    </View>
  );
}

/**
 * Proposed / queue cards (and Build a match):
 *   Player 1 ─┐
 *             ├─ (A) ─┐
 *   Player 2 ─┘       │
 *                    VS
 *   Player 1 ─┐       │
 *             ├─ (B) ─┘
 *   Player 2 ─┘
 */
function BracketStack({ C, seats, center }: { C: Palette; seats: (team: 1 | 2) => ReactNode; center?: ReactNode }) {
  const joinColor = `${C.muted}88`;
  const team = (t: 1 | 2) => {
    const color = t === 1 ? C.accent : C.amber;
    return (
      <View style={styles.stackRow}>
        <View style={styles.stackChips}>{seats(t)}</View>
        {/* ┐ ├ ┘ joining this team's two players */}
        <View style={styles.stackBracket}>
          <View style={[styles.stackBracketLine, { borderColor: color }]} />
        </View>
        {/* team letter, plus the line running to the other team */}
        <View style={styles.stackJoin}>
          <View style={[styles.joinLine, { backgroundColor: joinColor }, t === 1 ? { top: '50%', bottom: 0 } : { top: 0, bottom: '50%' }]} />
          <View style={[styles.joinStub, { backgroundColor: color }]} />
          <View style={[styles.teamDot, { backgroundColor: color }]}>
            <Text style={styles.teamDotText}>{t === 1 ? 'A' : 'B'}</Text>
          </View>
        </View>
      </View>
    );
  };
  return (
    <View>
      {team(1)}
      <View style={styles.stackVsRow}>
        <View style={styles.stackCenter}>{center}</View>
        <Text style={[styles.vs, { color: C.muted }]}>VS</Text>
        <View style={[styles.stackJoin, { alignSelf: 'stretch' }]}>
          <View style={[styles.joinLine, { backgroundColor: joinColor, top: 0, bottom: 0 }]} />
        </View>
      </View>
      {team(2)}
    </View>
  );
}

function StackedBrackets({ C, match }: { C: Palette; match: MatchView }) {
  const warm = match.stage === 'queued';
  return (
    <BracketStack
      C={C}
      seats={(t) => (t === 1 ? match.team1 : match.team2).map((p, index) => (
        <PlayerChip
          key={`${t}-${index}`}
          slot={{ kind: 'match', matchId: match.id, team: t, index, playerId: p.player_id }}
          player={p}
          note={p.note}
          look="wide"
          draggable
          droppable
          warmDelay={warm ? (t - 1) * 2 * 180 + index * 180 : undefined}
        />
      ))}
    />
  );
}

// ================================================================ build a match
export type DraftSeats = { team1: (Member | null)[]; team2: (Member | null)[] };

/**
 * Build a match by hand: drag waiting players onto the empty seats, or tap a
 * seat to search by name. "Create match" turns it into a proposed match.
 */
export function DraftCard({ C, seats, seatCount, mixed, onPickSeat, onRemove, onCreate, onClear, onRandom, canRandom }: {
  C: Palette; seats: DraftSeats; seatCount: number; mixed: boolean;
  onPickSeat: (team: 1 | 2, index: number) => void;
  onRemove: (team: 1 | 2, index: number) => void;
  onCreate: () => void;
  onClear: () => void;
  /** Dice: fill empty seats at random (fair levels, longest waiting first). */
  onRandom: () => void;
  canRandom: boolean;
}) {
  const used = (t: 1 | 2) => (t === 1 ? seats.team1 : seats.team2).slice(0, seatCount);
  const filled = [...used(1), ...used(2)].filter(Boolean).length;
  const total = seatCount * 2;
  return (
    <Glass style={styles.matchCard}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Build a match</Text>
          <Text style={[styles.cardSub, { color: C.muted }]}>
            Drag waiting players onto a seat, or tap a seat to search by name. Press and hold a chosen player to drag them to another seat or swap them with someone in a match. {filled}/{total} chosen.
          </Text>
        </View>
      </View>
      {mixed ? <View style={{ flexDirection: 'row' }}><MixedBadge /></View> : null}
      <BracketStack
        C={C}
        center={
          <Pressable
            onPress={onRandom}
            disabled={!canRandom}
            accessibilityLabel={filled === total ? 'Roll again: pick new random players' : 'Fill empty seats with random players'}
            style={({ pressed }) => [
              styles.diceBtn,
              { backgroundColor: C.card, borderColor: C.glassBorder },
              pressed && { opacity: 0.7, transform: [{ rotate: '-12deg' }, { scale: 0.95 }] },
              !canRandom && { opacity: 0.45 },
            ]}
          >
            <DiceIcon color={C.accent} pip="#fff" size={20} />
            <Text style={[styles.diceText, { color: C.accent }]}>{filled === total ? 'Roll again' : 'Random'}</Text>
          </Pressable>
        }
        seats={(t) => used(t).map((p, index) => {
          const color = t === 1 ? C.accent : C.amber;
          const slot = { kind: 'draft' as const, team: t, index, playerId: p?.player_id ?? null };
          if (!p) {
            return <DropSeat key={`${t}-${index}`} slot={slot} color={color} label={`Empty seat · tap to choose`} onPress={() => onPickSeat(t, index)} />;
          }
          return (
            <View key={`${t}-${index}`} style={styles.draftFilled}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <PlayerChip
                  slot={{ ...slot, playerId: p.player_id }}
                  player={p}
                  note={p.note}
                  look="wide"
                  draggable
                  droppable
                  onPress={() => onPickSeat(t, index)}
                />
              </View>
              <Pressable
                onPress={() => onRemove(t, index)}
                hitSlop={8}
                accessibilityLabel={`Remove ${p.name}`}
                style={({ pressed }) => [styles.removeBtn, { borderColor: C.line, backgroundColor: C.card }, pressed && { opacity: 0.6 }]}
              >
                <View style={[styles.removeBar, { backgroundColor: C.muted, transform: [{ rotate: '45deg' }] }]} />
                <View style={[styles.removeBar, { backgroundColor: C.muted, transform: [{ rotate: '-45deg' }] }]} />
              </Pressable>
            </View>
          );
        })}
      />
      <View style={styles.draftActions}>
        <Button title="Clear" variant="secondary" onPress={onClear} disabled={filled === 0} />
        <Button title="Create match" onPress={onCreate} disabled={filled < total} />
      </View>
    </Glass>
  );
}

function MixedBadge() {
  return <Badge text="! Mixed levels" tone="warning" />;
}

// ================================================================ celebration
// Plays for a few seconds after "Yes" on the winner popup:
//   flash -> spinning golden rays + trophy pops in -> "WINNERS!" springs up ->
//   confetti cannon from the winners + falling confetti + fireworks + sparkles,
//   winners jump with arms up, losers slump in gray.
const GOLD_LIGHT = '#ffe680';
const GOLD_DEEP = '#b8860b';

/** 0 -> 1 once, after `delay`. */
function useOnce(delay: number, duration: number, easing: Ease = Easing.out(Easing.cubic)) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = tm(v, 1, duration, easing, delay);
    a.start();
    return () => a.stop();
    // runs once on mount (easing is a new function every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return v;
}

/** Little person: happy (gold, arms up) or sad (gray). */
function Figure({ size, color, mood }: { size: number; color: string; mood: 'happy' | 'sad' }) {
  const head = size * 0.62;
  const eye = Math.max(3, head * 0.13);
  const mouthW = head * 0.42;
  const mouthH = head * 0.2;
  const ink = mood === 'happy' ? '#3a2d00' : '#444';
  const arm = { position: 'absolute' as const, top: head * 0.72, width: size * 0.14, height: size * 0.5, borderRadius: size, backgroundColor: color, borderWidth: 1.5, borderColor: '#fff' };
  return (
    <View style={{ alignItems: 'center', width: size }}>
      {mood === 'happy' ? (
        <>
          <View style={[arm, { left: size * 0.02, transform: [{ rotate: '-32deg' }, { translateY: -size * 0.22 }] }]} />
          <View style={[arm, { right: size * 0.02, transform: [{ rotate: '32deg' }, { translateY: -size * 0.22 }] }]} />
        </>
      ) : null}
      <View style={{ width: head, height: head, borderRadius: head, backgroundColor: color, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', gap: head * 0.2 }}>
          <View style={{ width: eye, height: eye, borderRadius: eye, backgroundColor: ink }} />
          <View style={{ width: eye, height: eye, borderRadius: eye, backgroundColor: ink }} />
        </View>
        <View
          style={[
            { width: mouthW, height: mouthH, marginTop: head * 0.08, borderColor: ink },
            mood === 'happy'
              ? { borderBottomWidth: 2, borderBottomLeftRadius: mouthW, borderBottomRightRadius: mouthW }
              : { borderTopWidth: 2, borderTopLeftRadius: mouthW, borderTopRightRadius: mouthW, marginTop: head * 0.14 },
          ]}
        />
      </View>
      <View style={{ width: size * 0.8, height: size * 0.42, marginTop: 2, borderTopLeftRadius: size, borderTopRightRadius: size, backgroundColor: color, borderWidth: 2, borderColor: '#fff' }} />
    </View>
  );
}

/** Jumps with a squash on landing and a stretch in the air. */
function Jumping({ children, delay }: { children: ReactNode; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([tm(t, 1, 280, Easing.out(Easing.quad)), tm(t, 0, 280, Easing.in(Easing.quad))]));
    const id = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(id); loop.stop(); };
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
          { scaleY: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.86, 1.06, 1] }) },
          { scaleX: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [1.12, 0.96, 1] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '5deg'] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Trophy cup drawn with shapes. */
function Trophy({ size }: { size: number }) {
  const cupW = size * 0.72;
  const cupH = size * 0.6;
  const line = Math.max(2, size * 0.08);
  const handle = { width: size * 0.26, height: size * 0.32, marginTop: size * 0.05, borderWidth: line, borderColor: GOLD };
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={[handle, { marginRight: -line, borderRightWidth: 0, borderTopLeftRadius: size, borderBottomLeftRadius: size }]} />
        <View style={{ width: cupW, height: cupH, backgroundColor: GOLD, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomLeftRadius: cupW * 0.5, borderBottomRightRadius: cupW * 0.5, borderWidth: 1.5, borderColor: GOLD_DEEP, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: cupW * 0.16, top: 3, width: cupW * 0.12, height: cupH * 0.62, borderRadius: 4, backgroundColor: GOLD_LIGHT }} />
        </View>
        <View style={[handle, { marginLeft: -line, borderLeftWidth: 0, borderTopRightRadius: size, borderBottomRightRadius: size }]} />
      </View>
      <View style={{ width: size * 0.12, height: size * 0.16, backgroundColor: GOLD_DEEP }} />
      <View style={{ width: size * 0.52, height: size * 0.13, borderRadius: 3, backgroundColor: GOLD, borderWidth: 1, borderColor: GOLD_DEEP }} />
    </View>
  );
}

/** Slowly spinning golden rays behind the trophy. */
function Sunburst({ size }: { size: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  const appear = useOnce(0, 600);
  useEffect(() => {
    const loop = Animated.loop(tm(spin, 1, 9000, Easing.linear));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rays = 14;
  const half = size / 2;
  const side = size * 0.06;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width: size, height: size,
        opacity: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
        transform: [
          { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
          { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        ],
      }}
    >
      {Array.from({ length: rays }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute', left: half - side, top: 0, width: 0, height: 0,
            borderLeftWidth: side, borderRightWidth: side, borderTopWidth: half,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: i % 2 ? GOLD_LIGHT : GOLD,
            transform: [{ translateY: half / 2 }, { rotate: `${(360 / rays) * i}deg` }, { translateY: -half / 2 }],
          }}
        />
      ))}
    </Animated.View>
  );
}

/** Four-point twinkle. */
function Sparkle({ left, top, size, delay }: { left: `${number}%`; top: `${number}%`; size: number; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay), tm(t, 1, 360, Easing.out(Easing.quad)), tm(t, 0, 420, Easing.in(Easing.quad)), Animated.delay(260),
    ]));
    loop.start();
    return () => loop.stop();
  }, [t, delay]);
  const bar = { position: 'absolute' as const, backgroundColor: '#fff8d6', borderRadius: size };
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left, top, width: size, height: size, opacity: t,
        transform: [
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
        ],
      }}
    >
      <View style={[bar, { left: size * 0.42, top: 0, width: size * 0.16, height: size }]} />
      <View style={[bar, { top: size * 0.42, left: 0, height: size * 0.16, width: size }]} />
    </Animated.View>
  );
}

/** A ring of sparks that bursts out and fades, then repeats. */
function Firework({ left, top, color, delay, radius }: { left: `${number}%`; top: `${number}%`; color: string; delay: number; radius: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay), tm(t, 1, 950, Easing.out(Easing.cubic)), tm(t, 0, 0), Animated.delay(450),
    ]));
    loop.start();
    return () => loop.stop();
  }, [t, delay]);
  const N = 12;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top }}>
      {Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: -2.5, top: -2.5, width: 5, height: 5, borderRadius: 3,
              backgroundColor: i % 3 === 0 ? '#ffffff' : color,
              opacity: t.interpolate({ inputRange: [0, 0.08, 0.65, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * radius] }) },
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * radius + 8] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const CONFETTI = ['#f5c518', '#ff6b6b', '#4dabf7', '#51cf66', '#cc5de8', '#ffa94d', '#ffffff'];

/** Confetti gently falling from the top. */
function Confetti({ width, height }: { width: number; height: number }) {
  const pieces = useRef(
    Array.from({ length: 22 }, (_, i) => ({
      v: new Animated.Value(0),
      x: Math.random(),
      drift: rand(-30, 30),
      spin: rand(180, 720) * (Math.random() < 0.5 ? -1 : 1),
      delay: rand(300, 1200),
      dur: rand(1600, 2500),
      color: CONFETTI[i % CONFETTI.length],
      w: rand(5, 9),
      h: rand(8, 13),
    }))
  ).current;
  useEffect(() => {
    const anims = pieces.map((p) =>
      Animated.loop(Animated.sequence([Animated.delay(p.delay), tm(p.v, 1, p.dur, Easing.linear), tm(p.v, 0, 0)]))
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [pieces]);
  if (!width || !height) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', left: p.x * width, top: -16, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.color,
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, height + 32] }) },
              { translateX: p.v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.drift, 0] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** One big confetti blast shot up from under the winners. */
function ConfettiBurst({ width, height, originX }: { width: number; height: number; originX: number }) {
  const pieces = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      v: new Animated.Value(0),
      vx: rand(-0.42, 0.42),
      up: rand(0.55, 1),
      dur: rand(1500, 2300),
      delay: rand(0, 140),
      spin: rand(360, 1000) * (Math.random() < 0.5 ? -1 : 1),
      color: CONFETTI[i % CONFETTI.length],
      w: rand(5, 8),
      h: rand(8, 12),
    }))
  ).current;
  useEffect(() => {
    const a = Animated.parallel(pieces.map((p) => tm(p.v, 1, p.dur, Easing.linear, p.delay)));
    a.start();
    return () => a.stop();
  }, [pieces]);
  if (!width || !height) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const peak = p.up * height;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: originX * width - p.w / 2, top: height - 6, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.color,
              opacity: p.v.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.vx * width] }) },
                // fast up, hang at the top, then fall: a cheap parabola
                { translateY: p.v.interpolate({ inputRange: [0, 0.22, 0.42, 1], outputRange: [0, -peak * 0.82, -peak, -peak + height * 1.1] }) },
                { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

/** Shown on the court after "Yes": golden, jumping winners with a trophy and confetti; gray, slumped losers. */
function Celebration({ match, minHeight }: { match: MatchView; minHeight: number }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const winner = match.winner ?? 1;
  const flash = useOnce(0, 500, Easing.out(Easing.quad));
  const trophyPop = useRef(new Animated.Value(0)).current;
  const titlePop = useRef(new Animated.Value(0)).current;
  const pulse = useLoop(650);
  const slump = useOnce(250, 700);
  const plusOne = useOnce(700, 1300);
  useEffect(() => {
    const a = Animated.stagger(160, [
      Animated.spring(trophyPop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: ND }),
      Animated.spring(titlePop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: ND }),
    ]);
    a.start();
    return () => a.stop();
  }, [trophyPop, titlePop]);

  const burst = clamp(size.h * 1.5, 160, 340);
  const side = (team: 1 | 2) => {
    const members = team === 1 ? match.team1 : match.team2;
    const won = team === winner;
    if (won) {
      return (
        <View style={[styles.celebSide, styles.celebWin]}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
            <Sunburst size={burst} />
          </View>
          <Animated.View style={{ transform: [{ scale: trophyPop }, { rotate: trophyPop.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) }] }}>
            <Trophy size={30} />
          </Animated.View>
          <Animated.Text
            style={[
              styles.celebTitle, styles.celebWinTitle,
              { transform: [{ scale: Animated.multiply(titlePop, pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] })) }] },
            ]}
          >
            WINNERS!
          </Animated.Text>
          <View style={styles.celebPeople}>
            {members.map((p, i) => (
              <View key={p.player_id} style={styles.celebPerson}>
                <Jumping delay={i * 140}>
                  <Figure size={34} color={GOLD} mood="happy" />
                </Jumping>
                <Animated.View style={[styles.namePill, { transform: [{ scale: titlePop }] }]}>
                  <Text style={styles.namePillText}>{p.name}</Text>
                </Animated.View>
              </View>
            ))}
          </View>
          <Animated.Text
            style={[
              styles.plusOne,
              {
                opacity: plusOne.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: plusOne.interpolate({ inputRange: [0, 1], outputRange: [8, -18] }) }],
              },
            ]}
          >
            +1 win
          </Animated.Text>
          <Sparkle left="8%" top="10%" size={14} delay={200} />
          <Sparkle left="82%" top="18%" size={11} delay={650} />
          <Sparkle left="14%" top="62%" size={10} delay={1000} />
          <Sparkle left="78%" top="66%" size={13} delay={400} />
        </View>
      );
    }
    return (
      <View style={[styles.celebSide, styles.celebLose]}>
        <Text style={[styles.celebTitle, { color: '#d7dbe0' }]}>Good game</Text>
        <View style={styles.celebPeople}>
          {members.map((p, i) => (
            <View key={p.player_id} style={styles.celebPerson}>
              <Animated.View
                style={{
                  opacity: slump.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }),
                  transform: [
                    { translateY: slump.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }) },
                    { rotate: slump.interpolate({ inputRange: [0, 1], outputRange: ['0deg', i === 0 ? '-10deg' : '10deg'] }) },
                  ],
                }}
              >
                <Figure size={30} color={GRAY} mood="sad" />
              </Animated.View>
              <Text style={[styles.celebName, { color: '#d7dbe0' }]}>{p.name}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // Winners' side centre, for the confetti cannon (sides are 1.35 : 1 wide).
  const winShare = 1.35 / 2.35;
  const originX = winner === 1 ? winShare / 2 : 1 - winShare / 2;
  return (
    <View
      style={[styles.celebration, { minHeight }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {side(1)}
      <View style={styles.celebNet} />
      {side(2)}
      <Firework left={winner === 1 ? '18%' : '62%'} top="22%" color={GOLD} delay={350} radius={34} />
      <Firework left={winner === 1 ? '44%' : '86%'} top="30%" color="#ff6b6b" delay={900} radius={28} />
      <Firework left={winner === 1 ? '30%' : '74%'} top="14%" color="#4dabf7" delay={1450} radius={30} />
      <Confetti width={size.w} height={size.h} />
      <ConfettiBurst width={size.w} height={size.h} originX={originX} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }) }]} />
    </View>
  );
}

// ================================================================ court card
export type CourtItem = { key: number; name: string; match?: MatchView };

const CARD_PAD = 16;

function CourtCard({ C, item, width, onTeamPress }: {
  C: Palette; item: CourtItem; width: number; onTeamPress: (m: MatchView, team: 1 | 2) => void;
}) {
  const { editMode } = useSwap();
  const m = item.match;
  const sw = Math.floor(width - CARD_PAD * 2 - PAD * 2);
  const sh = Math.floor(sw / RATIO);
  const singles = m ? m.team1.length === 1 && m.team2.length === 1 : false;
  const finished = m?.stage === 'finished';
  const rally = m ? { match_id: m.id, team1: m.team1, team2: m.team2 } : null;

  return (
    <Glass style={[styles.card, { width }]}>
      <View style={styles.cardHeader}>
        {m && !finished ? <EditButton /> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.text }]}>{item.name}</Text>
          <Text style={[styles.cardSub, { color: C.muted }]}>
            {m ? `${singles ? 'Singles' : 'Doubles'}${m.queueNo ? ` · Queue ${m.queueNo}` : ''} · Round ${m.round}` : 'Available'}
          </Text>
        </View>
        {m && (
          <View style={styles.status}>
            <View style={[styles.statusDot, { backgroundColor: finished ? GOLD : C.green }]} />
            <Text style={[styles.statusText, { color: C.text }]}>{finished ? 'Game over' : 'Playing'}</Text>
          </View>
        )}
      </View>
      {m?.mixed ? <View style={{ flexDirection: 'row' }}><MixedBadge /></View> : null}

      {sw > 0 && (
        <View style={styles.floor}>
          {finished && m ? (
            <Celebration match={m} minHeight={sh} />
          ) : (
            <View style={{ width: sw, height: sh, backgroundColor: SURFACE, opacity: m ? 1 : 0.55 }}>
              <CourtLines sw={sw} sh={sh} o="h" />
              {rally && <RallyCourt key={`${rally.match_id}-${sw}`} match={rally} sw={sw} sh={sh} o="h" />}
            </View>
          )}
        </View>
      )}

      {m && (
        <View style={{ gap: 8 }}>
          <TeamBrackets C={C} match={m} where="court" onTeamPress={(t) => onTeamPress(m, t)} />
          {!finished ? (
            <Text style={[styles.hint, { color: editMode ? C.accent : C.muted }]}>
              {editMode ? 'Edit mode: tap two players to swap them. Results are off.' : 'Tap the team that won.'}
            </Text>
          ) : null}
        </View>
      )}
    </Glass>
  );
}

export function CourtGrid({ C, items, onTeamPress }: { C: Palette; items: CourtItem[]; onTeamPress: (m: MatchView, team: 1 | 2) => void }) {
  const [w, setW] = useState(0);
  // As many courts side by side as fit (each at least ~330px wide, up to 3).
  const cols = Math.max(1, Math.min(items.length, Math.floor((w + GAP) / (330 + GAP)), 3));
  const cardW = Math.floor((w - (cols - 1) * GAP) / cols);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {items.length === 0 ? (
        <List><EmptyText>No courts set up yet. Add one in Settings.</EmptyText></List>
      ) : w > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {items.map((it) => <CourtCard key={it.key} C={C} item={it} width={cardW} onTeamPress={onTeamPress} />)}
        </View>
      ) : null}
    </View>
  );
}

// ================================================================ proposed + queued cards
/** Racket that swings back and forth (warm-up). Drawn like the rackets on court. */
function SwingingRacket({ color }: { color: string }) {
  const t = useLoop(380);
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['-35deg', '35deg'] });
  // Twice as tall as it looks, so it pivots at the handle end.
  return (
    <Animated.View style={{ width: 14, height: 40, marginVertical: -10, alignItems: 'center', transform: [{ rotate }] }}>
      <View style={{ width: 11, height: 13, borderRadius: 7, borderWidth: 2, borderColor: color }} />
      <View style={{ width: 2, height: 9, backgroundColor: color }} />
    </Animated.View>
  );
}

export function MatchCard({ C, match, onReady }: { C: Palette; match: MatchView; onReady?: () => void }) {
  const queued = match.stage === 'queued';
  return (
    <Glass style={styles.matchCard}>
      <View style={styles.cardHeader}>
        <EditButton />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.text }]}>{queued ? `Queue ${match.queueNo}` : match.manual ? 'Your match' : 'Proposed match'}</Text>
          <Text style={[styles.cardSub, { color: C.muted }]}>Round {match.round}</Text>
        </View>
        {queued ? (
          <View style={styles.warm}>
            <WarmupPerson size={16} color={C.accent} delay={0} />
            <SwingingRacket color={C.accent} />
            <Text style={[styles.warmText, { color: C.accent }]}>Warming up...</Text>
          </View>
        ) : (
          <Button title="Ready" onPress={onReady} />
        )}
      </View>
      {match.mixed ? <View style={{ flexDirection: 'row' }}><MixedBadge /></View> : null}
      <TeamBrackets C={C} match={match} where="card" />
    </Glass>
  );
}

// ================================================================ waiting list
export type WaitingItem = Member & { games: number; priority: boolean; waitingSince: number };

/** Everyone not in a match, grouped by level. Press and hold a player to drag them into a match. */
export function WaitingPool({ C, players }: { C: Palette; players: WaitingItem[] }) {
  if (players.length === 0) return <List><EmptyText>Nobody is waiting.</EmptyText></List>;
  return (
    <Grid min={300}>
      {LEVELS.filter((l) => players.some((p) => p.level === l)).map((level) => {
        const group = players.filter((p) => p.level === level);
        return (
          <Glass key={level} style={styles.poolGroup}>
            <View style={styles.poolHead}>
              <LevelBadge level={level} />
              <Text style={[styles.cardSub, { color: C.muted, marginTop: 0 }]}>{group.length} waiting</Text>
            </View>
            <View style={styles.chips}>
              {group.map((p) => (
                <PlayerChip
                  key={p.player_id}
                  slot={{ kind: 'pool', playerId: p.player_id }}
                  player={p}
                  note={[
                    `${p.games} ${p.games === 1 ? 'game' : 'games'}`,
                    p.priority ? 'Priority' : '',
                  ].filter(Boolean).join(' · ')}
                  draggable
                />
              ))}
            </View>
          </Glass>
        );
      })}
    </Grid>
  );
}

const styles = StyleSheet.create({
  // court drawing
  floor: { backgroundColor: FLOOR, borderRadius: 12, padding: PAD },
  line: { position: 'absolute', backgroundColor: '#fff' },
  net: { position: 'absolute', justifyContent: 'space-between' },
  netDash: { flex: 1, backgroundColor: '#f5f5f5' },
  post: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#333' },
  playerName: {
    marginTop: 2, maxWidth: '100%', fontWeight: '700', color: '#fff', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden',
  },
  shuttle: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 3 },

  // celebration
  celebration: { flexDirection: 'row', backgroundColor: SURFACE, borderWidth: 2, borderColor: '#fff', overflow: 'hidden' },
  celebSide: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 10 },
  celebWin: { flex: 1.35, backgroundColor: 'rgba(255,215,0,0.14)' },
  celebLose: { flex: 1, backgroundColor: 'rgba(0,0,0,0.22)' },
  celebWinTitle: { color: GOLD, fontSize: 18, fontWeight: '900', letterSpacing: 1.5, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  center: { alignItems: 'center', justifyContent: 'center' },
  namePill: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#fff6cc' },
  namePillText: { color: '#3a2d00', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  plusOne: { color: '#fff6cc', fontSize: 13, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  celebTitle: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  celebPeople: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  celebPerson: { alignItems: 'center', flexBasis: 60, flexGrow: 1, maxWidth: 140, gap: 2 },
  celebName: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  celebNet: { width: 3, backgroundColor: '#f5f5f5', opacity: 0.8 },

  // cards
  card: { padding: CARD_PAD, gap: 14 },
  matchCard: { padding: 14, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSub: { fontSize: 13, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 13, textAlign: 'center' },
  warm: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  warmText: { fontSize: 13, fontWeight: '700' },

  // brackets
  brackets: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  bracketWrap: { flex: 1, minWidth: 0 },
  bracket: { flexGrow: 1, borderWidth: 1.5, borderRadius: 14, padding: 8, gap: 6 },
  bracketLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  vsBox: { width: 26, alignItems: 'center', gap: 6 },
  vsLine: { flex: 1, width: StyleSheet.hairlineWidth * 2 },
  vs: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  // stacked brackets (proposed / queue cards)
  stackRow: { flexDirection: 'row', alignItems: 'stretch' },
  stackChips: { flex: 1, minWidth: 0, gap: 6 },
  stackBracket: { width: 14 },
  stackBracketLine: {
    position: 'absolute', left: 0, right: 0, top: '25%', bottom: '25%',
    borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderTopRightRadius: 8, borderBottomRightRadius: 8,
  },
  stackJoin: { width: 40, alignItems: 'center', justifyContent: 'center' },
  joinLine: { position: 'absolute', left: 19, width: 2 },
  joinStub: { position: 'absolute', left: 0, width: 10, top: '50%', height: 2, marginTop: -1 },
  teamDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  teamDotText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  draftFilled: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  removeBar: { position: 'absolute', width: 14, height: 2, borderRadius: 1 },
  draftActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  stackCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  diceBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 18, paddingVertical: 6, paddingHorizontal: 12 },
  diceText: { fontSize: 14, fontWeight: '700' },
  stackVsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minHeight: 30 },

  // waiting list
  poolGroup: { padding: 12, gap: 10 },
  poolHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
