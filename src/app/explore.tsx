import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../lib/alert';
import { useFocusEffect } from 'expo-router';

import {
  getPlayersNotQueued, getQueue, getWaitingPlayers, getOpenCourts, getActiveMatches,
  getAppConfig, getLastGroupmates, getSessionHeadToHead, enqueueCustomGroup, enqueuePlayer,
  getWaitingGroups, setCustomGroup, disbandCustomGroup, swapMatchPlayer,
  pausePlayer, resumePlayer, leaveQueue, createMatch, endMatch,
  getAllPlayers, getForcedPartners, getPartnerPairs, setForcedPartners, removeForcedPartner,
  type Level, type Player, type QueueRow, type ActiveMatch, type Rival, type WaitingGroup, type Court, type PartnerPair,
} from '../db/db';
import { planAutoQueue, balanceTeams, minutesSince } from '../logic/matchmaking';
import { useColors } from '../theme';
import {
  Avatar, Badge, BodyText, Button, Card, Checkbox, Dialog, EmptyText, FieldLabel, List, ListRow,
  LevelBadge, Screen, Section, Segmented, TextField, levelOptions,
} from '../components/ui/kit';

type FilterLevel = Level | 'All';
const FILTER_LEVELS: FilterLevel[] = ['All', 'Beginner', 'Intermediate', 'Advance', 'Pro'];
const MODES: { value: 'queue' | 'play'; label: string }[] = [{ value: 'queue', label: 'Add to queue' }, { value: 'play', label: 'Play now' }];

export default function QueueScreen() {
  const C = useColors();

  const [available, setAvailable] = useState<Player[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [groups, setGroups] = useState<WaitingGroup[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<FilterLevel>('All');

  const [customOpen, setCustomOpen] = useState(false);
  const [customSel, setCustomSel] = useState<number[]>([]);
  const [customSearch, setCustomSearch] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [customMode, setCustomMode] = useState<'queue' | 'play'>('queue');
  const [customCourtId, setCustomCourtId] = useState<number | null>(null);

  const [swapMatch, setSwapMatch] = useState<ActiveMatch | null>(null);
  const [swapOutId, setSwapOutId] = useState<number | null>(null);
  const [swapSearch, setSwapSearch] = useState('');

  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [pairList, setPairList] = useState<PartnerPair[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerSel, setPartnerSel] = useState<number[]>([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [addSel, setAddSel] = useState<number[]>([]);

  const refresh = useCallback(() => {
    setAvailable(getPlayersNotQueued());
    setQueue(getQueue());
    setMatches(getActiveMatches());
    setGroups(getWaitingGroups());
    setPairs(getForcedPartners());
    setPairList(getPartnerPairs());
    setAllPlayers(getAllPlayers());
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const openCourts = useMemo<Court[]>(() => getOpenCourts(), [matches, customOpen]);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter((p) => (q === '' || p.name.toLowerCase().includes(q)) && (levelFilter === 'All' || p.level === levelFilter));
  }, [available, search, levelFilter]);
  const sortedQueue = useMemo(() => [...queue].sort((a, b) => (a.status === 'playing' ? 1 : 0) - (b.status === 'playing' ? 1 : 0)), [queue]);
  const waitingList = useMemo(() => queue.filter((q) => q.status === 'waiting'), [queue]);

  const filteredWaitingForCustom = useMemo(() => {
    const q = customSearch.trim().toLowerCase();
    return q === '' ? waitingList : waitingList.filter((p) => p.name.toLowerCase().includes(q));
  }, [waitingList, customSearch]);

  const need = getAppConfig().matchConfig.playersPerMatch;
  const rivals: Rival[] = useMemo(() => (customSel.length ? getSessionHeadToHead(customSel[0]) : []), [customSel]);
  const anchorName = customSel.length ? queue.find((q) => q.player_id === customSel[0])?.name ?? 'Player A' : '';

  const swapCandidates = useMemo(() => {
    if (!swapMatch) return [] as { player_id: number; name: string; level: Level }[];
    const inMatch = new Set([...swapMatch.team1, ...swapMatch.team2].map((p) => p.player_id));
    const all = [
      ...available.map((p) => ({ player_id: p.player_id, name: p.name, level: p.level })),
      ...waitingList.map((p) => ({ player_id: p.player_id, name: p.name, level: p.level })),
    ];
    return all.filter((p) => !inMatch.has(p.player_id));
  }, [swapMatch, available, waitingList]);

  const filteredSwapCandidates = useMemo(() => {
    const q = swapSearch.trim().toLowerCase();
    return q === '' ? swapCandidates : swapCandidates.filter((p) => p.name.toLowerCase().includes(q));
  }, [swapCandidates, swapSearch]);

  const nameOf = useMemo(() => new Map(allPlayers.map((p) => [p.player_id, p.name])), [allPlayers]);
  const partnerName = (id: number) => (pairs[id] != null ? nameOf.get(pairs[id]) : undefined);
  const withPartner = (id: number, base: string) => { const m = partnerName(id); return m ? (base ? `${base} · with ${m}` : `with ${m}`) : base; };

  const filteredPartnerPicks = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    return q === '' ? allPlayers : allPlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [allPlayers, partnerSearch]);

  function openPartner() { setPartnerSel([]); setPartnerSearch(''); setPartnerOpen(true); }
  function togglePartnerPick(id: number) {
    setPartnerSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id]));
  }
  function confirmPartner() {
    if (partnerSel.length !== 2) return;
    const [a, b] = partnerSel;
    const replaced = [a, b].filter((id) => pairs[id] != null && !partnerSel.includes(pairs[id]));
    const link = () => { setForcedPartners(a, b); setPartnerOpen(false); setPartnerSel([]); refresh(); };
    if (replaced.length) {
      const who = replaced.map((id) => `${nameOf.get(id)} (now with ${nameOf.get(pairs[id])})`).join(' and ');
      Alert.alert('Replace partner?', `${who} will be unlinked from their current partner.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', onPress: link },
      ]);
    } else link();
  }
  function unlink(pair: PartnerPair) {
    Alert.alert('Unlink partners', `${pair.a.name} and ${pair.b.name} will queue separately from now on.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => { removeForcedPartner(pair.a.player_id); refresh(); } },
    ]);
  }

  function add(id: number) { enqueuePlayer(id); setAddSel((prev) => prev.filter((x) => x !== id && x !== pairs[id])); refresh(); }
  function toggleAddSel(id: number) { setAddSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])); }
  const visibleSel = addSel.filter((id) => filteredAvailable.some((p) => p.player_id === id));
  const allVisibleSelected = filteredAvailable.length > 0 && filteredAvailable.every((p) => addSel.includes(p.player_id));
  function toggleAddAll() {
    const ids = filteredAvailable.map((p) => p.player_id);
    setAddSel((prev) => (allVisibleSelected ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]));
  }
  function addSelected() {
    if (!visibleSel.length) return;
    visibleSel.forEach((id) => enqueuePlayer(id)); // partners come along automatically
    setAddSel([]);
    refresh();
  }
  function togglePause(r: QueueRow) { if (r.status === 'paused') resumePlayer(r.entry_id); else pausePlayer(r.entry_id); refresh(); }
  function remove(id: number) { leaveQueue(id); refresh(); }

  function handleAutoQueue() {
    const { matchConfig } = getAppConfig();
    const pool = getWaitingPlayers(); const oc = getOpenCourts(); const recent = getLastGroupmates();
    if (!oc.length) { Alert.alert('Auto queue', 'No open courts available.'); return; }
    const plans = planAutoQueue(pool, oc.length, new Date(), matchConfig, recent, getForcedPartners());
    if (!plans.length) { Alert.alert('Auto queue', `Not enough players. Need at least ${matchConfig.playersPerMatch} waiting.`); return; }
    plans.forEach((plan, i) => { const court = oc[i]; createMatch(court.court_id, matchConfig.matchType, plan.team1.map((p) => p.player_id), plan.team2.map((p) => p.player_id)); });
    refresh(); Alert.alert('Auto queue', `Assigned ${plans.length} match(es).`);
  }

  function finish(m: ActiveMatch, t: 1 | 2) {
    endMatch(m.match_id, t);
    refresh();
    offerNextOnCourt(m.court_id, m.court_name);
  }

  // After a match ends, offer to put the next group straight onto the court that just opened.
  function offerNextOnCourt(courtId: number, courtName: string) {
    if (!getOpenCourts().some((c) => c.court_id === courtId)) return; // closed meanwhile
    const { matchConfig } = getAppConfig();
    const [plan] = planAutoQueue(getWaitingPlayers(), 1, new Date(), matchConfig, getLastGroupmates(), getForcedPartners());
    if (!plan) return;
    const teams = `${plan.team1.map((p) => p.name).join(' & ')}  vs  ${plan.team2.map((p) => p.name).join(' & ')}`;
    Alert.alert(`Next up on ${courtName}?`, teams, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Send to court',
        onPress: () => {
          createMatch(courtId, matchConfig.matchType, plan.team1.map((p) => p.player_id), plan.team2.map((p) => p.player_id));
          refresh();
        },
      },
    ]);
  }

  function openCustom() { setEditingGroupId(null); setCustomSel([]); setCustomSearch(''); setCustomMode('queue'); setCustomCourtId(null); setCustomOpen(true); }
  function openEditGroup(g: WaitingGroup) { setEditingGroupId(g.group_id); setCustomSel(g.members.map((m) => m.player_id)); setCustomSearch(''); setCustomMode('queue'); setCustomCourtId(null); setCustomOpen(true); }
  function closeCustom() { setCustomOpen(false); setEditingGroupId(null); }
  function disband(g: WaitingGroup) {
    Alert.alert('Disband group', 'Members stay in the queue as individuals.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disband', style: 'destructive', onPress: () => { disbandCustomGroup(g.group_id); refresh(); } },
    ]);
  }
  function toggleCustom(id: number) {
    setCustomSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= need ? prev : [...prev, id]));
  }
  function confirmCustom() {
    if (customSel.length !== need) { Alert.alert('Custom match', `Select exactly ${need} players.`); return; }

    if (editingGroupId != null) {
      setCustomGroup(editingGroupId, customSel);
      setCustomOpen(false); setEditingGroupId(null); setCustomSel([]); refresh();
      Alert.alert('Group updated', 'The custom group was changed and keeps its place in line.');
      return;
    }

    if (customMode === 'play') {
      if (customCourtId == null) { Alert.alert('Custom match', 'Choose a court to play on.'); return; }
      const { matchConfig } = getAppConfig();
      const pool = getWaitingPlayers();
      const chosen = pool.filter((p) => customSel.includes(p.player_id));
      if (chosen.length !== need) { Alert.alert('Custom match', 'Selected players must all be waiting.'); return; }
      const { team1, team2 } = balanceTeams(chosen, {}, getForcedPartners());
      createMatch(customCourtId, matchConfig.matchType, team1.map((p) => p.player_id), team2.map((p) => p.player_id));
      setCustomOpen(false); setCustomSel([]); setCustomCourtId(null); refresh();
      Alert.alert('Custom match', 'The custom match is now on court.');
    } else {
      const { averageWaitMin } = enqueueCustomGroup(customSel);
      setCustomOpen(false); setCustomSel([]); refresh();
      Alert.alert('Custom match queued', `Group inserted with an averaged wait of ${averageWaitMin.toFixed(2)} minutes.`);
    }
  }

  function openSwap(m: ActiveMatch) { setSwapMatch(m); setSwapOutId(null); setSwapSearch(''); }
  function closeSwap() { setSwapMatch(null); setSwapOutId(null); setSwapSearch(''); }
  function doSwap(inId: number) {
    if (!swapMatch || swapOutId == null) return;
    const res = swapMatchPlayer(swapMatch.match_id, swapOutId, inId);
    if (!res.ok) { Alert.alert('Cannot swap', res.reason ?? ''); return; }
    closeSwap(); refresh();
  }

  const rivalLabel = (r: Rival) => (r.wins > r.losses ? `${anchorName} leads ${r.wins}–${r.losses}` : r.losses > r.wins ? `${r.name} leads ${r.losses}–${r.wins}` : `Tied ${r.wins}–${r.losses}`);

  const now = new Date();
  const names = (t: { name: string }[]) => t.map((m) => m.name).join(' & ');
  const confirmLabel = editingGroupId != null ? 'Save group' : customMode === 'play' ? 'Play now' : 'Add to queue';

  return (
    <Screen title="Queue" subtitle={`${waitingList.length} waiting · ${matches.length} on court`}>
      <View style={styles.actions}>
        <Button title="Auto queue" onPress={handleAutoQueue} style={{ flex: 1 }} />
        <Button title="Custom match" variant="secondary" onPress={openCustom} style={{ flex: 1 }} />
      </View>

      <Section title="On court" count={matches.length}>
        {matches.length === 0 ? (
          <List><EmptyText>No matches in progress.</EmptyText></List>
        ) : (
          matches.map((m) => (
            <Card key={m.match_id}>
              <View style={styles.matchHead}>
                <Text style={[styles.courtName, { color: C.text }]}>{m.court_name}</Text>
                <Badge text="Playing" tone="success" />
                <View style={{ flex: 1 }} />
                <Button title="Edit players" variant="plain" size="sm" onPress={() => openSwap(m)} />
              </View>
              <View style={[styles.teams, { borderColor: C.line }]}>
                <Text style={[styles.team, { color: C.text }]} numberOfLines={2}>{names(m.team1)}</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>vs</Text>
                <Text style={[styles.team, { color: C.text, textAlign: 'right' }]} numberOfLines={2}>{names(m.team2)}</Text>
              </View>
              <View style={styles.actions}>
                <Button title="Team 1 won" variant="secondary" onPress={() => finish(m, 1)} style={{ flex: 1 }} />
                <Button title="Team 2 won" variant="secondary" onPress={() => finish(m, 2)} style={{ flex: 1 }} />
              </View>
            </Card>
          ))
        )}
      </Section>

      {groups.length > 0 && (
        <Section title="Custom groups" count={groups.length}>
          <List>
            {groups.map((g, i) => (
              <ListRow
                key={g.group_id}
                last={i === groups.length - 1}
                title={g.members.map((m) => m.name).join(', ')}
                subtitle={`${g.members.length} players · keeps its place in line`}
                trailing={
                  <>
                    <Button title="Edit" variant="plain" size="sm" onPress={() => openEditGroup(g)} />
                    <Button title="Disband" variant="plainDestructive" size="sm" onPress={() => disband(g)} />
                  </>
                }
              />
            ))}
          </List>
        </Section>
      )}

      <Section
        title="Forced partners"
        count={pairList.length}
        action={<Button title="Add pair" variant="plain" size="sm" onPress={openPartner} />}
        footer="Partners always join the queue together, are paused or removed together, and play on the same team."
      >
        <List>
          {pairList.length === 0 ? (
            <EmptyText>No partners linked yet.</EmptyText>
          ) : (
            pairList.map((pair, i) => (
              <ListRow
                key={`${pair.a.player_id}-${pair.b.player_id}`}
                last={i === pairList.length - 1}
                leading={<Avatar name={`${pair.a.name.charAt(0)} ${pair.b.name.charAt(0)}`} />}
                title={`${pair.a.name} & ${pair.b.name}`}
                subtitle={`${pair.a.level} & ${pair.b.level} · always on the same team`}
                accessory={<><LevelBadge level={pair.a.level} />{pair.b.level !== pair.a.level ? <LevelBadge level={pair.b.level} /> : null}</>}
                trailing={<Button title="Unlink" variant="plainDestructive" size="sm" onPress={() => unlink(pair)} />}
              />
            ))
          )}
        </List>
      </Section>

      <Section title="Current queue" count={waitingList.length}>
        <List>
          {sortedQueue.length === 0 ? (
            <EmptyText>The queue is empty.</EmptyText>
          ) : (
            sortedQueue.map((q, i) => {
              const wait = Math.floor(minutesSince(q.waiting_since, now));
              const games = `${q.games_played} ${q.games_played === 1 ? 'game' : 'games'}`;
              const status = `${q.status === 'playing' ? 'Playing' : q.status === 'paused' ? 'Paused' : `Waiting ${wait} min`} · ${games}`;
              return (
                <ListRow
                  key={q.entry_id}
                  last={i === sortedQueue.length - 1}
                  dimmed={q.status === 'playing'}
                  leading={<Avatar name={q.name} level={q.level} />}
                  title={q.name}
                  level={q.level}
                  subtitle={withPartner(q.player_id, status)}
                  trailing={
                    q.status === 'playing' ? (
                      <Badge text="On court" tone="success" />
                    ) : (
                      <>
                        {q.status === 'paused' ? <Badge text="Paused" tone="warning" /> : null}
                        <Button title={q.status === 'paused' ? 'Resume' : 'Pause'} variant="plain" size="sm" onPress={() => togglePause(q)} />
                        <Button title="Remove" variant="plainDestructive" size="sm" onPress={() => remove(q.entry_id)} />
                      </>
                    )
                  }
                />
              );
            })
          )}
        </List>
      </Section>

      <Section title="Add players" count={filteredAvailable.length}>
        <TextField placeholder="Search by name" value={search} onChangeText={setSearch} autoCorrect={false} clearButtonMode="while-editing" />
        <Segmented options={levelOptions(FILTER_LEVELS, C.dark)} value={levelFilter} onChange={setLevelFilter} />
        {filteredAvailable.length > 0 && (
          <View style={styles.toolbar}>
            <Pressable style={styles.selectAll} onPress={toggleAddAll} hitSlop={6}>
              <Checkbox checked={allVisibleSelected} />
              <Text style={{ color: C.text, fontSize: 15 }}>Select all</Text>
            </Pressable>
            <Button title={visibleSel.length ? `Add selected (${visibleSel.length})` : 'Add selected'} size="sm" onPress={addSelected} disabled={!visibleSel.length} />
          </View>
        )}
        <List>
          {filteredAvailable.length === 0 ? (
            <EmptyText>{available.length === 0 ? 'Everyone is already in the queue, or no players exist yet. Add players in Admin.' : 'No players match.'}</EmptyText>
          ) : (
            filteredAvailable.map((p, i) => (
              <ListRow
                key={p.player_id}
                last={i === filteredAvailable.length - 1}
                onPress={() => toggleAddSel(p.player_id)}
                leading={<><Checkbox checked={addSel.includes(p.player_id)} /><Avatar name={p.name} level={p.level} /></>}
                title={p.name}
                level={p.level}
                subtitle={withPartner(p.player_id, '')}
                trailing={<Button title={pairs[p.player_id] != null ? 'Add both' : 'Add'} variant="secondary" size="sm" onPress={() => add(p.player_id)} />}
              />
            ))
          )}
        </List>
      </Section>

      {/* ---------- Custom match / edit group ---------- */}
      <Dialog
        visible={customOpen}
        onClose={closeCustom}
        title={`${editingGroupId != null ? 'Edit group' : 'Custom match'} (${customSel.length}/${need})`}
        subtitle={`Pick ${need} players. The first player you pick shows their rivals from today.`}
        actions={
          <>
            <Button title="Cancel" variant="secondary" onPress={closeCustom} style={{ flex: 1 }} />
            <Button title={confirmLabel} onPress={confirmCustom} disabled={customSel.length !== need} style={{ flex: 1 }} />
          </>
        }
      >
        {rivals.length > 0 && (
          <View style={{ gap: 8 }}>
            <FieldLabel>Rivals for {anchorName} today</FieldLabel>
            <List>
              {rivals.map((r, i) => (
                <ListRow
                  key={r.opponent_id}
                  last={i === rivals.length - 1}
                  onPress={() => toggleCustom(r.opponent_id)}
                  leading={<Checkbox checked={customSel.includes(r.opponent_id)} />}
                  title={r.name}
                  level={r.level}
                  subtitle={rivalLabel(r)}
                />
              ))}
            </List>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <FieldLabel>Waiting players · longest wait first</FieldLabel>
          <TextField placeholder="Search by name" value={customSearch} onChangeText={setCustomSearch} autoCorrect={false} clearButtonMode="while-editing" />
          <List>
            <ScrollView style={{ maxHeight: 240 }}>
              {filteredWaitingForCustom.length === 0 ? (
                <EmptyText>{waitingList.length === 0 ? 'No waiting players.' : 'No players match your search.'}</EmptyText>
              ) : (
                filteredWaitingForCustom.map((p, i) => (
                  <ListRow
                    key={p.player_id}
                    last={i === filteredWaitingForCustom.length - 1}
                    onPress={() => toggleCustom(p.player_id)}
                    leading={<Checkbox checked={customSel.includes(p.player_id)} />}
                    title={p.name}
                    level={p.level}
                    subtitle={`Waiting ${Math.floor(minutesSince(p.waiting_since, now))} min`}
                  />
                ))
              )}
            </ScrollView>
          </List>
        </View>

        {editingGroupId == null && (
          <View style={{ gap: 8 }}>
            <Segmented options={MODES} value={customMode} onChange={setCustomMode} />
            {customMode === 'play' && (
              <>
                <FieldLabel>Court</FieldLabel>
                {openCourts.length === 0 ? (
                  <BodyText>No open courts. Free one first, or use Add to queue.</BodyText>
                ) : (
                  <Segmented options={openCourts.map((c) => ({ value: c.court_id, label: c.name }))} value={customCourtId} onChange={setCustomCourtId} />
                )}
              </>
            )}
          </View>
        )}
      </Dialog>

      {/* ---------- Link forced partners ---------- */}
      <Dialog
        visible={partnerOpen}
        onClose={() => setPartnerOpen(false)}
        title={`Link partners (${partnerSel.length}/2)`}
        subtitle="Pick two players. They will always queue together and play on the same team."
        actions={
          <>
            <Button title="Cancel" variant="secondary" onPress={() => setPartnerOpen(false)} style={{ flex: 1 }} />
            <Button title="Link partners" onPress={confirmPartner} disabled={partnerSel.length !== 2} style={{ flex: 1 }} />
          </>
        }
      >
        <View style={{ gap: 8 }}>
          <TextField placeholder="Search by name" value={partnerSearch} onChangeText={setPartnerSearch} autoCorrect={false} clearButtonMode="while-editing" />
          <List>
            <ScrollView style={{ maxHeight: 300 }}>
              {filteredPartnerPicks.length === 0 ? (
                <EmptyText>{allPlayers.length === 0 ? 'No players yet. Add players in Admin.' : 'No players match your search.'}</EmptyText>
              ) : (
                filteredPartnerPicks.map((p, i) => {
                  const mate = partnerName(p.player_id);
                  return (
                    <ListRow
                      key={p.player_id}
                      last={i === filteredPartnerPicks.length - 1}
                      onPress={() => togglePartnerPick(p.player_id)}
                      leading={<Checkbox checked={partnerSel.includes(p.player_id)} />}
                      title={p.name}
                      level={p.level}
                      subtitle={mate ? `Partnered with ${mate}` : undefined}
                    />
                  );
                })
              )}
            </ScrollView>
          </List>
        </View>
      </Dialog>

      {/* ---------- Swap a player in a live match ---------- */}
      <Dialog
        visible={swapMatch !== null}
        onClose={closeSwap}
        title={`Edit players${swapMatch ? ` · ${swapMatch.court_name}` : ''}`}
        subtitle={swapOutId == null ? 'Choose the player to replace.' : 'Now choose who comes in.'}
        actions={<Button title="Done" variant="secondary" onPress={closeSwap} style={{ flex: 1 }} />}
      >
        {swapMatch && (
          <List>
            {[...swapMatch.team1.map((p) => ({ ...p, team: 1 })), ...swapMatch.team2.map((p) => ({ ...p, team: 2 }))].map((p, i, arr) => (
              <ListRow
                key={p.player_id}
                last={i === arr.length - 1}
                onPress={() => setSwapOutId(p.player_id)}
                leading={<Checkbox checked={swapOutId === p.player_id} />}
                title={p.name}
                subtitle={`Team ${p.team}`}
              />
            ))}
          </List>
        )}

        {swapOutId != null && (
          <View style={{ gap: 8 }}>
            <FieldLabel>Bring in</FieldLabel>
            <TextField placeholder="Search by name" value={swapSearch} onChangeText={setSwapSearch} autoCorrect={false} clearButtonMode="while-editing" />
            <List>
              <ScrollView style={{ maxHeight: 240 }}>
                {filteredSwapCandidates.length === 0 ? (
                  <EmptyText>{swapCandidates.length === 0 ? 'No bench players available.' : 'No players match your search.'}</EmptyText>
                ) : (
                  filteredSwapCandidates.map((p, i) => (
                    <ListRow
                      key={p.player_id}
                      last={i === filteredSwapCandidates.length - 1}
                      onPress={() => doSwap(p.player_id)}
                      leading={<Avatar name={p.name} />}
                      title={p.name}
                      level={p.level}
                      trailing={<Button title="Swap in" variant="secondary" size="sm" onPress={() => doSwap(p.player_id)} />}
                    />
                  ))
                )}
              </ScrollView>
            </List>
          </View>
        )}
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courtName: { fontSize: 17, fontWeight: '700' },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  team: { flex: 1, fontSize: 15, fontWeight: '600' },
});
