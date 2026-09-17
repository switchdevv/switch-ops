'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * How this browser announces a support message: the sound, and the desktop notification.
 *
 * Kept per **browser**, not per account, and deliberately so — unlike the read marks next
 * door (hooks/use-support-read-marks.ts), which are per account because they are about a
 * person's own work. Whether a machine is allowed to make a noise is a property of where it
 * stands: the same dispatcher wants sound on the console in the office and silence on the
 * laptop in a meeting.
 *
 * Both default to **on**, which is the point of an alert on a screen nobody is watching.
 * Only an explicit 'off' turns one off, so a browser that can't write storage at all still
 * announces.
 */

const KEYS = {
  sound: 'switch-ops.support.alerts.sound',
  desktop: 'switch-ops.support.alerts.desktop',
} as const;

export type AlertChannel = keyof typeof KEYS;

const OFF = 'off';

const cache = new Map<AlertChannel, boolean>();
const listeners = new Set<() => void>();

function load(channel: AlertChannel): boolean {
  const cached = cache.get(channel);
  if (cached !== undefined) return cached;

  let enabled = true;
  try {
    enabled = window.localStorage.getItem(KEYS[channel]) !== OFF;
  } catch {
    // Refused storage: on, as if nothing had ever been set.
  }
  cache.set(channel, enabled);
  return enabled;
}

function save(channel: AlertChannel, enabled: boolean) {
  cache.set(channel, enabled);
  try {
    if (enabled) window.localStorage.removeItem(KEYS[channel]);
    else window.localStorage.setItem(KEYS[channel], OFF);
  } catch {
    // Not remembered past this tab; it still holds for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the console muting or unmuting.
  const onStorage = (event: StorageEvent) => {
    const channel = (Object.keys(KEYS) as AlertChannel[]).find((key) => KEYS[key] === event.key);
    if (!channel) return;
    cache.delete(channel);
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Read outside React by the alert runner, which decides on a beat rather than in a render
 * and must see the switch as it is *now*, not as it was when its effect last ran.
 */
export function isAlertChannelEnabled(channel: AlertChannel): boolean {
  return load(channel);
}

/** One channel's switch: whether it is on, and how to change it. */
export function useAlertChannel(channel: AlertChannel) {
  const isEnabled = useSyncExternalStore(
    subscribe,
    () => load(channel),
    // The server render — and the first client render under it — knows no browser
    // storage. On matches the default, so nothing flickers off and back on.
    () => true,
  );

  const setEnabled = useCallback((next: boolean) => save(channel, next), [channel]);

  return { isEnabled, setEnabled };
}
