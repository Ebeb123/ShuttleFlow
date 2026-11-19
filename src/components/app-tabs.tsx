import { useColorScheme, useWindowDimensions } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function AppTabs() {
  const dark = useColorScheme() === 'dark';
  // Label size follows the screen: small phones, normal phones, tablets.
  const width = useWindowDimensions().width;
  const fontSize = width < 380 ? 11 : width >= 768 ? 14 : 12;
  return (
    <NativeTabs
      backgroundColor={dark ? '#141e33' : '#f4f8fa'}
      indicatorColor={dark ? 'rgba(125,188,201,0.2)' : 'rgba(84,137,148,0.18)'}
      labelVisibilityMode="labeled"
      labelStyle={{ fontSize, color: dark ? '#94a2b6' : '#5b6a80', selected: { color: dark ? '#7dbcc9' : '#273555' } }}>
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
