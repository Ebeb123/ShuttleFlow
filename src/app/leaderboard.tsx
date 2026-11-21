import { useState } from 'react';
import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useStore, type Player } from '../state/store';
import { useColors } from '../theme';
import { sc } from '../lib/ui-scale';
import { Avatar, EmptyText, LevelBadge, List, Screen, Section, Segmented } from '../components/ui/kit';

type Tab = 'wins' | 'games';
const TABS: { value: Tab; label: string }[] = [{ value: 'wins', label: 'Most Wins' }, { value: 'games', label: 'Most Games' }];

// #1 gold, #2 silver, #3 bronze: metal gradients with a shine, so each is clearly different.
const MEDALS = [
  { label: 'Gold', colors: ['#f7d774', '#fff3c4', '#c99a06'] as const, edge: '#a87f00', ink: '#5a4300', soft: 'rgba(245,197,24,0.16)' },
  { label: 'Silver', colors: ['#C9D1D9', '#F4F7FA', '#8E99A6'] as const, edge: '#6f7a87', ink: '#2c3540', soft: 'rgba(201,209,217,0.2)' },
  { label: 'Bronze', colors: ['#e0a46e', '#f8d9bc', '#9a5a24'] as const, edge: '#7a4518', ink: '#4a2a0c', soft: 'rgba(205,127,50,0.16)' },
];

const winRate = (p: Player) => (p.games > 0 ? p.wins / p.games : 0);

/** Most Wins: wins, then higher win rate, then fewer losses. Most Games: games, then more wins. */
function sortPlayers(list: Player[], tab: Tab): Player[] {
  return [...list].sort((a, b) =>
    tab === 'wins'
      ? b.wins - a.wins || winRate(b) - winRate(a) || a.losses - b.losses || a.name.localeCompare(b.name)
      : b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name)
  );
}

/** Long names get a slightly smaller font so the card stays short. They wrap, never cut. */
const nameSize = (name: string) => sc(name.length > 22 ? 13 : name.length > 14 ? 14 : 15);
const WRAP = (Platform.OS === 'web' ? { overflowWrap: 'anywhere', wordBreak: 'break-word' } : {}) as TextStyle;

export default function LeaderboardScreen() {
  const C = useColors();
  const { players } = useStore();
  const [tab, setTab] = useState<Tab>('wins');
  const ranked = sortPlayers(players, tab);

  return (
    <Screen title="Leaderboard" subtitle="This session only">
      <Segmented options={TABS} value={tab} onChange={setTab} />
      <Section title={tab === 'wins' ? 'Most Wins' : 'Most Games'} count={ranked.length}>
        <List>
          {ranked.length === 0 ? (
            <EmptyText>No players yet. Add some in Admin.</EmptyText>
          ) : (
            ranked.map((p, i) => {
              const medal = MEDALS[i];
              const size = nameSize(p.name);
              return (
                <View
                  key={p.player_id}
                  style={[
                    styles.row,
                    medal && { backgroundColor: medal.soft },
                    i < ranked.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
                  ]}
                >
                  <Avatar id={p.player_id} name={p.name} level={p.level} size={32} gold={i === 0 && p.games > 0} />
                  <View style={styles.main}>
                    <View style={styles.nameLine}>
                      <Text style={[styles.name, WRAP, { color: C.text, fontSize: size, lineHeight: Math.round(size * 1.15) }]}>{p.name}</Text>
                      {medal ? <Medal medal={medal} rank={i + 1} /> : <Text style={[styles.rankPlain, { color: C.muted, borderColor: C.line }]}>{i + 1}</Text>}
                    </View>
                    <View style={styles.meta}>
                      <LevelBadge level={p.level} />
                      <Text style={[styles.stats, { color: C.muted }]}>
                        <Text style={{ color: C.green, fontWeight: tab === 'wins' ? '800' : '700' }}>{p.wins}W</Text>
                        {'  '}
                        <Text style={{ color: C.red, fontWeight: '700' }}>{p.losses}L</Text>
                        {'  '}
                        <Text style={{ color: C.text, fontWeight: tab === 'games' ? '800' : '600' }}>{p.games} {p.games === 1 ? 'game' : 'games'}</Text>
                        {'  '}
                        {Math.round(winRate(p) * 100)}%
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </List>
      </Section>
    </Screen>
  );
}

/** Round metal medal with a shine and the rank number, sitting right beside the name. */
function Medal({ medal, rank }: { medal: (typeof MEDALS)[number]; rank: number }) {
  return (
    <View accessibilityLabel={`${medal.label} medal, rank ${rank}`} style={[styles.medal, { borderColor: medal.edge }]}>
      <LinearGradient colors={medal.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.shine} />
      <Text style={[styles.medalText, { color: medal.ink }]}>{rank}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0, fontWeight: '700' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  stats: { fontSize: 12, fontVariant: ['tabular-nums'] },
  medal: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  shine: { position: 'absolute', top: 2, left: 4, width: 12, height: 7, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.75)', transform: [{ rotate: '-25deg' }] },
  medalText: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rankPlain: { minWidth: 26, textAlign: 'center', fontSize: 12, fontWeight: '800', borderWidth: 1, borderRadius: 13, paddingVertical: 4, overflow: 'hidden' },
});
