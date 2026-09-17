'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The stretch of the shell's header between the page title and the account controls,
 * lent to the page that is open.
 *
 * It exists for the full-bleed live map. A page that scrolls has room for a header of its
 * own; the map owns the viewport, so every row its panel spends on controls is a row the
 * orders don't get. Its Live switch and region filter govern the map and the panel alike,
 * so up here they also read as what they are — the page's controls, not the panel's.
 *
 * Portalled rather than lifted into the shell, so the page keeps its state and the shell
 * stays ignorant of what any page puts there.
 */
const PageToolbarSlot = createContext<HTMLElement | null>(null);

export const PageToolbarSlotProvider = PageToolbarSlot.Provider;

export function PageToolbar({ children }: { children: ReactNode }) {
  const slot = useContext(PageToolbarSlot);
  return slot ? createPortal(children, slot) : null;
}
