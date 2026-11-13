// Phones (Android/iOS): use the real expo-sqlite. The browser build uses sqlite.web.ts instead
// (Metro picks the .web.ts file automatically for the web build).
export * from 'expo-sqlite';

/** Nothing to load on phones. */
export function prepareDatabase(): Promise<void> {
  return Promise.resolve();
}
export function saveDatabaseNow(_name: string): void {}
