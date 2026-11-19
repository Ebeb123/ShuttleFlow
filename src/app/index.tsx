import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../lib/alert';

import { addPlayer, updatePlayer, deletePlayer, deletePlayers, setLocked, setLockedMany, useStore, LEVELS, type Level, type Player } from '../state/store';
import { useColors } from '../theme';
import { Avatar, Badge, Button, Card, Checkbox, Columns, Dialog, EmptyText, FieldLabel, List, ListRow, LockIcon, Screen, Section, Segmented, TextField, dismissing, levelOptions } from '../components/ui/kit';

type SortMode = 'name' | 'newest';
const SORT_OPTIONS: { value: SortMode; label: string }[] = [{ value: 'newest', label: 'Newest' }, { value: 'name', label: 'A–Z' }];

export default function AdminScreen() {
  const C = useColors();
  const LEVEL_OPTIONS = levelOptions(LEVELS, C.dark);
  const { players } = useStore(); // re-renders automatically when players change

  const [name, setName] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<Level>('Beginner');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const [editing, setEditing] = useState<Player | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState<Level>('Beginner');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q === '' ? players : players.filter((p) => p.name.toLowerCase().includes(q));
    if (sortMode === 'name') return [...base].sort((a, b) => a.name.localeCompare(b.name));
    return [...base].reverse(); // newest first
  }, [players, search, sortMode]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.includes(p.player_id));
  const lockedCount = players.filter((p) => p.locked).length;
  // Split the ticked players: locked ones can be unlocked, unlocked ones can be locked or deleted.
  const selectedPlayers = players.filter((p) => selected.includes(p.player_id));
  const selUnlocked = selectedPlayers.filter((p) => !p.locked).map((p) => p.player_id);
  const selLocked = selectedPlayers.filter((p) => p.locked).map((p) => p.player_id);

  function handleAdd() { const n = name.trim(); if (!n) return; addPlayer(n, selectedLevel); setName(''); setSelectedLevel('Beginner'); }
  function toggleSelect(p: Player) {
    setSelected((s) => (s.includes(p.player_id) ? s.filter((x) => x !== p.player_id) : [...s, p.player_id]));
  }
  function toggleSelectAll() { setSelected(allSelected ? [] : filtered.map((p) => p.player_id)); }
  function toggleLock(p: Player) { setLocked(p.player_id, !p.locked); }
  function lockSelected() { if (selUnlocked.length) { setLockedMany(selUnlocked, true); setSelected([]); } }
  function unlockSelected() { if (selLocked.length) { setLockedMany(selLocked, false); setSelected([]); } }
  function deleteSelected() {
    // Locked players are protected, so only the unlocked ticked players are deleted.
    if (!selUnlocked.length) return;
    const keptNote = selLocked.length ? ` ${selLocked.length} locked player(s) will be kept.` : '';
    Alert.alert('Delete players', `Remove ${selUnlocked.length} player(s)? This can't be undone.${keptNote}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          const r = deletePlayers(selUnlocked); setSelected([]);
          if (r.skipped > 0) Alert.alert('Done', `Deleted ${r.deleted}. Skipped ${r.skipped} (on a court).`);
        } },
    ]);
  }
  function openEdit(p: Player) { setEditing(p); setEditName(p.name); setEditLevel(p.level); }
  function saveEdit() { if (!editing) return; const n = editName.trim(); if (!n) return; updatePlayer(editing.player_id, n, editLevel); setEditing(null); }
  function confirmDelete() {
    if (!editing) return;
    Alert.alert('Delete player', `Remove ${editing.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          const r = deletePlayer(editing.player_id);
          if (!r.ok) { Alert.alert('Cannot delete', r.reason ?? 'Try again later.'); return; }
          setSelected((s) => s.filter((x) => x !== editing.player_id));
          setEditing(null);
        } },
    ]);
  }

  return (
    <Screen title="Players" subtitle={`${players.length} registered · ${lockedCount} locked`}>
      <Columns flex={[2, 3]}>
      <Section title="Add player">
        <Card>
          <FieldLabel>Name</FieldLabel>
          <TextField placeholder="Player name" value={name} onChangeText={setName} onSubmitEditing={handleAdd} returnKeyType="done" />
          <FieldLabel>Level</FieldLabel>
          <Segmented options={LEVEL_OPTIONS} value={selectedLevel} onChange={setSelectedLevel} />
          <Button title="Add player" onPress={handleAdd} disabled={!name.trim()} />
        </Card>
      </Section>

      <Section
        title="Player list"
        count={filtered.length}
        footer="Locked players are never removed, not even by Start new session in Settings. Tick players and press Lock to lock many at once."
      >
        <TextField placeholder="Search by name" value={search} onChangeText={setSearch} autoCorrect={false} clearButtonMode="while-editing" />
        <Segmented options={SORT_OPTIONS} value={sortMode} onChange={setSortMode} />

        <View style={styles.toolbar}>
          <Pressable style={styles.selectAll} onPress={dismissing(toggleSelectAll)} hitSlop={6}>
            <Checkbox checked={allSelected} />
            <Text style={{ color: C.text, fontSize: 15 }}>Select all</Text>
          </Pressable>
          <View style={styles.bulk}>
            <Button title={selUnlocked.length ? `Lock (${selUnlocked.length})` : 'Lock'} variant="secondary" size="sm" onPress={lockSelected} disabled={!selUnlocked.length} />
            <Button title={selLocked.length ? `Unlock (${selLocked.length})` : 'Unlock'} variant="secondary" size="sm" onPress={unlockSelected} disabled={!selLocked.length} />
            <Button
              title={selUnlocked.length ? `Delete (${selUnlocked.length})` : 'Delete'}
              variant="destructiveSoft"
              size="sm"
              onPress={deleteSelected}
              disabled={!selUnlocked.length}
            />
          </View>
        </View>

        <List>
          {filtered.length === 0 ? (
            <EmptyText>No players found.</EmptyText>
          ) : (
            filtered.map((p, i) => (
              <View key={p.player_id} style={p.locked ? [styles.lockedRow, { borderLeftColor: C.amber, backgroundColor: `${C.amber}14` }] : styles.unlockedRow}>
                <ListRow
                  last={i === filtered.length - 1}
                  onPress={() => toggleSelect(p)}
                  leading={
                    <>
                      <Checkbox checked={selected.includes(p.player_id)} />
                      <Avatar name={p.name} level={p.level} />
                    </>
                  }
                  title={p.name}
                  level={p.level}
                  accessory={p.locked ? <Badge text="Locked" tone="warning" /> : null}
                  subtitle={`${p.wins}W ${p.losses}L · ${p.games} ${p.games === 1 ? 'game' : 'games'}`}
                  trailing={
                    <>
                      <LockToggle locked={p.locked} onPress={() => toggleLock(p)} />
                      <Button title="Edit" variant="plain" size="sm" onPress={() => openEdit(p)} />
                    </>
                  }
                />
              </View>
            ))
          )}
        </List>
      </Section>
      </Columns>

      <Dialog
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit player"
        subtitle={editing?.locked ? 'This player is locked. Unlock them to delete.' : undefined}
        actions={
          <>
            {editing?.locked ? null : <Button title="Delete" variant="plainDestructive" onPress={confirmDelete} />}
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

/** Lock icon button: amber + closed padlock when locked, grey open padlock when not. */
function LockToggle({ locked, onPress }: { locked: boolean; onPress: () => void }) {
  const C = useColors();
  return (
    <Pressable
      onPress={dismissing(onPress)}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityState={{ checked: locked }}
      accessibilityLabel={locked ? 'Unlock player' : 'Lock player'}
      style={({ pressed }) => [
        styles.lock,
        { backgroundColor: locked ? C.amber : C.card, borderColor: locked ? C.amber : C.glassBorder },
        pressed && { opacity: 0.7 },
      ]}
    >
      <LockIcon locked={locked} color={locked ? '#fff' : C.muted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 4 },
  bulk: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockedRow: { borderLeftWidth: 4 },
  unlockedRow: { borderLeftWidth: 4, borderLeftColor: 'transparent' },
  lock: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
