// Saves the app's data in a file on the phone so closing the app keeps everything.
// (persist.web.ts does the same with the browser's localStorage.)
import { File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';

const file = () => new File(Paths.document, 'packq-state-v1.json');

export function loadSaved(): string | null {
  try {
    const f = file();
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}

let pending: (() => string) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending) return;
  const text = pending();
  pending = null;
  try {
    const f = file();
    if (!f.exists) f.create();
    f.writeSync(text);
  } catch {
    // Storage full or unavailable: the app keeps working from memory.
  }
}

/** Saves shortly after a change (many quick changes = one write). */
export function scheduleSave(snapshot: () => string) {
  pending = snapshot;
  if (!timer) timer = setTimeout(flush, 300);
}

// Write right away when the app goes to the background or is being closed.
AppState.addEventListener('change', (state) => { if (state !== 'active') flush(); });
