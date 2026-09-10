'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept live.
 *
 * For the layout decisions CSS alone can't make — the live map has to know whether its
 * panel sits beside it or slides over it as a sheet, because that decides how much of
 * the map a fitted view must avoid.
 *
 * The server snapshot is `false` (the narrow layout). Nothing under I18nProvider renders
 * on the server (see lib/i18n/provider.tsx), so it is never actually compared against a
 * prerender; it exists because `useSyncExternalStore` requires one.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
