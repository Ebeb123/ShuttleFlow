// ---------------------------------------------------------------------------
// WEB TABS  (browser build only — phones use app-tabs.tsx with native tabs)
// ---------------------------------------------------------------------------
// The same four tabs as the mobile app, in a floating frosted-glass bar.
// Responsive: phones get a phone-width column; tablets and wider screens use
// the full width. The bar stays above the phone's home bar (safe area) and
// its size follows the screen width.
// ---------------------------------------------------------------------------
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '../theme';
import { Glass, GlassBackground } from './ui/kit';

/** Bar sizes: small phones, normal phones, tablets. */
const BAR = {
  sm: { side: 8, font: 12, padV: 9, padH: 4, radius: 18, maxW: 9999 },
  md: { side: 12, font: 13, padV: 10, padH: 6, radius: 22, maxW: 9999 },
  lg: { side: 16, font: 15, padV: 12, padH: 10, radius: 24, maxW: 560 },
};
type BarSize = (typeof BAR)['md'];

function useBarSize(): BarSize {
  const w = useWindowDimensions().width;
  return w < 380 ? BAR.sm : w >= 768 ? BAR.lg : BAR.md;
}

export default function AppTabs() {
  const C = useColors();
  const wide = useWindowDimensions().width >= 768;
  return (
    <View style={[styles.page, { backgroundColor: C.bg }]}>
      <GlassBackground />
      <View style={[styles.phone, { maxWidth: wide ? 1200 : 480 }]}>
        <Tabs>
          <TabSlot style={{ flex: 1 }} />
          <TabList asChild>
            <BottomBar>
              <TabTrigger name="index" href="/" asChild>
                <TabButton>Admin</TabButton>
              </TabTrigger>
              <TabTrigger name="live" href="/live" asChild>
                <TabButton>Live</TabButton>
              </TabTrigger>
              <TabTrigger name="leaderboard" href="/leaderboard" asChild>
                <TabButton>Leaderboard</TabButton>
              </TabTrigger>
              <TabTrigger name="manage" href="/manage" asChild>
                <TabButton>Settings</TabButton>
              </TabTrigger>
            </BottomBar>
          </TabList>
        </Tabs>
      </View>
    </View>
  );
}

function BottomBar({ children, style, ...props }: TabListProps) {
  const sz = useBarSize();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      style={[styles.barWrap, { left: sz.side, right: sz.side, bottom: Math.max(sz.side, insets.bottom + 6) }]}
      pointerEvents="box-none"
    >
      <Glass radius={sz.radius} strong style={[styles.bar, { width: '100%', maxWidth: sz.maxW }]}>
        <View style={styles.barRow}>{children}</View>
      </Glass>
    </View>
  );
}

function TabButton({ children, isFocused, ref, ...props }: TabTriggerSlotProps) {
  const C = useColors();
  const sz = useBarSize();
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Pressable ref={ref as any} {...props} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
      <View style={[styles.tabInner, { paddingVertical: sz.padV, paddingHorizontal: sz.padH, borderRadius: sz.radius - 6 }, isFocused && { backgroundColor: C.accentSoft }]}>
        <Text style={[styles.tabText, { fontSize: sz.font, color: isFocused ? C.accent : C.muted }, isFocused && { fontWeight: '700' }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  phone: { flex: 1, width: '100%' },
  barWrap: { position: 'absolute', alignItems: 'center' },
  bar: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  barRow: { flexDirection: 'row', padding: 6 },
  tab: { flex: 1, minWidth: 0 },
  tabInner: { alignItems: 'center', justifyContent: 'center' },
  tabText: { fontWeight: '500', textAlign: 'center' },
});
