import { useStore, type Level } from './state/store';

// Colours come from the PACK-Q logo: navy-black #060a14, electric blue #1f7cff, wolf silver #c8ccd6.
export const BRAND = { navy: '#060a14', blue: '#1f7cff', silver: '#c8ccd6' };

export type Palette = {
  dark: boolean;
  /** Background gradient (top → bottom) and the soft glows behind the glass. */
  bg: string; bg2: string; glow1: string; glow2: string;
  /** Frosted glass panels (the shared .glass / .glass-strong tokens), border, top-edge shine, shadow. */
  glass: string; glassStrong: string; glassBorder: string; highlight: string; shadow: string;
  /** Inputs / subtle fills / selected segment / hairlines. */
  card: string; card2: string; raised: string; line: string;
  text: string; muted: string;
  /** Main action colour and the text on top of it. */
  primary: string; onPrimary: string;
  accent: string; accentSoft: string;
  green: string; red: string; amber: string;
  /** Tab bar: solid colour that stands out from the background, plus its edge. */
  tabBar: string; tabBorder: string;
};

const DARK_BASE = {
  dark: true, highlight: 'rgba(255,255,255,0.14)', shadow: 'rgba(0,0,0,0.45)',
  card: 'rgba(255,255,255,0.06)', card2: 'rgba(255,255,255,0.08)', raised: 'rgba(255,255,255,0.16)', line: 'rgba(255,255,255,0.1)',
  text: '#eef2f8', muted: '#a3adbd', green: '#6fcf97', red: '#ef7a7a', amber: '#e3b04b',
} as const;
const LIGHT_BASE = {
  dark: false, highlight: 'rgba(255,255,255,0.9)', shadow: 'rgba(16,30,60,0.14)',
  card: 'rgba(255,255,255,0.72)', card2: 'rgba(6,10,20,0.06)', raised: 'rgba(255,255,255,0.96)', line: 'rgba(6,10,20,0.12)',
  text: '#0c1526', muted: '#4f5c70', green: '#2f8f63', red: '#c94a4a', amber: '#b7791f',
} as const;

export type BgId = 'midnight' | 'frost' | 'electric' | 'steel' | 'contrast';

/** The 5 background presets for Settings. Every one keeps text readable on its glass. */
export const BACKGROUNDS: Record<BgId, { label: string; palette: Palette }> = {
  midnight: {
    label: 'Midnight',
    palette: {
      ...DARK_BASE,
      bg: '#060a14', bg2: '#0f1d3a', glow1: BRAND.blue, glow2: '#3a5bd9',
      glass: 'rgba(20,32,58,0.42)', glassStrong: 'rgba(14,24,46,0.92)', glassBorder: 'rgba(255,255,255,0.12)',
      primary: '#4a95ff', onPrimary: '#060a14', accent: '#6eaeff', accentSoft: 'rgba(110,174,255,0.18)', tabBar: '#18294d', tabBorder: 'rgba(110,174,255,0.45)',
    },
  },
  frost: {
    label: 'Frost',
    palette: {
      ...LIGHT_BASE,
      bg: '#f1f4fa', bg2: '#d8e2f2', glow1: BRAND.blue, glow2: BRAND.silver,
      glass: 'rgba(255,255,255,0.5)', glassStrong: 'rgba(255,255,255,0.9)', glassBorder: 'rgba(255,255,255,0.85)',
      primary: '#1557c9', onPrimary: '#ffffff', accent: '#1a5fd6', accentSoft: 'rgba(31,124,255,0.14)', tabBar: '#ffffff', tabBorder: 'rgba(21,87,201,0.35)',
    },
  },
  electric: {
    label: 'Electric',
    palette: {
      ...DARK_BASE,
      bg: '#0a1a5c', bg2: '#1458d8', glow1: '#5fb2ff', glow2: '#7a5cff',
      glass: 'rgba(10,24,80,0.4)', glassStrong: 'rgba(10,22,74,0.92)', glassBorder: 'rgba(255,255,255,0.2)',
      muted: '#c2cdea', primary: '#ffffff', onPrimary: '#0a1a5c', accent: '#9fd0ff', accentSoft: 'rgba(159,208,255,0.2)', tabBar: '#050d2e', tabBorder: 'rgba(159,208,255,0.55)',
    },
  },
  steel: {
    label: 'Steel',
    palette: {
      ...DARK_BASE,
      bg: '#161c26', bg2: '#2a3444', glow1: BRAND.silver, glow2: '#5a7eb0',
      glass: 'rgba(40,50,66,0.45)', glassStrong: 'rgba(30,38,52,0.94)', glassBorder: 'rgba(200,204,214,0.16)',
      muted: '#a9b2c0', primary: '#8fb3e3', onPrimary: '#161c26', accent: '#a9c4ea', accentSoft: 'rgba(169,196,234,0.16)', tabBar: '#0b0f16', tabBorder: 'rgba(169,196,234,0.4)',
    },
  },
  contrast: {
    label: 'High contrast',
    palette: {
      ...DARK_BASE,
      bg: '#000000', bg2: '#040814', glow1: BRAND.blue, glow2: '#ffffff',
      glass: 'rgba(255,255,255,0.08)', glassStrong: 'rgba(8,12,22,0.97)', glassBorder: 'rgba(255,255,255,0.55)',
      highlight: 'rgba(255,255,255,0.25)', line: 'rgba(255,255,255,0.35)',
      text: '#ffffff', muted: '#dde3ec', primary: '#4da3ff', onPrimary: '#000000', accent: '#7cc0ff', accentSoft: 'rgba(124,192,255,0.22)',
      green: '#7dffa8', red: '#ff8a8a', amber: '#ffd166', tabBar: '#000000', tabBorder: '#ffffff',
    },
  },
};

/** The chosen background; Electric until another one is picked. */
export function useBgId(): BgId {
  return useStore().settings.bg ?? 'electric';
}

export function useColors(): Palette {
  return BACKGROUNDS[useBgId()].palette;
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
