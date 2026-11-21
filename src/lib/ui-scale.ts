// Bigger text and spacing on big screens (tablets, laptops, desktop browsers).
// Loaded first by index.ts, before any screen builds its styles, so every
// StyleSheet.create(...) in the app gets scaled font sizes and spacing.
// The size class is picked once when the app opens (reload after resizing a browser a lot).
import { Dimensions, Platform, StyleSheet } from 'react-native';

function pickScale(): number {
  const { width, height } = Dimensions.get('window');
  if (Platform.OS === 'web') {
    // Browser: go by the window width.
    return width >= 1600 ? 1.28 : width >= 1280 ? 1.2 : width >= 1024 ? 1.12 : 1;
  }
  // Phone / tablet: go by the shorter side so it stays the same when rotated.
  const short = Math.min(width, height);
  return short >= 900 ? 1.28 : short >= 600 ? 1.16 : 1;
}

export const UI_SCALE = pickScale();

/** Scale a size for big screens (for sizes written inline in JSX). */
export const sc = (n: number) => Math.round(n * UI_SCALE);

// Font + spacing keys that grow with the screen. Widths/heights of shapes stay put,
// so icons and drawings keep their proportions.
const KEYS = new Set([
  'fontSize', 'lineHeight', 'letterSpacing',
  'padding', 'paddingVertical', 'paddingHorizontal', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'gap', 'rowGap', 'columnGap', 'minHeight', 'minWidth', 'borderRadius',
]);

if (UI_SCALE !== 1) {
  const create = StyleSheet.create;
  const scaleStyle = (style: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k in style) {
      const v = style[k];
      out[k] = typeof v === 'number' && KEYS.has(k) ? Math.round(v * UI_SCALE * 10) / 10 : v;
    }
    return out;
  };
  (StyleSheet as { create: typeof create }).create = ((styles: Record<string, Record<string, unknown>>) => {
    const scaled: Record<string, Record<string, unknown>> = {};
    for (const name in styles) {
      const st = styles[name];
      scaled[name] = st && typeof st === 'object' ? scaleStyle(st) : st;
    }
    return create(scaled as never);
  }) as typeof create;
}
