/** The two languages this console ships. Arabic exists in the RN apps and in
 * switch-dashboard; it is not here yet because nothing in this UI is RTL-tested. */
export const LOCALES = ['en', 'fr'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Shown in the language switcher, each in its own language — a French speaker looks for
 * "Français", not for "French". */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
};

/** The BCP-47 tags `Intl` is given. Regionalised on purpose: bare 'en' formats dates as
 * M/D/Y and bare 'fr' uses a narrow no-break space as its thousands separator, neither
 * of which is what Switch's team in Algiers reads. */
export const INTL_LOCALES: Record<Locale, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
};

/** Exported so the store can tell this app's `storage` events from other keys'. */
export const LOCALE_STORAGE_KEY = 'switch-ops.locale';

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** The stored choice, or null. Wrapped because Safari's private mode throws on
 * localStorage access rather than returning null. */
export function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // A viewer who has blocked site data still gets the language they picked for this
    // session; only the memory of it is lost.
  }
}

/**
 * The browser's own preference, used the first time someone opens the console.
 *
 * `navigator.languages` rather than `navigator.language`: a machine set to
 * `['ar-DZ', 'fr-FR', 'en-US']` — an entirely normal setup in Algiers — should land on
 * French, and reading only the first entry would land it on English instead.
 */
export function detectLocale(): Locale {
  const preferences = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  for (const preference of preferences) {
    const base = preference.slice(0, 2).toLowerCase();
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
