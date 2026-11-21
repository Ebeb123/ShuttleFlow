import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AlertHost } from '@/lib/alert';
import { useColors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const dark = useColors().dark;
  // Saved data is read synchronously when the store loads, so there's nothing to wait for here.
  // GestureHandlerRootView lets the Live tab use press-and-hold dragging.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <StatusBar style={dark ? 'light' : 'dark'} />
        <AppTabs />
        <AlertHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
