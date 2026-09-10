'use client';

import { useI18n } from '@/lib/i18n/provider';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales';

/**
 * Two languages, so two buttons rather than a dropdown: the alternative is always
 * visible and one click away, and a select whose whole option list is two items is a
 * menu that exists to hide one word.
 */
export function LanguageToggle() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div
      role="radiogroup"
      aria-label={t('language.label')}
      className="border-border/70 bg-surface-secondary/70 flex items-center gap-0.5 rounded-pill border p-1"
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LOCALE_NAMES[option]}
            title={LOCALE_NAMES[option]}
            onClick={() => setLocale(option)}
            className={
              'text-micro focus-visible:ring-focus grid h-7 min-w-7 place-items-center rounded-pill px-2 font-bold uppercase transition-colors outline-none focus-visible:ring-2 ' +
              (active
                ? 'bg-surface text-accent-soft-foreground shadow-card'
                : 'text-muted hover:text-foreground')
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
