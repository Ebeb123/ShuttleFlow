import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useStore, type Player } from '../state/store';
import { useColors } from '../theme';
import { EmptyText, LevelBadge, List, Screen, Section, Segmented } from '../components/ui/kit';

type Tab = 'wins' | 'games';
const TABS: { value: Tab; label: string }[] = [{ value: 'wins', label: 'Most Wins' }, { value: 'games', label: 'Most Games' }];

// #1 gold, #2 silver, #3 bronze. Everyone else gets a gray row.
const MEDALS = [
  { color: '#d4a106', soft: 'rgba(245,197,24,0.18)', label: 'Gold' },
  { color: '#8e98a3', soft: 'rgba(170,178,189,0.22)', label: 'Silver' },
  { color: '#b06a2c', soft: 'rgba(205,127,50,0.2)', label: 'Bronze' },
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
              const last = i === ranked.length - 1;
              return (
                <View
                  key={p.player_id}
                  style={[
                    styles.row,
                    { backgroundColor: medal ? medal.soft : C.card2 },
                    medal && { borderLeftWidth: 5, borderLeftColor: medal.color },
                    !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
                  ]}
                >
                  <View style={[styles.rank, { backgroundColor: medal ? medal.color : C.card, borderColor: medal ? medal.color : C.line }]}>
                    <Text style={[styles.rankText, { color: medal ? '#fff' : C.muted }]}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={styles.nameLine}>
                      <Text style={[styles.name, { color: medal ? C.text : C.muted }]}>{p.name}</Text>
                      <LevelBadge level={p.level} />
                      {medal ? (
                        <View style={[styles.medal, { backgroundColor: medal.color }]}>
                          <Text style={styles.medalText}>{medal.label}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.stats}>
                      <Stat label="Wins" value={p.wins} color={medal ? C.green : C.muted} strong={tab === 'wins'} />
                      <Stat label="Losses" value={p.losses} color={medal ? C.red : C.muted} />
                      <Stat label="Games" value={p.games} color={medal ? C.text : C.muted} strong={tab === 'games'} />
                      <Stat label="Win rate" value={`${Math.round(winRate(p) * 100)}%`} color={medal ? C.accent : C.muted} />
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

function Stat({ label, value, color, strong }: { label: string; value: number | string; color: string; strong?: boolean }) {
  const C = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }, strong && { fontSize: 18 }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: C.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rank: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  nameLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  medal: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  medalText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  stat: { alignItems: 'flex-start' },
  statValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11 },
});
