import { useWindowDimensions } from 'react-native';
import { useColors } from '../theme';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function AppTabs() {
  const C = useColors();
  // Label size follows the screen: small phones, normal phones, tablets.
  const width = useWindowDimensions().width;
  const fontSize = width < 380 ? 11 : width >= 768 ? 14 : 12;
  return (
    <NativeTabs
      backgroundColor={C.tabBar}
      indicatorColor={`${C.primary}40`}
      labelVisibilityMode="labeled"
      labelStyle={{ default: { fontSize, color: C.text }, selected: { fontSize, color: C.accent, fontWeight: '700' } }}
      iconColor={{ default: C.text, selected: C.accent }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Admin</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="admin_panel_settings" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'figure.badminton', selected: 'figure.badminton' }} md="sports_tennis" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="leaderboard">
        <NativeTabs.Trigger.Label>Leaderboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} md="leaderboard" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="manage">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
