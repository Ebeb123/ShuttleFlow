import { useColorScheme } from 'react-native';
import type { Level } from './db/db';

// Colours come from the app logo: navy #273555 and teal #548994.
export const BRAND = { navy: '#273555', teal: '#548994' };

export type Palette = {
  dark: boolean;
  /** Background gradient (top → bottom) and the soft glows behind the glass. */
  bg: string; bg2: string; glow1: string; glow2: string;
  /** Frosted glass panels. */
  glass: string; glassStrong: string; glassBorder: string;
  /** Inputs / subtle fills / selected segment / hairlines. */
  card: string; card2: string; raised: string; line: string;
  text: string; muted: string;
  /** Main action colour and the text on top of it. */
  primary: string; onPrimary: string;
  accent: string; accentSoft: string;
  green: string; red: string; amber: string;
};

const LIGHT: Palette = {
  dark: false,
  bg: '#eef3f6', bg2: '#d6e6ea', glow1: BRAND.teal, glow2: BRAND.navy,
  glass: 'rgba(255,255,255,0.48)', glassStrong: 'rgba(255,255,255,0.86)', glassBorder: 'rgba(255,255,255,0.8)',
  card: 'rgba(255,255,255,0.7)', card2: 'rgba(39,53,85,0.07)', raised: 'rgba(255,255,255,0.96)', line: 'rgba(39,53,85,0.12)',
  text: '#1c2740', muted: '#5b6a80',
  primary: BRAND.navy, onPrimary: '#ffffff',
  accent: '#3f7884', accentSoft: 'rgba(84,137,148,0.16)',
  green: '#2f8f63', red: '#c94a4a', amber: '#b7791f',
};

const DARK: Palette = {
  dark: true,
  bg: '#0f1626', bg2: '#1b2a44', glow1: BRAND.teal, glow2: '#3b5a8f',
  glass: 'rgba(24,34,56,0.42)', glassStrong: 'rgba(22,32,52,0.9)', glassBorder: 'rgba(255,255,255,0.12)',
  card: 'rgba(255,255,255,0.06)', card2: 'rgba(255,255,255,0.08)', raised: 'rgba(255,255,255,0.16)', line: 'rgba(255,255,255,0.1)',
  text: '#e8eef5', muted: '#94a2b6',
  primary: '#6aa8b5', onPrimary: '#0f1626',
  accent: '#7dbcc9', accentSoft: 'rgba(125,188,201,0.18)',
  green: '#6fcf97', red: '#ef7a7a', amber: '#e3b04b',
};

export function useColors(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DARK : LIGHT;
}

// Level colour coding: Beginner green, Intermediate yellow, Advance orange, Pro red.
// `base` tints the badge background; text uses a darker (light mode) or brighter (dark mode) shade to stay readable.
const LEVEL_COLORS: Record<Level, { base: string; onLight: string; onDark: string }> = {
  Beginner: { base: '#34c759', onLight: '#1f7a45', onDark: '#6fdc95' },
  Intermediate: { base: '#f5c400', onLight: '#8a6a00', onDark: '#f5d450' },
  Advance: { base: '#f28c28', onLight: '#b35a08', onDark: '#f7a961' },
  Pro: { base: '#e5484d', onLight: '#b42d32', onDark: '#f28a8d' },
};

export function levelColor(level: Level, dark: boolean): { dot: string; text: string; bg: string } {
  const c = LEVEL_COLORS[level] ?? LEVEL_COLORS.Beginner;
  return { dot: c.base, text: dark ? c.onDark : c.onLight, bg: `${c.base}${dark ? '2e' : '26'}` };
}
