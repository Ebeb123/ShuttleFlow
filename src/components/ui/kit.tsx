// Shared glass UI building blocks so every tab looks the same:
// background, screen + sections, frosted cards and lists, buttons, inputs, segmented control, dialog.
import { Children, type ReactNode } from 'react';
import {
  Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { levelColor, useColors } from '../../theme';
import type { Level } from '../../state/store';
import type { ScrollBind } from '../swap-layer';

// Real blur on iOS + web. Android blur is heavy, so it gets a more opaque panel instead.
const BLUR = Platform.OS !== 'android';
const LOGO = require('../../../assets/images/packq-logo.png');

// ------------------------------------------------------------------ background + glass
/** Soft glow made of stacked, very faint circles (works everywhere, no blur filter needed). */
function Glow({ color, size, style }: { color: string; size: number; style: ViewStyle }) {
  const rings = 10;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {Array.from({ length: rings }).map((_, i) => {
        const d = size * (1 - i / rings);
        return <View key={i} style={{ position: 'absolute', width: d, height: d, borderRadius: d, backgroundColor: color, opacity: 0.045 }} />;
      })}
    </View>
  );
}

export function GlassBackground() {
  const C = useColors();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[C.bg, C.bg2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Glow color={C.glow1} size={420} style={{ top: -140, right: -160 }} />
      <Glow color={C.glow2} size={380} style={{ top: 280, left: -190 }} />
      <Glow color={C.glow1} size={340} style={{ bottom: -120, right: -100 }} />
    </View>
  );
}

/** Frosted glass panel. */
export function Glass({ children, style, strong, radius = 20 }: {
  children?: ReactNode; style?: StyleProp<ViewStyle>; strong?: boolean; radius?: number;
}) {
  const C = useColors();
  const fill = strong || !BLUR ? C.glassStrong : C.glass;
  // The blur + tint layers sit behind the content (zIndex -1 inside this panel's own
  // stacking context) and ignore touches, so inputs and buttons on top stay usable.
  return (
    <View style={[{ zIndex: 0, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: C.glassBorder }, style]}>
      {BLUR ? (
        <BlurView pointerEvents="none" intensity={strong ? 60 : 35} tint={C.dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: -1, backgroundColor: fill }]} />
      {children}
    </View>
  );
}

// ------------------------------------------------------------------ layout
/** Wraps a tap handler so it also closes the phone keyboard: one tap does both. */
export function dismissing<A extends unknown[]>(fn?: (...args: A) => void) {
  return (...args: A) => { Keyboard.dismiss(); fn?.(...args); };
}

// ------------------------------------------------------------------ responsive helpers
export type ScreenSize = 'sm' | 'md' | 'lg';
/** Screen size class: 'sm' small phones (<380), 'md' phones, 'lg' tablets (768+). `wide` = room for 2 columns (900+). */
export function useLayout(): { width: number; size: ScreenSize; wide: boolean } {
  const { width } = useWindowDimensions();
  return { width, size: width < 380 ? 'sm' : width >= 768 ? 'lg' : 'md', wide: width >= 900 };
}
const GAPS: Record<ScreenSize, number> = { sm: 20, md: 28, lg: 32 };

/** Side-by-side columns on wide screens (tablets, desktop); stacked on phones. `flex` sets each column's share. */
export function Columns({ children, flex }: { children: ReactNode; flex?: number[] }) {
  const { wide, size } = useLayout();
  const items = Children.toArray(children);
  if (!wide) return <View style={{ gap: GAPS[size] }}>{items}</View>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 24 }}>
      {items.map((c, i) => <View key={i} style={{ flex: flex?.[i] ?? 1, minWidth: 0, gap: GAPS[size] }}>{c}</View>)}
    </View>
  );
}

/** Cards that flow into as many columns as fit (each at least `min` px wide). */
export function Grid({ children, min, gap = 12 }: { children: ReactNode; min: number; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {Children.toArray(children).map((c, i) => <View key={i} style={{ flexGrow: 1, flexBasis: min, minWidth: 0 }}>{c}</View>)}
    </View>
  );
}

/** Header sizes: small phones, normal phones, tablets. */
const HEADER = {
  sm: { pad: 14, top: 10, logo: 40, title: 24, sub: 13, gap: 10 },
  md: { pad: 20, top: 14, logo: 48, title: 30, sub: 15, gap: 14 },
  lg: { pad: 28, top: 20, logo: 58, title: 36, sub: 17, gap: 16 },
};

export function Screen({ title, subtitle, children, scrollEnabled = true, overlay, scrollBind }: {
  title: string; subtitle?: string; children: ReactNode;
  /** false while dragging a player so the page doesn't scroll. */
  scrollEnabled?: boolean;
  /** Drawn on top of the whole screen (swap lines, drag ghost). */
  overlay?: ReactNode;
  /** Lets the Live tab scroll the page itself while you drag a player near the edge. */
  scrollBind?: ScrollBind;
}) {
  const C = useColors();
  // Stay below the status bar / notch, and scale the header for small phones and tablets.
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sz = width < 380 ? HEADER.sm : width >= 768 ? HEADER.lg : HEADER.md;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <GlassBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.content,
          {
            paddingTop: insets.top + sz.top,
            paddingLeft: Math.max(sz.pad, insets.left + 8),
            paddingRight: Math.max(sz.pad, insets.right + 8),
            // web: room for the floating tab bar (plus the home bar on phones)
            paddingBottom: Platform.OS === 'web' ? 110 + insets.bottom : 48,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={scrollEnabled}
        {...scrollBind}
      >
        {/* Tapping an empty part of the page closes the keyboard (buttons still get their taps). */}
        <View style={[s.page, { gap: GAPS[width < 380 ? 'sm' : width >= 768 ? 'lg' : 'md'] }]} onStartShouldSetResponder={() => true} onResponderRelease={() => Keyboard.dismiss()}>
        <View style={[s.header, { gap: sz.gap }]}>
          <View style={[s.logoTile, { width: sz.logo, height: sz.logo, borderRadius: sz.logo * 0.29 }]}>
            <Image source={LOGO} style={{ width: sz.logo - 4, height: sz.logo - 4 }} resizeMode="contain" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.title, { color: C.text, fontSize: sz.title }]}>{title}</Text>
            {subtitle ? <Text style={[s.subtitle, { color: C.muted, fontSize: sz.sub }]}>{subtitle}</Text> : null}
          </View>
        </View>
        {children}
        </View>
      </ScrollView>
      {overlay}
    </View>
  );
}

export function Section({ title, count, action, footer, children }: {
  title?: string; count?: number | string; action?: ReactNode; footer?: string; children: ReactNode;
}) {
  const C = useColors();
  return (
    <View>
      {title ? (
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color: C.text }]}>{title}</Text>
          {count !== undefined ? <Text style={[s.sectionCount, { color: C.muted }]}>{count}</Text> : null}
          <View style={{ flex: 1 }} />
          {action}
        </View>
      ) : null}
      <View style={{ gap: 12 }}>{children}</View>
      {footer ? <Text style={[s.footer, { color: C.muted }]}>{footer}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Glass style={[s.card, style]}>{children}</Glass>;
}

/** A grouped list container; put ListRow children inside. */
export function List({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Glass style={style}>{children}</Glass>;
}

export function ListRow({ leading, title, level, accessory, subtitle, trailing, onPress, last, dimmed }: {
  leading?: ReactNode; title: string; level?: Level; accessory?: ReactNode; subtitle?: string;
  trailing?: ReactNode; onPress?: () => void; last?: boolean; dimmed?: boolean;
}) {
  const C = useColors();
  const body = (
    <>
      {leading ? <View style={s.leading}>{leading}</View> : null}
      <View style={[s.rowBody, !leading && { marginLeft: 0 }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.titleLine}>
            <Text style={[s.rowTitle, { color: C.text, flexShrink: 1 }]}>{title}</Text>
            {level ? <LevelBadge level={level} /> : null}
            {accessory}
          </View>
          {subtitle ? <Text style={[s.rowSub, { color: C.muted }]}>{subtitle}</Text> : null}
        </View>
        {trailing ? <View style={s.trailing}>{trailing}</View> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={[s.row, dimmed && { opacity: 0.5 }]}>{body}</View>;
  return (
    <Pressable onPress={dismissing(onPress)} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.card2 }, dimmed && { opacity: 0.5 }]}>
      {body}
    </Pressable>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  const C = useColors();
  return <Text style={[s.empty, { color: C.muted }]}>{children}</Text>;
}

export function BodyText({ children }: { children: ReactNode }) {
  const C = useColors();
  return <Text style={[s.body, { color: C.muted }]}>{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  const C = useColors();
  return <Text style={[s.fieldLabel, { color: C.muted }]}>{children}</Text>;
}

// ------------------------------------------------------------------ controls
type Variant = 'primary' | 'secondary' | 'destructive' | 'destructiveSoft' | 'plain' | 'plainDestructive';

export function Button({ title, onPress, variant = 'primary', size = 'md', disabled, style }: {
  title: string; onPress?: () => void; variant?: Variant; size?: 'sm' | 'md'; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const C = useColors();
  const look: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.primary, fg: C.onPrimary },
    secondary: { bg: C.card, fg: C.text, border: C.glassBorder },
    destructive: { bg: C.red, fg: '#fff' },
    destructiveSoft: { bg: C.card, fg: C.red, border: C.glassBorder },
    plain: { bg: 'transparent', fg: C.accent },
    plainDestructive: { bg: 'transparent', fg: C.red },
  };
  const { bg, fg, border } = look[variant];
  const sm = size === 'sm';
  const plain = variant === 'plain' || variant === 'plainDestructive';
  return (
    <Pressable
      onPress={dismissing(onPress)}
      disabled={disabled}
      hitSlop={sm ? 6 : 0}
      style={({ pressed }) => [
        sm ? s.btnSm : s.btn,
        plain && sm && { paddingHorizontal: 6 },
        { backgroundColor: bg },
        border ? { borderWidth: 1, borderColor: border } : null,
        disabled ? { opacity: 0.4 } : pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <Text style={[sm ? s.btnTextSm : s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function TextField(props: TextInputProps) {
  const C = useColors();
  return (
    <TextInput
      placeholderTextColor={C.muted}
      {...props}
      style={[s.input, { backgroundColor: C.card, borderColor: C.glassBorder, color: C.text }, props.style]}
    />
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string; dot?: string }[]; value: T | null; onChange: (v: T) => void;
}) {
  const C = useColors();
  const small = options.length > 4;
  return (
    <View style={[s.segTrack, { backgroundColor: C.card2, borderColor: C.glassBorder }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={dismissing(() => onChange(o.value))} style={[s.seg, on && [s.segOn, { backgroundColor: C.raised }]]}>
            {o.dot ? <View style={[s.segDot, { backgroundColor: o.dot }]} /> : null}
            <Text style={[s.segText, small && { fontSize: 12 }, { color: on ? C.text : C.muted }, on && { fontWeight: '600' }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − value + control for small numbers (minutes etc.). */
export function Stepper({ value, onChange, min = 0, max = 999, step = 1, format }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string;
}) {
  const C = useColors();
  const btn = (label: string, next: number, disabled: boolean) => (
    <Pressable
      onPress={dismissing(() => onChange(Math.min(max, Math.max(min, next))))}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [s.stepBtn, { backgroundColor: C.card, borderColor: C.glassBorder }, disabled ? { opacity: 0.35 } : pressed && { opacity: 0.7 }]}
    >
      <Text style={[s.stepBtnText, { color: C.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={s.stepper}>
      {btn('−', value - step, value <= min)}
      <Text style={[s.stepValue, { color: C.text }]}>{format ? format(value) : value}</Text>
      {btn('+', value + step, value >= max)}
    </View>
  );
}

/** A label on the left with a control on the right (settings rows). */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const C = useColors();
  return (
    <View style={s.settingRow}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160 }}>
        <Text style={[s.rowTitle, { color: C.text }]}>{label}</Text>
        {hint ? <Text style={[s.rowSub, { color: C.muted }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  const C = useColors();
  return (
    <View style={[s.check, { borderColor: checked ? C.primary : C.muted, backgroundColor: checked ? C.primary : 'transparent' }]}>
      {checked ? <View style={[s.checkMark, { borderColor: C.onPrimary }]} /> : null}
    </View>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');

/** Initials circle. With a level it uses that level's colour (green / yellow / orange / red). */
export function Avatar({ name, level, size = 36 }: { name: string; level?: Level; size?: number }) {
  const C = useColors();
  const c = level ? levelColor(level, C.dark) : null;
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: c ? c.bg : C.accentSoft }, c && { borderWidth: 1.5, borderColor: c.dot }]}>
      <Text style={[s.avatarText, { color: c ? c.text : C.accent }, size < 34 && { fontSize: 11 }]}>{initials(name)}</Text>
    </View>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export function Badge({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const C = useColors();
  const fg = { neutral: C.muted, success: C.green, warning: C.amber, danger: C.red, info: C.accent }[tone];
  const bg = tone === 'neutral' ? C.card2 : tone === 'info' ? C.accentSoft : `${fg}22`;
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** Colour-coded level tag: Beginner green, Intermediate yellow, Advance orange, Pro red. */
export function LevelBadge({ level }: { level: Level }) {
  const C = useColors();
  const c = levelColor(level, C.dark);
  return (
    <View style={[s.badge, s.levelBadge, { backgroundColor: c.bg }]}>
      <View style={[s.levelDot, { backgroundColor: c.dot }]} />
      <Text style={[s.badgeText, { color: c.text }]}>{level}</Text>
    </View>
  );
}

/** Level options for a Segmented control, each with its colour dot. */
export function levelOptions<T extends string>(levels: readonly T[], dark: boolean): { value: T; label: string; dot?: string }[] {
  return levels.map((l) => ({
    value: l,
    label: l,
    dot: (['Beginner', 'Intermediate', 'Advance', 'Pro'] as string[]).includes(l) ? levelColor(l as unknown as Level, dark).dot : undefined,
  }));
}

export function StatusDot({ color }: { color: string }) {
  return <View style={[s.dot, { backgroundColor: color }]} />;
}

// ------------------------------------------------------------------ icons
// Small icons drawn with plain Views (no emoji, no icon font), so they look
// the same on every phone and in the browser.

/** Padlock. Closed when locked; the shackle lifts and opens when unlocked. */
export function LockIcon({ locked, color, size = 18 }: { locked: boolean; color: string; size?: number }) {
  const bodyW = size * 0.78;
  const bodyH = size * 0.55;
  const shW = size * 0.5;
  const shH = size * 0.5;
  const t = Math.max(2, size * 0.12);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View
        style={{
          width: shW, height: shH, borderWidth: t, borderBottomWidth: 0, borderColor: color,
          borderTopLeftRadius: shW, borderTopRightRadius: shW, marginBottom: -t * 0.3,
          transform: locked ? [] : [{ translateY: -size * 0.12 }, { translateX: size * 0.16 }],
        }}
      />
      <View style={{ width: bodyW, height: bodyH, borderRadius: size * 0.12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: t, height: bodyH * 0.4, borderRadius: t, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      </View>
    </View>
  );
}

/** Pencil (edit). */
export function PencilIcon({ color, size = 16 }: { color: string; size?: number }) {
  const w = size * 0.28;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }}>
      <View style={{ width: w, height: size * 0.62, backgroundColor: color, borderTopLeftRadius: w * 0.3, borderTopRightRadius: w * 0.3 }} />
      <View style={{ width: 0, height: 0, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderTopWidth: size * 0.22, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color }} />
    </View>
  );
}

/** Check mark (done). */
export function CheckIcon({ color, size = 16 }: { color: string; size?: number }) {
  const t = Math.max(2, size * 0.16);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.36, height: size * 0.68, borderRightWidth: t, borderBottomWidth: t, borderColor: color, transform: [{ rotate: '45deg' }], marginTop: -size * 0.14 }} />
    </View>
  );
}

/** Two arrows pointing opposite ways (replace / swap). */
/** Die showing five: rounded square with pips. */
export function DiceIcon({ color, pip, size = 18 }: { color: string; pip: string; size?: number }) {
  const d = Math.max(3, size * 0.18);
  const at = (x: number, y: number) => (
    <View key={`${x}-${y}`} style={{ position: 'absolute', width: d, height: d, borderRadius: d, backgroundColor: pip, left: size * x - d / 2, top: size * y - d / 2 }} />
  );
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: color }}>
      {[[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]].map(([x, y]) => at(x, y))}
    </View>
  );
}

export function SwapIcon({ color, size = 16 }: { color: string; size?: number }) {
  const t = Math.max(2, size * 0.13);
  const head = size * 0.22;
  const arrow = (dir: 1 | -1) => (
    <View style={{ flexDirection: dir === 1 ? 'row' : 'row-reverse', alignItems: 'center' }}>
      <View style={{ width: size * 0.7, height: t, backgroundColor: color }} />
      <View
        style={[
          { width: 0, height: 0, borderTopWidth: head, borderBottomWidth: head, borderTopColor: 'transparent', borderBottomColor: 'transparent' },
          dir === 1 ? { borderLeftWidth: head * 1.2, borderLeftColor: color } : { borderRightWidth: head * 1.2, borderRightColor: color },
        ]}
      />
    </View>
  );
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', gap: size * 0.12 }}>
      {arrow(1)}
      {arrow(-1)}
    </View>
  );
}

// ------------------------------------------------------------------ dialog
export function Dialog({ visible, onClose, title, subtitle, children, actions }: {
  visible: boolean; onClose: () => void; title: string; subtitle?: string; children?: ReactNode; actions?: ReactNode;
}) {
  const C = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.backdrop, { backgroundColor: C.dark ? 'rgba(5,9,18,0.55)' : 'rgba(20,30,50,0.28)' }]}>
        {BLUR ? <BlurView intensity={20} tint={C.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Glass strong radius={24} style={s.dialog}>
          <View>
            <Text style={[s.dialogTitle, { color: C.text }]}>{title}</Text>
            {subtitle ? <Text style={[s.dialogSub, { color: C.muted }]}>{subtitle}</Text> : null}
          </View>
          {children}
          {actions ? <View style={s.dialogActions}>{actions}</View> : null}
        </Glass>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  content: { padding: 20, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  page: { gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: -8 },
  logoTile: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#060a14', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  title: { fontSize: 30, fontWeight: '800' },
  subtitle: { fontSize: 15, marginTop: 2 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 28 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  sectionCount: { fontSize: 14, fontWeight: '600' },
  footer: { fontSize: 13, marginTop: 8, paddingHorizontal: 4 },

  card: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  leading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12, paddingVertical: 12, paddingRight: 16, minHeight: 56 },
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowSub: { fontSize: 13, marginTop: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: { fontSize: 15, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: -4 },

  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSm: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  btnTextSm: { fontSize: 13, fontWeight: '600', textAlign: 'center' },

  input: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, minHeight: 44 },

  segTrack: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, padding: 3, borderWidth: 1 },
  seg: { flexGrow: 1, flexBasis: 'auto', flexDirection: 'row', justifyContent: 'center', gap: 5, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 4, alignItems: 'center' },
  segDot: { width: 7, height: 7, borderRadius: 4 },
  segOn: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, fontWeight: '600', marginTop: -1 },
  stepValue: { minWidth: 56, textAlign: 'center', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  settingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkMark: { width: 6, height: 10, borderRightWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '45deg' }], marginTop: -2 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 13, fontWeight: '700' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  dot: { width: 10, height: 10, borderRadius: 5 },

  backdrop: { flex: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 20, gap: 16 },
  dialogTitle: { fontSize: 18, fontWeight: '700' },
  dialogSub: { fontSize: 14, marginTop: 4 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
});
