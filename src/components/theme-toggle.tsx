'use client';

import type { ComponentType, SVGProps } from 'react';
import { useTheme } from 'next-themes';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';

const MODES = [
  { value: 'light', labelKey: 'theme.light', icon: SunIcon },
  { value: 'dark', labelKey: 'theme.dark', icon: MoonIcon },
  { value: 'system', labelKey: 'theme.system', icon: MonitorIcon },
] satisfies {
  value: string;
  labelKey: MessageKey;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}[];

type Mode = (typeof MODES)[number]['value'];

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  // `theme` is undefined both on the server render and on the first client render
  // (next-themes only resolves the persisted value inside its own effect, after
  // hydration) — so defaulting to 'system' here is identical on both renders and needs
  // no mount guard to avoid a mismatch.
  const current: Mode = isMode(theme) ? theme : 'system';

  return (
    // A three-way segmented control rather than a cycling button: the current mode and
    // the available modes are both visible, so nobody has to click twice to discover
    // what the third option was.
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="border-border/70 bg-surface-secondary/70 flex items-center gap-0.5 rounded-pill border p-1"
    >
      {MODES.map((mode) => {
        const label = t(mode.labelKey);
        const active = current === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(mode.value)}
            className={
              'focus-visible:ring-focus grid size-7 place-items-center rounded-pill transition-colors outline-none focus-visible:ring-2 ' +
              (active
                ? 'bg-surface text-accent-soft-foreground shadow-card'
                : 'text-muted hover:text-foreground')
            }
          >
            <mode.icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

function isMode(value: string | undefined): value is Mode {
  return !!value && MODES.some((mode) => mode.value === value);
}
