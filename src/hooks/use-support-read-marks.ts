'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ReadMarks } from '@/lib/ops/support';

/**
 * Which support messages this account has opened, remembered in this browser.
 *
 * The `Message` class has no "read" or "handled" column, and a Staff session can't add one:
 * each row's ACL is its author's, so an update is refused. So "unread" here is personal and
 * local — what *you* haven't opened *on this browser* — and the screen says so.
 *
 * The mark is a moment plus a list: everything created before `since` counts as read, and
 * `ids` are the newer ones opened since. `since` starts at the first visit, so the whole
 * history doesn't arrive unread, and "Mark all as read" moves it to now. The list is capped;
 * the oldest ids fall off first, which at worst shows a long-read message as unread again.
 */


const PREFIX = 'switch-ops.support.read.';
const MAX_IDS = 400;
const EMPTY: ReadMarks = { since: 0, ids: [] };

const cache = new Map<string, ReadMarks>();
const listeners = new Set<() => void>();

function storageKey(scope: string) {
  return PREFIX + scope;
}

function load(scope: string): ReadMarks {
  const cached = cache.get(scope);
  if (cached) return cached;

  let marks: ReadMarks | null = null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    const parsed = raw ? (JSON.parse(raw) as Partial<ReadMarks>) : null;
    if (parsed && typeof parsed.since === 'number' && Array.isArray(parsed.ids)) {
      marks = { since: parsed.since, ids: parsed.ids.filter((id): id is string => typeof id === 'string') };
    }
  } catch {
    // Unreadable or refused storage: start fresh below.
  }
  if (!marks) {
    marks = { since: Date.now(), ids: [] };
    save(scope, marks);
  }
  cache.set(scope, marks);
  return marks;
}

function save(scope: string, marks: ReadMarks) {
  cache.set(scope, marks);
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(marks));
  } catch {
    // Not remembered past this tab; the marks still hold for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the console marking a message read.
  const onStorage = (event: StorageEvent) => {
    if (!event.key?.startsWith(PREFIX)) return;
    cache.delete(event.key.slice(PREFIX.length));
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The read marks for one account. `scope` is the account's objectId; '' before it is known,
 * when nothing counts as unread. */
export function useReadMarks(scope: string) {
  const marks = useSyncExternalStore(
    subscribe,
    () => (scope ? load(scope) : EMPTY),
    () => EMPTY,
  );

  const markRead = useCallback(
    (id: string) => {
      if (!scope) return;
      const current = load(scope);
      if (current.ids.includes(id)) return;
      save(scope, { since: current.since, ids: [...current.ids, id].slice(-MAX_IDS) });
    },
    [scope],
  );

  const markAllRead = useCallback(() => {
    if (scope) save(scope, { since: Date.now(), ids: [] });
  }, [scope]);

  return { marks, markRead, markAllRead };
}
