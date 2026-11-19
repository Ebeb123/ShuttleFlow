// ---------------------------------------------------------------------------
// IN-APP ALERT  (phones and web)
// ---------------------------------------------------------------------------
// Same call as React Native's Alert:
//   Alert.alert('Reset all data', 'This cannot be undone.', [
//     { text: 'Cancel', style: 'cancel' },
//     { text: 'Delete everything', style: 'destructive', onPress: () => ... },
//   ]);
// but drawn with the app's own glass dialog instead of the plain system box.
// <AlertHost /> (mounted once in app/_layout.tsx) shows them one at a time.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Dialog } from '../components/ui/kit';
import { useColors } from '../theme';

export type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
type Item = { id: number; title: string; message?: string; buttons: AlertButton[] };

let queue: Item[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
    queue = [...queue, { id: nextId++, title, message, buttons: list }];
    emit();
  },
};

/** Closes the current alert, then runs the chosen button (which may open the next alert). */
function choose(b?: AlertButton) {
  queue = queue.slice(1);
  emit();
  b?.onPress?.();
}

export function AlertHost() {
  const C = useColors();
  const current = useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => queue[0],
    () => queue[0],
  );
  const cancel = current?.buttons.find((b) => b.style === 'cancel');
  const danger = current?.buttons.some((b) => b.style === 'destructive');
  // Cancel first (left), the main action last (right), like the rest of the app.
  const ordered = current ? [...current.buttons].sort((a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel')) : [];

  return (
    <Dialog
      visible={!!current}
      onClose={() => choose(cancel)}
      title={current?.title ?? ''}
      actions={ordered.map((b, i) => (
        <Button
          key={`${current?.id}-${i}`}
          title={b.text ?? 'OK'}
          variant={b.style === 'cancel' ? 'secondary' : b.style === 'destructive' ? 'destructive' : 'primary'}
          onPress={() => choose(b)}
          style={styles.btn}
        />
      ))}
    >
      {current?.message ? (
        <View style={[styles.body, danger && { borderLeftColor: C.red, borderLeftWidth: 3, paddingLeft: 10 }]}>
          <Text style={[styles.message, { color: C.text }]}>{current.message}</Text>
        </View>
      ) : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: -6 },
  message: { fontSize: 15, lineHeight: 21 },
  btn: { flexGrow: 1, flexBasis: 120 },
});
