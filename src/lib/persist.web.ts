// Browser version of persist.ts: one versioned localStorage key.
const KEY = 'packq-state-v1';

export function loadSaved(): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY); } catch { return null; }
}

let pending: (() => string) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!pending) return;
  const text = pending();
  pending = null;
  try { localStorage.setItem(KEY, text); } catch { /* private mode / full: keep working from memory */ }
}

export function scheduleSave(snapshot: () => string) {
  pending = snapshot;
  if (!timer) timer = setTimeout(flush, 300);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
