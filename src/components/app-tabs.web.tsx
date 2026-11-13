// ---------------------------------------------------------------------------
// WEB TABS  (browser build only — phones use app-tabs.tsx with native tabs)
// ---------------------------------------------------------------------------
// Shows the app in a phone-width column with the same four tabs as the
// mobile app, using a floating frosted-glass tab bar.
// ---------------------------------------------------------------------------
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '../theme';
import { Glass, GlassBackground } from './ui/kit';

export default function AppTabs() {
  const C = useColors();
  return (
    <View style={[styles.page, { backgroundColor: C.bg }]}>
      <GlassBackground />
      <View style={styles.phone}>
        <Tabs>
          <TabSlot style={{ flex: 1 }} />
          <TabList asChild>
            <BottomBar>
              <TabTrigger name="index" href="/" asChild>
                <TabButton>Admin</TabButton>
              </TabTrigger>
              <TabTrigger name="explore" href="/explore" asChild>
                <TabButton>Queue</TabButton>
              </TabTrigger>
              <TabTrigger name="live" href="/live" asChild>
                <TabButton>Live</TabButton>
              </TabTrigger>
              <TabTrigger name="manage" href="/manage" asChild>
                <TabButton>Manage</TabButton>
              </TabTrigger>
            </BottomBar>
          </TabList>
        </Tabs>
      </View>
    </View>
  );
}

function BottomBar({ children, style, ...props }: TabListProps) {
  return (
    <View {...props} style={styles.barWrap} pointerEvents="box-none">
      <Glass radius={22} strong style={styles.bar}>
        <View style={styles.barRow}>{children}</View>
      </Glass>
    </View>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const C = useColors();
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
      <View style={[styles.tabInner, isFocused && { backgroundColor: C.accentSoft }]}>
        <Text style={[styles.tabText, { color: isFocused ? C.accent : C.muted }, isFocused && { fontWeight: '700' }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  phone: { flex: 1, width: '100%', maxWidth: 480 },
  barWrap: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  bar: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  barRow: { flexDirection: 'row', padding: 6 },
  tab: { flex: 1 },
  tabInner: { borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '500' },
});
