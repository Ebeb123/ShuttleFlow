import { useColorScheme } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function AppTabs() {
  const dark = useColorScheme() === 'dark';
  return (
    <NativeTabs
      backgroundColor={dark ? '#141e33' : '#f4f8fa'}
      indicatorColor={dark ? 'rgba(125,188,201,0.2)' : 'rgba(84,137,148,0.18)'}
      labelStyle={{ color: dark ? '#94a2b6' : '#5b6a80', selected: { color: dark ? '#7dbcc9' : '#273555' } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Admin</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="admin_panel_settings" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Queue</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="format_list_numbered" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="sports_tennis" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="manage">
        <NativeTabs.Trigger.Label>Manage</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}