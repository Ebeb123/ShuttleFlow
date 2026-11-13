// Shared glass UI building blocks so every tab looks the same:
// background, screen + sections, frosted cards and lists, buttons, inputs, segmented control, dialog.
import type { ReactNode } from 'react';
import {
  Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { levelColor, useColors } from '../../theme';
import type { Level } from '../../db/db';

// Real blur on iOS + web. Android blur is heavy, so it gets a more opaque panel instead.
const BLUR = Platform.OS !== 'android';
const LOGO = require('../../../assets/images/icon.png');

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
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const C = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <GlassBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: Platform.OS === 'web' ? 120 : 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.header}>
          <View style={s.logoTile}><Image source={LOGO} style={s.logo} resizeMode="contain" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: C.text }]}>{title}</Text>
            {subtitle ? <Text style={[s.subtitle, { color: C.muted }]}>{subtitle}</Text> : null}
          </View>
        </View>
        {children}
      </ScrollView>
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
            <Text style={[s.rowTitle, { color: C.text, flexShrink: 1 }]} numberOfLines={1}>{title}</Text>
            {level ? <LevelBadge level={level} /> : null}
            {accessory}
          </View>
          {subtitle ? <Text style={[s.rowSub, { color: C.muted }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {trailing ? <View style={s.trailing}>{trailing}</View> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={[s.row, dimmed && { opacity: 0.5 }]}>{body}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.card2 }, dimmed && { opacity: 0.5 }]}>
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
      onPress={onPress}
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
      <Text style={[sm ? s.btnTextSm : s.btnText, { color: fg }]} numberOfLines={1}>{title}</Text>
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
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[s.seg, on && [s.segOn, { backgroundColor: C.raised }]]}>
            {o.dot ? <View style={[s.segDot, { backgroundColor: o.dot }]} /> : null}
            <Text style={[s.segText, small && { fontSize: 12 }, { color: on ? C.text : C.muted }, on && { fontWeight: '600' }]} numberOfLines={1}>
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
      onPress={() => onChange(Math.min(max, Math.max(min, next)))}
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
      <View style={{ flex: 1 }}>
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
export function Avatar({ name, level }: { name: string; level?: Level }) {
  const C = useColors();
  const c = level ? levelColor(level, C.dark) : null;
  return (
    <View style={[s.avatar, { backgroundColor: c ? c.bg : C.accentSoft }, c && { borderWidth: 1.5, borderColor: c.dot }]}>
      <Text style={[s.avatarText, { color: c ? c.text : C.accent }]}>{initials(name)}</Text>
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
  content: { padding: 20, gap: 28, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: -8 },
  logoTile: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logo: { width: 44, height: 44 },
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
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '500' },
  rowSub: { fontSize: 13, marginTop: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: { fontSize: 15, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: -4 },

  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSm: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '600' },
  btnTextSm: { fontSize: 13, fontWeight: '600' },

  input: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, minHeight: 44 },

  segTrack: { flexDirection: 'row', borderRadius: 12, padding: 3, borderWidth: 1 },
  seg: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 5, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 4, alignItems: 'center' },
  segDot: { width: 7, height: 7, borderRadius: 4 },
  segOn: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '500' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, fontWeight: '600', marginTop: -1 },
  stepValue: { minWidth: 56, textAlign: 'center', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  dialogActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
