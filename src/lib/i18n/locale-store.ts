import {
  detectLocale,
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from './locales';

/**
 * The chosen language, as an external store.
 *
 * The language does not live in React — it lives in `localStorage`, which the
 * prerender cannot read and which another tab can change out from under this one. That
 * makes `useSyncExternalStore` the right primitive rather than a clever arrangement of
 * state and effects: it has a first-class answer for "what should the server render"
 * (`getServerSnapshot`, below) and it gives cross-tab sync for free, because the
 * `storage` event is just another way the store changes.
 *
 * `getServerSnapshot` returns `null` deliberately — "not known yet". The provider
 * renders a wordless splash for that value, so the prerendered HTML and the first
 * client render agree without either of them having to guess a language. React then
 * re-renders with the real snapshot after hydration.
 */

const listeners = new Set<() => void>();

/** Resolved once, then kept here so `getSnapshot` returns a stable value — React calls
 * it on every render and will loop forever if the result keeps changing identity. */
let current: Locale | null = null;

let isListeningToStorage = false;

function emit() {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
  // A null key means the whole store was cleared; either way, re-read rather than
  // trusting the event's newValue, which is null for a clear and a raw string for a
  // write we would have to validate anyway.
  if (event.key !== null && event.key !== LOCALE_STORAGE_KEY) return;
  const next = readStoredLocale() ?? detectLocale();
  if (next === current) return;
  current = next;
  emit();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  if (!isListeningToStorage) {
    window.addEventListener('storage', handleStorage);
    isListeningToStorage = true;
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getLocaleSnapshot(): Locale {
  if (current === null) current = readStoredLocale() ?? detectLocale();
  return current;
}

/** What the prerender sees: nothing decided yet. */
export function getLocaleServerSnapshot(): null {
  return null;
}

export function setStoredLocale(next: Locale): void {
  if (next === current) return;
  // Held in the module as well as written to storage: a browser that refuses
  // localStorage (Safari private mode throws on write) must still switch language for
  // this session, it just won't remember the choice next time.
  current = next;
  writeStoredLocale(next);
  emit();
}
