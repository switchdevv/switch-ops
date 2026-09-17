import 'client-only';

/**
 * The two ways this console reaches someone who isn't looking at it: a sound, and the
 * operating system's own notification.
 *
 * Both are transcribed from switch-dashboard, which has alerted this team for years
 * (src/navigation/stacks/MainStack.jsx) — including the priming below, which is the part
 * that isn't obvious and the part that breaks silently when it is left out.
 *
 * `client-only`, like lib/parse/client.ts: `Audio` and `Notification` don't exist while
 * Next prerenders these pages, so an accidental import from a server module should fail
 * the build rather than the browser.
 */

/** The dashboard's own alert tone, copied so the two consoles sound alike. */
const ALERT_SOUND = '/sounds/support-alert.mp3';

let audio: HTMLAudioElement | null = null;
let isPrimed = false;

function element(): HTMLAudioElement {
  // Built on first use rather than at module scope: this module is imported by a client
  // component, but importing it must not construct anything during a prerender.
  audio ??= Object.assign(new Audio(ALERT_SOUND), { preload: 'auto' });
  return audio;
}

/**
 * Lets the sound play later, on the first click or key this tab sees.
 *
 * Browsers refuse programmatic playback until the document has been interacted with. A
 * console left sitting all evening waiting for messages is precisely when the alert
 * matters, and precisely when nothing has been clicked for hours — so the element is
 * played muted once, early, while a gesture is in hand. Safe to call more than once.
 */
export function primeAlertSound(): void {
  if (isPrimed || typeof window === 'undefined') return;
  isPrimed = true;

  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    const player = element();
    player.muted = true;
    Promise.resolve(player.play())
      .then(() => {
        player.pause();
        player.currentTime = 0;
      })
      .catch(() => {})
      .finally(() => {
        player.muted = false;
      });
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

/** Plays the alert. Rewinds first, so a second message mid-playback is still heard, and
 * swallows a refusal — a tab nobody has touched yet is not allowed to make a sound, and
 * that must not take the rest of the alert down with it. */
export function playAlertSound(): void {
  const player = element();
  player.currentTime = 0;
  Promise.resolve(player.play()).catch(() => {});
}

/* ---- desktop notifications ------------------------------------------------------- */

/**
 * Whether this browser can show one at all.
 *
 * Two different refusals: the API is missing (an Android browser has it only behind a
 * service worker), or the page isn't a secure context — which is what the console is when
 * it is opened over plain http on a LAN IP, the same hole switch-dashboard falls into.
 */
export function canShowDesktopNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
}

export type NotificationPermissionState = 'unsupported' | NotificationPermission;

export function desktopNotificationPermission(): NotificationPermissionState {
  return canShowDesktopNotifications() ? Notification.permission : 'unsupported';
}

/** Asks for permission. Must be called from a click: browsers refuse the prompt otherwise,
 * and Chrome holds it against the site if it is asked unprompted. */
export async function requestDesktopNotifications(): Promise<NotificationPermissionState> {
  if (!canShowDesktopNotifications()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Shows one, if this browser is in a position to. Answers whether it did.
 *
 * `tag` is what keeps a message from stacking up twice — the same tag replaces the earlier
 * notification instead of adding to it, which matters because two tabs can each decide to
 * announce the same message in the moment leadership passes between them.
 *
 * The constructor is wrapped because Android Chrome throws on it outright ("Illegal
 * constructor"), where notifications are a service worker's job. A phone still gets the
 * toast and the sound.
 */
export function showDesktopNotification({
  title,
  body,
  tag,
  onClick,
}: {
  title: string;
  body: string;
  tag: string;
  onClick: () => void;
}): boolean {
  if (!canShowDesktopNotifications() || Notification.permission !== 'granted') return false;

  try {
    const notification = new Notification(title, { body, tag });
    notification.onclick = () => {
      // The click is a gesture, so this is allowed to pull the window forward.
      window.focus();
      notification.close();
      onClick();
    };
    return true;
  } catch {
    return false;
  }
}
