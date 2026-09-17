'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * An element's rendered height in pixels, kept live. 0 until it has been measured, and
 * while `isEnabled` is false.
 *
 * For the geometry CSS can't hand to script — the live map's sheet stops at heights the map
 * has to frame around, and one of them is however tall the panel's summary happens to be.
 *
 * Observed from a layout effect, so measuring starts with the commit that mounts the
 * element. Nothing under I18nProvider renders on the server (see lib/i18n/provider.tsx),
 * so there is no server pass for the layout effect to warn about.
 */
export function useElementHeight(ref: RefObject<HTMLElement | null>, isEnabled = true): number {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!isEnabled || !element) return;
    const observer = new ResizeObserver(([entry]) => {
      const size = entry.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height;
      setHeight(Math.round(size));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, isEnabled]);

  return isEnabled ? height : 0;
}
