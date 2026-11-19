// ---------------------------------------------------------------------------
// SWAP LAYER  (Live tab)
// ---------------------------------------------------------------------------
// Everything needed to move players between cards:
//   - EDIT MODE (pencil button on every card, "Done" turns it off)
//   - TAP-TO-SWAP: tap player 1 (orange), tap player 2 (teal), a coloured
//     line joins them, both chips glide along it and trade places.
//   - DRAG-TO-REPLACE: press and hold a player, drag onto someone in a match,
//     the target's name slides left and a replace icon shows; let go to swap.
//
// How it works:
//   Every <PlayerChip> registers itself (with a ref) in a list kept by
//   <SwapProvider>. When we need positions, we ask React Native where each
//   chip is on screen (measureInWindow) and draw the line / moving "ghost"
//   copies in <SwapOverlay>, a see-through layer on top of the whole screen.
// ---------------------------------------------------------------------------
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ElementRef, type ReactNode, type RefObject } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

type ViewRef = NonNullable<ElementRef<typeof View>>;
type ScrollRef = NonNullable<ElementRef<typeof ScrollView>>;
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { slotKey, swapPlayers, type Level, type Slot } from '../state/store';
import { useColors } from '../theme';
import { Avatar, CheckIcon, LevelBadge, PencilIcon, SwapIcon } from './ui/kit';

const ND = Platform.OS !== 'web'; // native animation driver isn't available on web

/** Colour of the first and second tapped player. */
export const PICK_A = '#f28c28';
export const PICK_B = '#14b8a6';
const GLIDE_MS = 650;
/** Dragging within this many px of the top/bottom edge scrolls the page. */
const EDGE = 90;
const MAX_SCROLL_STEP = 14; // px per frame at the very edge
/** See-through dragged copy, so the name under your finger stays readable. */
const DRAG_OPACITY = 0.45;
/** How long to press and hold before a player lifts up to drag. */
const HOLD_MS = 200;
const SNAP_BACK_MS = 150;

/** Props the Live screen spreads onto its ScrollView so dragging can scroll it. */
export type ScrollBind = {
  ref: RefObject<ScrollRef | null>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: (w: number, h: number) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  scrollEventThrottle: number;
};

type Rect = { x: number; y: number; w: number; h: number };
export type ChipPlayer = { player_id: number; name: string; level: Level };
type Entry = { ref: RefObject<ViewRef | null>; slot: Slot; player?: ChipPlayer; target: boolean; look?: Look };

function measure(v: ViewRef | null | undefined): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!v) return resolve(null);
    v.measureInWindow((x, y, w, h) => resolve(w || h ? { x, y, w, h } : null));
  });
}
const contains = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Chip shape: default tile, one-row 'wide', or name-over-level 'compact' (side-by-side courts). */
export type Look = 'wide' | 'compact';
type SwapAnim = { ra: Rect; rb: Rect; pa: ChipPlayer; pb: ChipPlayer; la?: Look; lb?: Look; gliding: boolean };
type DragState = { player: ChipPlayer; rect: Rect; look?: Look };

/**
 * Drag + hover live in a tiny store instead of React context: while you drag,
 * only the chip under your finger (and the lifted copy) redraw, not every chip.
 */
type DragView = { drag: DragState | null; dragKey: string | null; hoverKey: string | null };
function createDragStore() {
  let v: DragView = { drag: null, dragKey: null, hoverKey: null };
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set: (next: Partial<DragView>) => { v = { ...v, ...next }; subs.forEach((f) => f()); },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
type DragStore = ReturnType<typeof createDragStore>;
function useDragView<T>(store: DragStore, pick: (v: DragView) => T): T {
  return useSyncExternalStore(store.subscribe, () => pick(store.get()), () => pick(store.get()));
}
/** True while a player is being dragged (used to stop the page scrolling under your finger). */
export function useIsDragging(): boolean {
  return useDragView(useSwap().dragStore, (v) => v.drag !== null);
}

type Ctx = {
  editMode: boolean;
  toggleEdit: () => void;
  selected: string[];          // slot keys, max 2
  hidden: Set<string>;         // chips hidden while their ghost glides
  dragStore: DragStore;        // drag/hover state (see createDragStore)
  hl: Animated.Value;          // highlight opacity (fades out after a swap)
  tap: (slot: Slot, player: ChipPlayer) => void;
  register: (key: string, e: Entry) => void;
  unregister: (key: string) => void;
  dragStart: (slot: Slot, player: ChipPlayer) => void;
  dragMove: (dx: number, dy: number) => void;
  dragEnd: () => void;
  // for the overlay
  overlayRef: RefObject<ViewRef | null>;
  scrollBind: ScrollBind;
  swap: SwapAnim | null;
  ghostA: Animated.ValueXY;
  ghostB: Animated.ValueXY;
  dragXY: Animated.ValueXY;
  line: Animated.Value;
};

const SwapCtx = createContext<Ctx | null>(null);
export function useSwap(): Ctx {
  const c = useContext(SwapCtx);
  if (!c) throw new Error('useSwap must be used inside <SwapProvider>');
  return c;
}

export function SwapProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [swap, setSwap] = useState<SwapAnim | null>(null);
  const dragStore = useRef(createDragStore()).current;

  const registry = useRef(new Map<string, Entry>()).current;
  const overlayRef = useRef<ViewRef>(null);
  const busy = useRef(false);
  const firstPick = useRef<{ slot: Slot; player: ChipPlayer } | null>(null);
  const hl = useRef(new Animated.Value(1)).current;
  const line = useRef(new Animated.Value(0)).current;
  const ghostA = useRef(new Animated.ValueXY()).current;
  const ghostB = useRef(new Animated.ValueXY()).current;
  const dragXY = useRef(new Animated.ValueXY()).current;
  // Drag bookkeeping (refs so the gesture callbacks always see fresh values).
  const dragInfo = useRef<{
    slot: Slot; key: string; start: Rect; origin: Rect; targets: { key: string; slot: Slot; rect: Rect }[];
    scroll0: number; // page scroll when the drag began (target rects were measured then)
  } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const fingerDown = useRef(false); // false once the finger lifts (even before measuring finished)
  const finger = useRef({ dx: 0, dy: 0 });

  // Page scroll tracking, so a drag near the edge can scroll the page.
  const scrollRef = useRef<ScrollRef>(null);
  const scrollY = useRef(0);
  const contentH = useRef(0);
  const viewH = useRef(0);
  const autoScroll = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollBind: ScrollBind = {
    ref: scrollRef,
    onScroll: (e) => { scrollY.current = e.nativeEvent.contentOffset.y; },
    onContentSizeChange: (_w, h) => { contentH.current = h; },
    onLayout: (e) => { viewH.current = e.nativeEvent.layout.height; },
    scrollEventThrottle: 16,
  };
  function stopAutoScroll() {
    if (autoScroll.current) clearInterval(autoScroll.current);
    autoScroll.current = null;
  }
  useEffect(() => stopAutoScroll, []);

  function clearSelection() {
    firstPick.current = null;
    setSelected([]);
    hl.setValue(1);
  }

  function toggleEdit() {
    if (busy.current) return;
    clearSelection();
    setEditMode((v) => !v);
  }

  async function runSwap(a: { slot: Slot; player: ChipPlayer }, b: { slot: Slot; player: ChipPlayer }) {
    busy.current = true;
    const ka = slotKey(a.slot);
    const kb = slotKey(b.slot);
    const [ra, rb, o] = await Promise.all([
      measure(registry.get(ka)?.ref.current), measure(registry.get(kb)?.ref.current), measure(overlayRef.current),
    ]);
    if (!ra || !rb || !o) {
      // Can't measure (e.g. chip scrolled away): swap without the animation.
      swapPlayers(a.slot, b.slot);
      clearSelection();
      busy.current = false;
      return;
    }
    const rel = (r: Rect): Rect => ({ ...r, x: r.x - o.x, y: r.y - o.y });
    const A = rel(ra);
    const B = rel(rb);
    ghostA.setValue({ x: A.x, y: A.y });
    ghostB.setValue({ x: B.x, y: B.y });
    line.setValue(0);
    setSwap({ ra: A, rb: B, pa: a.player, pb: b.player, la: registry.get(ka)?.look, lb: registry.get(kb)?.look, gliding: true });
    setHidden(new Set([ka, kb]));

    const ease = Easing.inOut(Easing.cubic);
    Animated.sequence([
      Animated.timing(line, { toValue: 1, duration: 200, useNativeDriver: ND }),
      Animated.parallel([
        Animated.timing(ghostA, { toValue: { x: B.x, y: B.y }, duration: GLIDE_MS, easing: ease, useNativeDriver: ND }),
        Animated.timing(ghostB, { toValue: { x: A.x, y: A.y }, duration: GLIDE_MS, easing: ease, useNativeDriver: ND }),
      ]),
    ]).start(() => {
      // The real data swap happens here, then the line + highlights fade out.
      swapPlayers(a.slot, b.slot);
      setHidden(new Set());
      setSwap((s) => (s ? { ...s, gliding: false } : s));
      Animated.parallel([
        Animated.timing(line, { toValue: 0, duration: 350, useNativeDriver: ND }),
        Animated.timing(hl, { toValue: 0, duration: 350, useNativeDriver: ND }),
      ]).start(() => {
        setSwap(null);
        clearSelection();
        busy.current = false;
      });
    });
  }

  function tap(slot: Slot, player: ChipPlayer) {
    if (!editMode || busy.current) return;
    const key = slotKey(slot);
    const first = firstPick.current;
    if (!first) {
      firstPick.current = { slot, player };
      hl.setValue(1);
      setSelected([key]);
      return;
    }
    if (slotKey(first.slot) === key) { clearSelection(); return; } // tap again = cancel
    if (first.slot.kind === 'pool' && slot.kind === 'pool') {
      // Two waiting players: nothing to swap, so just pick the new one instead.
      firstPick.current = { slot, player };
      setSelected([key]);
      return;
    }
    setSelected([slotKey(first.slot), key]);
    runSwap(first, { slot, player });
  }

  // ---------------- drag-to-replace ----------------
  async function dragStart(slot: Slot, player: ChipPlayer) {
    if (busy.current) return;
    fingerDown.current = true;
    finger.current = { dx: 0, dy: 0 };
    const key = slotKey(slot);
    const scroll0 = scrollY.current;
    // Measure the target seats at the same time as the dragged chip (all at once, not one by one).
    const targetsReady = Promise.all(
      [...registry]
        .filter(([k, e]) => e.target && k !== key
          // An empty Build-a-match seat can't take a player out of a match (it would leave a hole).
          && !(e.slot.kind === 'draft' && e.slot.playerId == null && slot.kind === 'match'))
        .map(async ([k, e]) => ({ key: k, slot: e.slot, rect: await measure(e.ref.current) })),
    );
    const [start, o] = await Promise.all([measure(registry.get(key)?.ref.current), measure(overlayRef.current)]);
    if (!start || !o || !fingerDown.current) return; // let go before we were ready: nothing to do

    // Lift the chip straight away; it follows the finger even if it already moved.
    const info = { slot, key, start, origin: o, targets: [] as { key: string; slot: Slot; rect: Rect }[], scroll0 };
    dragInfo.current = info;
    const { dx, dy } = finger.current;
    dragXY.setValue({ x: start.x - o.x + dx, y: start.y - o.y + dy });
    dragStore.set({ drag: { player, rect: { ...start, x: start.x - o.x, y: start.y - o.y }, look: registry.get(key)?.look }, dragKey: key });
    stopAutoScroll();
    autoScroll.current = setInterval(autoScrollTick, 16);

    const measured = await targetsReady;
    if (dragInfo.current !== info) return; // that drag already ended
    info.targets = measured.flatMap((t) => (t.rect ? [{ key: t.key, slot: t.slot, rect: t.rect }] : []));
    hitTest();
  }

  /** Which seat is under the dragged chip's centre (allowing for page scroll since the drag began). */
  function hitTest() {
    const d = dragInfo.current;
    if (!d) return;
    const { dx, dy } = finger.current;
    const cx = d.start.x + d.start.w / 2 + dx;
    const cy = d.start.y + d.start.h / 2 + dy;
    const shift = scrollY.current - d.scroll0;
    const hit = d.targets.find((t) => contains({ ...t.rect, y: t.rect.y - shift }, cx, cy));
    const next = hit ? hit.key : null;
    if (next !== hoverRef.current) { hoverRef.current = next; dragStore.set({ hoverKey: next }); }
  }

  /** While held near the top/bottom edge, scroll the page (faster the closer to the edge). */
  function autoScrollTick() {
    const d = dragInfo.current;
    if (!d) return stopAutoScroll();
    const cy = d.start.y + d.start.h / 2 + finger.current.dy;
    const top = d.origin.y;
    const bottom = d.origin.y + d.origin.h;
    let step = 0;
    if (cy < top + EDGE) step = -Math.ceil(Math.min(1, (top + EDGE - cy) / EDGE) * MAX_SCROLL_STEP);
    else if (cy > bottom - EDGE) step = Math.ceil(Math.min(1, (cy - (bottom - EDGE)) / EDGE) * MAX_SCROLL_STEP);
    if (!step) return;
    const max = Math.max(0, contentH.current - viewH.current);
    const next = Math.min(max, Math.max(0, scrollY.current + step));
    if (next === scrollY.current) return;
    scrollY.current = next;
    scrollRef.current?.scrollTo({ y: next, animated: false });
    hitTest();
  }

  function dragMove(dx: number, dy: number) {
    finger.current = { dx, dy }; // remembered even before the lift finishes
    const d = dragInfo.current;
    if (!d) return;
    dragXY.setValue({ x: d.start.x - d.origin.x + dx, y: d.start.y - d.origin.y + dy });
    hitTest();
  }

  function dragEnd() {
    fingerDown.current = false;
    stopAutoScroll();
    const d = dragInfo.current;
    if (!d) return;
    dragInfo.current = null; // makes a second call (onEnd + onFinalize) do nothing
    const shift = scrollY.current - d.scroll0; // the chip's home moved by this much if the page scrolled
    const target = hoverRef.current ? d.targets.find((t) => t.key === hoverRef.current) : undefined;
    const reset = () => { hoverRef.current = null; dragStore.set({ hoverKey: null, dragKey: null, drag: null }); };
    if (target) {
      reset(); // drop the lifted copy first so the release feels instant
      swapPlayers(d.slot, target.slot);
      return;
    }
    // Released somewhere else: snap back, no changes.
    Animated.timing(dragXY, {
      toValue: { x: d.start.x - d.origin.x, y: d.start.y - d.origin.y - shift }, duration: SNAP_BACK_MS, easing: Easing.out(Easing.quad), useNativeDriver: ND,
    }).start(reset);
  }

  const value: Ctx = {
    editMode, toggleEdit, selected, hidden, dragStore, hl,
    tap,
    register: (k, e) => { registry.set(k, e); },
    unregister: (k) => { registry.delete(k); },
    dragStart, dragMove, dragEnd,
    overlayRef, scrollBind, swap, ghostA, ghostB, dragXY, line,
  };
  return <SwapCtx.Provider value={value}>{children}</SwapCtx.Provider>;
}

// ---------------------------------------------------------------- overlay
/** See-through layer over the whole screen: the line, gliding ghosts, the dragged chip. */
export function SwapOverlay() {
  const ctx = useSwap();
  const { swap } = ctx;
  const drag = useDragView(ctx.dragStore, (v) => v.drag);
  return (
    <View ref={ctx.overlayRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {swap ? <SwapLine a={swap.ra} b={swap.rb} opacity={ctx.line} /> : null}
      {swap?.gliding ? (
        <>
          <Animated.View style={[st.ghost, { width: swap.ra.w, transform: [{ translateX: ctx.ghostA.x }, { translateY: ctx.ghostA.y }] }]}>
            <ChipFace player={swap.pa} ring={PICK_A} look={swap.la} />
          </Animated.View>
          <Animated.View style={[st.ghost, { width: swap.rb.w, transform: [{ translateX: ctx.ghostB.x }, { translateY: ctx.ghostB.y }] }]}>
            <ChipFace player={swap.pb} ring={PICK_B} look={swap.lb} />
          </Animated.View>
        </>
      ) : null}
      {drag ? (
        <Animated.View style={[st.ghost, st.lifted, { width: drag.rect.w, opacity: DRAG_OPACITY, transform: [{ translateX: ctx.dragXY.x }, { translateY: ctx.dragXY.y }, { scale: 1.06 }] }]}>
          <ChipFace player={drag.player} ring={PICK_A} look={drag.look} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A straight line between the centres of two chips: orange half → teal half. */
function SwapLine({ a, b, opacity }: { a: Rect; b: Rect; opacity: Animated.Value }) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const len = Math.hypot(bx - ax, by - ay);
  const angle = Math.atan2(by - ay, bx - ax);
  const T = 4;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <View
        style={{
          position: 'absolute', left: (ax + bx) / 2 - len / 2, top: (ay + by) / 2 - T / 2, width: len, height: T,
          flexDirection: 'row', borderRadius: T, overflow: 'hidden', transform: [{ rotate: `${angle}rad` }],
        }}
      >
        <View style={{ flex: 1, backgroundColor: PICK_A }} />
        <View style={{ flex: 1, backgroundColor: PICK_B }} />
      </View>
      <View style={[st.lineDot, { left: ax - 6, top: ay - 6, backgroundColor: PICK_A }]} />
      <View style={[st.lineDot, { left: bx - 6, top: by - 6, backgroundColor: PICK_B }]} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------- chip
/** What a player chip looks like (used by the real chip and by the moving ghosts). */
function ChipFace({ player, note, ring, warmDelay, look }: {
  player: ChipPlayer; note?: string; ring?: string; warmDelay?: number;
  look?: Look;
}) {
  const C = useColors();
  const avatar = warmDelay != null
    ? <Jog delay={warmDelay}><Avatar name={player.name} level={player.level} size={30} /></Jog>
    : <Avatar name={player.name} level={player.level} size={30} />;
  const frame = [{ backgroundColor: C.raised, borderColor: ring ?? C.line }, ring ? { borderWidth: 2 } : null];
  if (look === 'compact') {
    return (
      <View style={[st.face, st.faceCompact, ...frame]}>
        <Text style={[st.name, st.nameCompact, { color: C.text }]}>{player.name}</Text>
        <LevelBadge level={player.level} />
      </View>
    );
  }
  if (look === 'wide') {
    return (
      <View style={[st.face, st.faceWide, ...frame]}>
        {avatar}
        <View style={st.nameWide}>
          <Text style={[st.name, st.nameWideText, { color: C.text }]}>{player.name}</Text>
          {note ? <Text style={[st.note, { color: C.muted, textAlign: 'left' }]}>{note}</Text> : null}
        </View>
        <LevelBadge level={player.level} />
      </View>
    );
  }
  return (
    <View style={[st.face, ...frame]}>
      {avatar}
      <Text style={[st.name, { color: C.text }]}>{player.name}</Text>
      <LevelBadge level={player.level} />
      {note ? <Text style={[st.note, { color: C.muted }]}>{note}</Text> : null}
    </View>
  );
}

/** Warm-up: a light jog (small hop + lean) that loops until the match goes on court. */
function Jog({ children, delay }: { children: ReactNode; delay: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const step = (to: number) => Animated.timing(t, { toValue: to, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: ND });
    const loop = Animated.loop(Animated.sequence([step(1), step(0), step(-1), step(0)]));
    const id = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(id); loop.stop(); };
  }, [t, delay]);
  const y = t.interpolate({ inputRange: [-1, 0, 1], outputRange: [-4, 0, -4] });
  const r = t.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });
  return <Animated.View style={{ transform: [{ translateY: y }, { rotate: r }] }}>{children}</Animated.View>;
}

/**
 * One player inside a match card, a court bracket, or the waiting list.
 *  - draggable: can be pressed-and-held and dragged (waiting list, proposed, queued)
 *  - droppable: can be replaced by a dragged player (any match seat)
 *  - disabled:  no swapping at all (e.g. a court that is celebrating)
 */
export function PlayerChip({ slot, player, note, draggable, droppable, disabled, warmDelay, look, onPress }: {
  slot: Slot; player: ChipPlayer; note?: string; draggable?: boolean; droppable?: boolean; disabled?: boolean;
  /** Set while the match is warming up (queued): the avatar jogs. */
  warmDelay?: number;
  look?: Look;
  /** Tap action when edit mode is off (edit mode taps always pick for swapping). */
  onPress?: () => void;
}) {
  const C = useColors();
  const ctx = useSwap();
  const ref = useRef<ViewRef>(null);
  const key = slotKey(slot);
  const canEdit = ctx.editMode && !disabled;

  // Keep this chip's entry in the registry up to date.
  useEffect(() => {
    if (disabled) return;
    ctx.register(key, { ref, slot, player, target: !!droppable, look });
    return () => ctx.unregister(key);
  });

  const pick = ctx.selected.indexOf(key);
  const pickColor = pick === 0 ? PICK_A : pick === 1 ? PICK_B : null;
  const hovered = useDragView(ctx.dragStore, (v) => v.hoverKey === key);
  const lifted = useDragView(ctx.dragStore, (v) => v.dragKey === key);

  // Hover: the face slides left while a replace icon grows in on the right.
  const hover = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(hover, { toValue: hovered ? 1 : 0, duration: 110, useNativeDriver: false }).start();
  }, [hovered, hover]);
  const iconWidth = hover.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });

  // Press feedback: the chip swells while you hold, so you can feel the grab start.
  const press = useRef(new Animated.Value(0)).current;
  const pressTo = (to: number, ms: number) => Animated.timing(press, { toValue: to, duration: ms, useNativeDriver: ND }).start();
  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  const opacity = ctx.hidden.has(key) ? 0 : lifted ? 0.3 : 1;

  const body = (
    <View
      ref={ref}
      collapsable={false}
      style={[
        st.chip,
        { opacity },
        canEdit && { borderColor: `${C.accent}99`, borderStyle: 'dashed' },
        hovered && { borderColor: PICK_B, borderStyle: 'solid' },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <ChipFace player={player} note={note} warmDelay={warmDelay} look={look} />
      </View>
      <Animated.View style={[st.replace, { width: iconWidth, opacity: hover }]}>
        <View style={[st.replaceIcon, { backgroundColor: PICK_B }]}>
          <SwapIcon color="#fff" size={14} />
        </View>
      </Animated.View>
      {pickColor ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, st.pickRing, { borderColor: pickColor, backgroundColor: `${pickColor}22`, shadowColor: pickColor, opacity: ctx.hl }]}
        />
      ) : null}
    </View>
  );

  const slotStyle = look ? st.slotWide : st.slot;
  if (disabled) return <View style={slotStyle}>{body}</View>;

  if (draggable) {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(HOLD_MS)
      .onBegin(() => pressTo(1, HOLD_MS))
      .onStart(() => ctx.dragStart(slot, player))
      .onUpdate((e) => ctx.dragMove(e.translationX, e.translationY))
      .onEnd(() => ctx.dragEnd())
      .onFinalize(() => { pressTo(0, 120); ctx.dragEnd(); });
    const tapG = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(HOLD_MS - 10)
      .onEnd((_e, success) => {
        if (!success) return;
        if (!ctx.editMode && onPress) onPress();
        else ctx.tap(slot, player);
      });
    return (
      <GestureDetector gesture={Gesture.Race(pan, tapG)}>
        <Animated.View style={[slotStyle, { transform: [{ scale: pressScale }] }]}>{body}</Animated.View>
      </GestureDetector>
    );
  }

  // Court seats: only tappable while edit mode is on, otherwise the tap goes
  // to the team underneath (the "who won" button).
  if (!canEdit) return <View style={slotStyle} pointerEvents="none">{body}</View>;
  return (
    <Pressable style={slotStyle} onPress={() => ctx.tap(slot, player)}>
      {body}
    </Pressable>
  );
}

/** An empty "Build a match" seat: drop a waiting player on it, or tap it to search by name. */
export function DropSeat({ slot, label, color, onPress }: {
  slot: Extract<Slot, { kind: 'draft' }>; label: string; color: string; onPress: () => void;
}) {
  const C = useColors();
  const ctx = useSwap();
  const ref = useRef<ViewRef>(null);
  const key = slotKey(slot);
  useEffect(() => {
    ctx.register(key, { ref, slot, target: true, look: 'wide' });
    return () => ctx.unregister(key);
  });
  const hovered = useDragView(ctx.dragStore, (v) => v.hoverKey === key);
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${label}. Tap to choose a player.`} style={({ pressed }) => [st.slotWide, pressed && { opacity: 0.7 }]}>
      <View
        ref={ref}
        collapsable={false}
        style={[st.seat, { borderColor: hovered ? PICK_B : `${color}99`, backgroundColor: hovered ? `${PICK_B}22` : `${color}0f` }]}
      >
        <Text style={[st.seatText, { color: hovered ? PICK_B : C.muted }]}>{hovered ? 'Drop to add' : label}</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- edit button
/** Small pencil in the top-left of every match card. Turns into "Done" in edit mode. */
export function EditButton() {
  const C = useColors();
  const { editMode, toggleEdit } = useSwap();
  return (
    <Pressable
      onPress={toggleEdit}
      hitSlop={8}
      accessibilityLabel={editMode ? 'Done editing' : 'Edit players'}
      style={({ pressed }) => [
        st.editBtn,
        { backgroundColor: editMode ? C.green : C.card, borderColor: editMode ? C.green : C.glassBorder },
        pressed && { opacity: 0.7 },
      ]}
    >
      {editMode ? <CheckIcon color="#fff" size={15} /> : <PencilIcon color={C.accent} size={16} />}
      {editMode ? <Text style={st.editText}>Done</Text> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  slot: { flexGrow: 1, flexBasis: 112 },
  slotWide: { alignSelf: 'stretch' },
  chip: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent' },
  face: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  faceWide: { flexDirection: 'row', gap: 10, paddingHorizontal: 10 },
  name: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  nameWide: { flex: 1, minWidth: 0, gap: 1 },
  faceCompact: { alignItems: 'flex-start', paddingHorizontal: 8, paddingVertical: 7 },
  nameCompact: { fontSize: 14, textAlign: 'left', alignSelf: 'stretch' },
  nameWideText: { fontSize: 15, textAlign: 'left' },
  seat: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  seatText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  note: { fontSize: 11, textAlign: 'center' },
  replace: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  replaceIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pickRing: { borderRadius: 14, borderWidth: 2.5, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  ghost: { position: 'absolute', left: 0, top: 0 },
  lifted: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  lineDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 34, height: 34, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  editText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
