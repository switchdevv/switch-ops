'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { RefreshIcon } from '@/components/icons';
import { makeFormatters, type Formatters } from '@/lib/format';
import {
  DICTIONARIES,
  translate,
  translateCount,
  type CountKey,
  type MessageKey,
  type Vars,
} from './dictionary';
import {
  getLocaleServerSnapshot,
  getLocaleSnapshot,
  setStoredLocale,
  subscribeLocale,
} from './locale-store';
import { DEFAULT_LOCALE, type Locale } from './locales';

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Plural-aware sibling of `t`. `{count}` is filled in for you. */
  tCount: (key: CountKey, count: number, vars?: Vars) => string;
  format: Formatters;
};

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Language state for the whole app.
 *
 * ## Why this isn't next-intl, or a `[locale]` route segment
 *
 * The app is a static export with no server (see next.config.ts), so there is no
 * middleware to negotiate a language and no place to put a `/fr` segment without
 * doubling every built page and breaking the plain `/orders` URLs that people
 * bookmark. Two dictionaries behind a context is the whole requirement here.
 *
 * ## Why children are withheld for one frame
 *
 * The stored language lives in `localStorage`, which the prerender cannot see, so the
 * store's server snapshot is `null` — "not known yet" — and the first render is
 * deliberately wordless: a mark and a spinner, identical on the server and in the
 * browser. React swaps in the real snapshot after hydration, before any words exist to
 * be wrong.
 *
 * The alternative, rendering English and correcting it, is a real hydration mismatch
 * (text content, not the attribute kind `suppressHydrationWarning` covers) *and* a
 * visible flash of the wrong language. The cost of this instead is one frame, on a
 * tool whose every screen already waits on a Parse round-trip.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const resolved = useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    getLocaleServerSnapshot,
  );

  const locale = resolved ?? DEFAULT_LOCALE;

  // `lang` matters beyond correctness theatre: it is what tells a screen reader which
  // voice to use, and what Chrome's translate prompt keys off. Set imperatively —
  // pushing an attribute onto a DOM node the root layout owns is exactly the
  // "synchronise an external system" an effect is for.
  useEffect(() => {
    if (resolved) document.documentElement.lang = resolved;
  }, [resolved]);

  const value = useMemo<I18nValue>(() => {
    const dictionary = DICTIONARIES[locale];
    return {
      locale,
      setLocale: setStoredLocale,
      t: (key, vars) => translate(dictionary, key, vars),
      tCount: (key, count, vars) => translateCount(dictionary, locale, key, count, vars),
      format: makeFormatters(locale),
    };
  }, [locale]);

  return (
    <I18nContext.Provider value={value}>
      {resolved ? children : <LanguageFreeSplash />}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n() was called outside <I18nProvider>.');
  return value;
}

/**
 * The one screen that may not contain a word — it is what the app renders before it
 * knows which language to render in. Deliberately not the shared FullPageLoader: that
 * one carries an accessible label, which would have to come from a dictionary.
 *
 * It is also what the exported HTML shows until the scripts run, so it is the screen left
 * standing if they never arrive. The reload control appears after 15 s through CSS alone
 * (`ops-late-appear`) and is a plain link to the page itself, so it works with no
 * JavaScript at all — and a reload is served from the service worker's copy when the
 * network is what failed (public/sw.js). Its only words are its label, in both languages.
 */
function LanguageFreeSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5">
      <span className="brand-gradient shadow-accent size-12 rounded-xl" />
      <span
        aria-hidden
        className="border-border border-t-accent size-5 animate-spin rounded-full border-2"
      />
      <a
        href=""
        aria-label="Reload · Recharger"
        className="ops-late-appear border-border text-muted hover:text-foreground grid size-10 place-items-center rounded-full border"
      >
        <RefreshIcon aria-hidden className="size-4" />
      </a>
    </div>
  );
}
