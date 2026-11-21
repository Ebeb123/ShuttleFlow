import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert } from '../lib/alert';
import { useFocusEffect } from 'expo-router';

import { getCourts, addCourt, setCourtStatus, removeCourt, startNewSession, resetAllData, getSettings, saveSettings, type Court, type AppSettings } from '../state/store';
import { BACKGROUNDS, useBgId, useColors, type BgId } from '../theme';
import { BodyText, Button, Card, Columns, EmptyText, List, ListRow, Screen, Section, Segmented, SettingRow, StatusDot, Stepper, TextField } from '../components/ui/kit';

const STATUS_LABEL: Record<Court['status'], string> = { open: 'Open', occupied: 'In use', closed: 'Closed' };
const PORTFOLIO_URL = 'https://aebriam.vercel.app';

export default function SettingsScreen() {
  const C = useColors();
  const bgId = useBgId();

  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourtName, setNewCourtName] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const refresh = useCallback(() => { setCourts(getCourts()); setSettings(getSettings()); }, []);
  const update = (next: Partial<AppSettings>) => { saveSettings(next); setSettings(getSettings()); };
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function handleNewSession() {
    Alert.alert(
      'Start new session?',
      'This clears every queue, court match and round, and removes every player who is not locked. Locked players keep their names, but their wins, losses, games and waiting time go back to 0. Timers start again when you press Start Game on Live.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start new session', style: 'destructive', onPress: () => { startNewSession(); refresh(); Alert.alert('Done', 'A new session has started.'); } },
      ]
    );
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
    <Screen title="Settings">
      <Columns>
      <Section title="Courts" count={courts.length}>
        <View style={styles.addRow}>
          <TextField style={{ flexGrow: 1, flexBasis: 180 }} placeholder="New court name" value={newCourtName} onChangeText={setNewCourtName} onSubmitEditing={handleAddCourt} returnKeyType="done" />
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

      <View style={{ gap: 28 }}>
      <Section title="Match settings" footer="Changes apply to the next matches. Matches already on court keep going.">
        <Card>
          <SettingRow label="Match type" hint={settings.matchType === 'doubles' ? '4 players per court' : '2 players per court'}>
            <View style={{ minWidth: 170 }}>
              <Segmented
                options={[{ value: 'doubles', label: 'Doubles' }, { value: 'singles', label: 'Singles' }]}
                value={settings.matchType}
                onChange={(v) => update({ matchType: v })}
              />
            </View>
          </SettingRow>
          <View style={[styles.divider, { backgroundColor: C.line }]} />
          <SettingRow label="Rest between games" hint={settings.restMin === 0 ? 'Players can go straight back on' : settings.restMin === 2 ? 'Standard match play: 2 min' : 'Players sit out at least this long'}>
            <Stepper value={settings.restMin} min={0} max={30} step={1} format={(v) => (v === 0 ? 'None' : `${v} min`)} onChange={(v) => update({ restMin: v })} />
          </SettingRow>
        </Card>
      </Section>

      <Section title="Background" footer="Colours from the PACK-Q logo. Saved on this device.">
        <Card>
          <View style={styles.swatches}>
            {(Object.keys(BACKGROUNDS) as BgId[]).map((id) => {
              const p = BACKGROUNDS[id].palette;
              const on = id === bgId;
              return (
                <Pressable
                  key={id}
                  onPress={() => update({ bg: id })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${BACKGROUNDS[id].label} background`}
                  style={({ pressed }) => [styles.swatchItem, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.swatch, { borderColor: on ? C.accent : C.line, borderWidth: on ? 3 : 1 }]}>
                    <LinearGradient colors={[p.bg, p.bg2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <View style={[styles.swatchGlass, { backgroundColor: p.glassStrong, borderColor: p.glassBorder }]}>
                      <Text style={{ color: p.text, fontSize: 11, fontWeight: '800' }}>Aa</Text>
                      <View style={[styles.swatchDot, { backgroundColor: p.primary }]} />
                    </View>
                  </View>
                  <Text style={[styles.swatchLabel, { color: on ? C.text : C.muted, fontWeight: on ? '800' : '600' }]}>{BACKGROUNDS[id].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </Section>

      <Section title="Session">
        <Card>
          <BodyText>Start a new session to clear all queues, courts and rounds. Unlocked players are removed; locked players stay with their stats reset to 0.</BodyText>
          <Button title="Start new session" variant="secondary" onPress={handleNewSession} />
        </Card>
      </Section>

      <Section title="Danger zone">
        <Card>
          <BodyText>Permanently deletes every player, court, match, and record. This can&apos;t be undone.</BodyText>
          <Button title="Reset all data" variant="destructiveSoft" onPress={handleReset} />
        </Card>
      </Section>
      </View>
      </Columns>

      <Text style={[styles.credit, { color: C.muted }]}>
        Made by:{' '}
        <Text
          style={[styles.creditLink, { color: C.accent }]}
          onPress={() => Linking.openURL(PORTFOLIO_URL)}
          accessibilityRole="link"
          accessibilityHint="Opens the developer's portfolio"
        >
          Aebriam
        </Text>
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  credit: { fontSize: 12, textAlign: 'center', marginTop: -8, opacity: 0.85 },
  creditLink: { fontWeight: '700', textDecorationLine: 'underline' },
  divider: { height: StyleSheet.hairlineWidth },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  swatchItem: { alignItems: 'center', gap: 6, width: 64 },
  swatch: { width: 60, height: 60, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  swatchGlass: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },
  swatchLabel: { fontSize: 11, textAlign: 'center' },
});
