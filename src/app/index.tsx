import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../lib/alert';
import { useFocusEffect } from 'expo-router';

import { addPlayer, getPlayerStats, updatePlayer, deletePlayer, deletePlayers, LEVELS, type Level, type PlayerStats } from '../db/db';
import { useColors } from '../theme';
import { Button, Card, Checkbox, Dialog, EmptyText, FieldLabel, List, ListRow, Screen, Section, Segmented, TextField, levelOptions } from '../components/ui/kit';

type SortMode = 'name' | 'wins';
const SORT_OPTIONS: { value: SortMode; label: string }[] = [{ value: 'wins', label: 'Most wins' }, { value: 'name', label: 'A–Z' }];

export default function AdminScreen() {
  const C = useColors();
  const LEVEL_OPTIONS = levelOptions(LEVELS, C.dark);

  const [name, setName] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<Level>('Beginner');
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('wins');

  const [editing, setEditing] = useState<PlayerStats | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState<Level>('Beginner');

  const refresh = useCallback(() => setPlayers(getPlayerStats()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q === '' ? players : players.filter((p) => p.name.toLowerCase().includes(q));
    if (sortMode === 'name') return [...base].sort((a, b) => a.name.localeCompare(b.name));
    return base; // getPlayerStats already orders by wins
  }, [players, search, sortMode]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.includes(p.player_id));

  function handleAdd() { const n = name.trim(); if (!n) return; addPlayer(n, selectedLevel); setName(''); setSelectedLevel('Beginner'); refresh(); }
  function toggleSelect(id: number) { setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }
  function toggleSelectAll() { setSelected(allSelected ? [] : filtered.map((p) => p.player_id)); }
  function deleteSelected() {
    if (!selected.length) return;
    Alert.alert('Delete players', `Remove ${selected.length} player(s)? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          const r = deletePlayers(selected); setSelected([]); refresh();
          if (r.skipped > 0) Alert.alert('Done', `Deleted ${r.deleted}. Skipped ${r.skipped} (in an active match).`);
        } },
    ]);
  }
  function openEdit(p: PlayerStats) { setEditing(p); setEditName(p.name); setEditLevel(p.level); }
  function saveEdit() { if (!editing) return; const n = editName.trim(); if (!n) return; updatePlayer(editing.player_id, n, editLevel); setEditing(null); refresh(); }
  function confirmDelete() {
    if (!editing) return;
    Alert.alert('Delete player', `Remove ${editing.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          const r = deletePlayer(editing.player_id);
          if (!r.ok) { Alert.alert('Cannot delete', r.reason ?? 'Try again later.'); return; }
          setEditing(null); refresh();
        } },
    ]);
  }

  const ranked = sortMode === 'wins' && search.trim() === '';

  return (
    <Screen title="Players" subtitle={`${players.length} registered`}>
      <Section title="Add player">
        <Card>
          <FieldLabel>Name</FieldLabel>
          <TextField placeholder="Player name" value={name} onChangeText={setName} onSubmitEditing={handleAdd} returnKeyType="done" />
          <FieldLabel>Level</FieldLabel>
          <Segmented options={LEVEL_OPTIONS} value={selectedLevel} onChange={setSelectedLevel} />
          <Button title="Add player" onPress={handleAdd} disabled={!name.trim()} />
        </Card>
      </Section>

      <Section title="Leaderboard" count={filtered.length}>
        <TextField placeholder="Search by name" value={search} onChangeText={setSearch} autoCorrect={false} clearButtonMode="while-editing" />
        <Segmented options={SORT_OPTIONS} value={sortMode} onChange={setSortMode} />

        <View style={styles.toolbar}>
          <Pressable style={styles.selectAll} onPress={toggleSelectAll} hitSlop={6}>
            <Checkbox checked={allSelected} />
            <Text style={{ color: C.text, fontSize: 15 }}>Select all</Text>
          </Pressable>
          <Button
            title={selected.length ? `Delete (${selected.length})` : 'Delete'}
            variant="destructiveSoft"
            size="sm"
            onPress={deleteSelected}
            disabled={!selected.length}
          />
        </View>

        <List>
          {filtered.length === 0 ? (
            <EmptyText>No players found.</EmptyText>
          ) : (
            filtered.map((p, i) => (
              <ListRow
                key={p.player_id}
                last={i === filtered.length - 1}
                onPress={() => toggleSelect(p.player_id)}
                leading={
                  <>
                    <Checkbox checked={selected.includes(p.player_id)} />
                    {ranked ? <Text style={[styles.rank, { color: C.muted }]}>{i + 1}</Text> : null}
                  </>
                }
                title={p.name}
                level={p.level}
                subtitle={`${p.total_wins}W ${p.total_losses}L · ${p.games} games · ${Math.round(p.win_rate * 100)}%`}
                trailing={<Button title="Edit" variant="plain" size="sm" onPress={() => openEdit(p)} />}
              />
            ))
          )}
        </List>
      </Section>

      <Dialog
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit player"
        actions={
          <>
            <Button title="Delete" variant="plainDestructive" onPress={confirmDelete} />
            <View style={{ flex: 1 }} />
            <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} />
            <Button title="Save" onPress={saveEdit} disabled={!editName.trim()} />
          </>
        }
      >
        <View style={{ gap: 12 }}>
          <FieldLabel>Name</FieldLabel>
          <TextField value={editName} onChangeText={setEditName} />
          <FieldLabel>Level</FieldLabel>
          <Segmented options={LEVEL_OPTIONS} value={editLevel} onChange={setEditLevel} />
        </View>
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 20, textAlign: 'center', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
