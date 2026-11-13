import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import type { ActiveMatch, Level, WaitingPlayer } from '../db/db';
import { levelColor, type Palette } from '../theme';
import { Avatar, EmptyText, Glass, List, ListRow, Section } from './ui/kit';

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

function RallyCourt({ match, sw, sh, o }: { match: ActiveMatch; sw: number; sh: number; o: Orient }) {
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
          <PlayerSprite key={p.player_id} name={p.name} level={p.level} xy={A.xy[t][i]} swing={A.swing[t][i]} facing={t === 0 ? 1 : -1} icon={icon} phase={t * 2 + i} />
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

function PlayerSprite({ name, level, xy, swing, facing, icon, phase }: {
  name: string; level: Level; xy: Animated.ValueXY; swing: Animated.Value; facing: 1 | -1; icon: number; phase: number;
}) {
  const ready = useLoop(280 + phase * 35); // little ready bounce
  const bob = ready.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] });
  const rot = swing.interpolate({ inputRange: [0, 1], outputRange: [`${-35 * facing}deg`, `${75 * facing}deg`] });
  const W = 110;
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
      <Text style={[styles.playerName, { fontSize: clamp(icon * 0.45, 10, 13) }]} numberOfLines={1}>{name}</Text>
    </Animated.View>
  );
}

// ================================================================ court card
export type CourtItem = { key: number; name: string; match?: ActiveMatch; timer: string; over: boolean };

const CARD_PAD = 16;

function CourtCard({ C, item, width }: { C: Palette; item: CourtItem; width: number }) {
  const m = item.match;
  const sw = Math.floor(width - CARD_PAD * 2 - PAD * 2);
  const sh = Math.floor(sw / RATIO);
  const singles = m ? m.team1.length === 1 && m.team2.length === 1 : false;
  const names = (t: { name: string }[]) => t.map((p) => p.name).join(' & ');

  return (
    <Glass style={[styles.card, { width }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.cardSub, { color: C.muted }]}>{m ? (singles ? 'Singles' : 'Doubles') : 'Available'}</Text>
        </View>
        {m && (
          <View style={styles.status}>
            <View style={[styles.statusDot, { backgroundColor: item.over ? C.red : C.green }]} />
            <Text style={[styles.statusText, { color: item.over ? C.red : C.text }]}>
              {item.over ? `Over time · ${item.timer}` : item.timer}
            </Text>
          </View>
        )}
      </View>

      {sw > 0 && (
        <View style={styles.floor}>
          <View style={{ width: sw, height: sh, backgroundColor: SURFACE, opacity: m ? 1 : 0.55 }}>
            <CourtLines sw={sw} sh={sh} o="h" />
            {m && <RallyCourt key={`${m.match_id}-${sw}`} match={m} sw={sw} sh={sh} o="h" />}
          </View>
        </View>
      )}

      {m && (
        <View style={[styles.teams, { borderTopColor: C.line }]}>
          <Text style={[styles.team, { color: C.text }]} numberOfLines={2}>{names(m.team1)}</Text>
          <Text style={[styles.vs, { color: C.muted }]}>vs</Text>
          <Text style={[styles.team, { color: C.text, textAlign: 'right' }]} numberOfLines={2}>{names(m.team2)}</Text>
        </View>
      )}
    </Glass>
  );
}

export function CourtGrid({ C, items }: { C: Palette; items: CourtItem[] }) {
  const [w, setW] = useState(0);
  const cols = w >= 1000 && items.length > 1 ? 2 : 1;
  const cardW = Math.floor((w - (cols - 1) * GAP) / cols);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {items.length === 0 ? (
        <List><EmptyText>No courts set up yet.</EmptyText></List>
      ) : w > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {items.map((it) => <CourtCard key={it.key} C={C} item={it} width={cardW} />)}
        </View>
      ) : null}
    </View>
  );
}

// ================================================================ lists
function WarmupAvatar({ C, level, delay }: { C: Palette; level: Level; delay: number }) {
  const c = levelColor(level, C.dark);
  return (
    <View style={[styles.avatar, { backgroundColor: c.bg, borderWidth: 1.5, borderColor: c.dot }]}>
      <WarmupPerson size={17} color={c.text} delay={delay} />
    </View>
  );
}

export function NextUpList({ C, players, partnerName }: { C: Palette; players: WaitingPlayer[]; partnerName: (id: number) => string | undefined }) {
  return (
    <Section title="Next up">
      <List>
        {players.length === 0 ? (
          <EmptyText>Waiting for enough players.</EmptyText>
        ) : (
          players.map((p, i) => {
            const mate = partnerName(p.player_id);
            return (
              <ListRow
                key={p.player_id}
                last={i === players.length - 1}
                leading={<WarmupAvatar C={C} level={p.level} delay={i * 380} />}
                title={p.name}
                level={p.level}
                subtitle={[`${p.games_played} ${p.games_played === 1 ? 'game' : 'games'} tonight`, mate ? `with ${mate}` : ''].filter(Boolean).join(' · ')}
                trailing={<Text style={[styles.order, { color: C.muted }]}>#{i + 1}</Text>}
              />
            );
          })
        )}
      </List>
    </Section>
  );
}

export function WaitingList({ C, players, waitMinutes, partnerName }: {
  C: Palette; players: WaitingPlayer[]; waitMinutes: (p: WaitingPlayer) => number; partnerName: (id: number) => string | undefined;
}) {
  return (
    <Section title="Waiting" count={players.length}>
      <List>
        {players.length === 0 ? (
          <EmptyText>Nobody else is waiting.</EmptyText>
        ) : (
          players.map((p, i) => {
            const mate = partnerName(p.player_id);
            return (
              <ListRow
                key={p.player_id}
                last={i === players.length - 1}
                leading={<Avatar name={p.name} level={p.level} />}
                title={p.name}
                level={p.level}
                subtitle={[`${p.games_played} ${p.games_played === 1 ? 'game' : 'games'} tonight`, mate ? `with ${mate}` : ''].filter(Boolean).join(' · ')}
                trailing={<Text style={[styles.order, { color: C.muted }]}>{waitMinutes(p)} min</Text>}
              />
            );
          })
        )}
      </List>
    </Section>
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
    marginTop: 2, maxWidth: 110, fontWeight: '700', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
  shuttle: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 3 },

  // court card
  card: { padding: CARD_PAD, gap: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSub: { fontSize: 13, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  team: { flex: 1, fontSize: 15, fontWeight: '600' },
  vs: { fontSize: 13 },

  // lists
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  order: { fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
});
