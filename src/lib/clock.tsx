// One shared 1-second clock for every wait timer on screen.
// Times are computed from a stored timestamp (now - waitingSince), so they stay
// correct after the app was closed or in the background.
import { startTransition, useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer) {
    now = Date.now();
    // Low priority: timer ticks must never interrupt a tab switch or a tap (they'd keep restarting it).
    timer = setInterval(() => { now = Date.now(); startTransition(() => listeners.forEach((x) => x())); }, 1000);
  }
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; }
  };
}

export function useNow(): number {
  // useState (not useSyncExternalStore) so the ticks can run as low-priority updates.
  const [t, setT] = useState(now);
  useEffect(() => subscribe(() => setT(now)), []);
  return t;
}

/** mm:ss (minutes keep counting past 60). */
export function formatWait(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Live "waiting mm:ss" text. Only this small text re-renders every second. */
export function WaitTime({ since, style, prefix = 'Waiting ' }: { since: number; style?: StyleProp<TextStyle>; prefix?: string }) {
  const t = useNow();
  return <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>{prefix}{formatWait(t - since)}</Text>;
}
