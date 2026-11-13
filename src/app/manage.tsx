import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Alert } from '../lib/alert';
import { useFocusEffect } from 'expo-router';

import { getCourts, addCourt, setCourtStatus, removeCourt, startNewSession, resetAllData, getSettings, saveSettings, type Court, type AppSettings } from '../db/db';
import { useColors } from '../theme';
import { BodyText, Button, Card, EmptyText, List, ListRow, Screen, Section, Segmented, SettingRow, StatusDot, Stepper, TextField } from '../components/ui/kit';

const STATUS_LABEL: Record<Court['status'], string> = { open: 'Open', occupied: 'In use', closed: 'Closed' };

export default function ManageScreen() {
  const C = useColors();

  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourtName, setNewCourtName] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const refresh = useCallback(() => { setCourts(getCourts()); setSettings(getSettings()); }, []);
  const update = (next: Partial<AppSettings>) => { saveSettings(next); setSettings(getSettings()); };
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function handleNewSession() {
    Alert.alert('Start new session', 'Clears the queue and per-session game counts. Player records are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start new', style: 'destructive', onPress: () => { startNewSession(); refresh(); Alert.alert('Done', 'A new session has started.'); } },
    ]);
  }
  function handleReset() {
    Alert.alert('Reset all data', 'Permanently deletes every player, court, match, and record. There is no undo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: () => { resetAllData(); refresh(); Alert.alert('Done', 'All data cleared.'); } },
    ]);
  }
  function handleAddCourt() { const n = newCourtName.trim(); if (!n) return; addCourt(n); setNewCourtName(''); refresh(); }
  function toggleCourt(c: Court) {
    if (c.status === 'occupied') { Alert.alert('Court in use', 'You cannot close a court while a match is playing.'); return; }
    setCourtStatus(c.court_id, c.status === 'open' ? 'closed' : 'open'); refresh();
  }
  function confirmRemove(c: Court) {
    Alert.alert('Remove court', `Delete ${c.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { const r = removeCourt(c.court_id); if (!r.ok) { Alert.alert('Cannot remove', r.reason ?? ''); return; } refresh(); } },
    ]);
  }
  const dot = (s: Court['status']) => (s === 'open' ? C.green : s === 'occupied' ? C.amber : C.muted);

  return (
    <Screen title="Manage">
      <Section title="Courts" count={courts.length}>
        <View style={styles.addRow}>
          <TextField style={{ flex: 1 }} placeholder="New court name" value={newCourtName} onChangeText={setNewCourtName} onSubmitEditing={handleAddCourt} returnKeyType="done" />
          <Button title="Add court" onPress={handleAddCourt} disabled={!newCourtName.trim()} />
        </View>
        <List>
          {courts.length === 0 ? (
            <EmptyText>No courts yet.</EmptyText>
          ) : (
            courts.map((c, i) => (
              <ListRow
                key={c.court_id}
                last={i === courts.length - 1}
                leading={<StatusDot color={dot(c.status)} />}
                title={c.name}
                subtitle={STATUS_LABEL[c.status]}
                trailing={
                  <>
                    {c.status !== 'occupied' && (
                      <Button title={c.status === 'open' ? 'Close' : 'Open'} variant="plain" size="sm" onPress={() => toggleCourt(c)} />
                    )}
                    <Button title="Remove" variant="plainDestructive" size="sm" onPress={() => confirmRemove(c)} />
                  </>
                }
              />
            ))
          )}
        </List>
      </Section>

      <Section title="Match settings" footer="Changes apply to the next matches. Matches already on court keep going.">
        <Card>
          <SettingRow label="Match type" hint={settings.matchType === 'doubles' ? '4 players per court' : '2 players per court'}>
            <View style={{ width: 170 }}>
              <Segmented
                options={[{ value: 'doubles', label: 'Doubles' }, { value: 'singles', label: 'Singles' }]}
                value={settings.matchType}
                onChange={(v) => update({ matchType: v })}
              />
            </View>
          </SettingRow>
          <View style={[styles.divider, { backgroundColor: C.line }]} />
          <SettingRow label="Match time limit" hint="Courts show Over time after this">
            <Stepper value={settings.matchLimitMin} min={5} max={90} step={5} format={(v) => `${v} min`} onChange={(v) => update({ matchLimitMin: v })} />
          </SettingRow>
          <View style={[styles.divider, { backgroundColor: C.line }]} />
          <SettingRow label="Rest between games" hint={settings.restMin === 0 ? 'Players can go straight back on' : 'Players sit out at least this long'}>
            <Stepper value={settings.restMin} min={0} max={30} step={1} format={(v) => (v === 0 ? 'None' : `${v} min`)} onChange={(v) => update({ restMin: v })} />
          </SettingRow>
        </Card>
      </Section>

      <Section title="Session">
        <Card>
          <BodyText>Start a new session to clear the queue and today&apos;s game counts. Player records are kept.</BodyText>
          <Button title="Start new session" variant="secondary" onPress={handleNewSession} />
        </Card>
      </Section>

      <Section title="Danger zone">
        <Card>
          <BodyText>Permanently deletes every player, court, match, and record. This can&apos;t be undone.</BodyText>
          <Button title="Reset all data" variant="destructiveSoft" onPress={handleReset} />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  divider: { height: StyleSheet.hairlineWidth },
});
