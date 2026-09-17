'use client';

import { useId } from 'react';
import { ChevronDownIcon } from '@/components/icons';

export type SelectOption = { value: string; label: string };

/**
 * A labelled dropdown, built on the platform's own `<select>`.
 *
 * Deliberately native rather than HeroUI's listbox-backed Select. Three reasons, all of
 * them about the people using this screen: typing "or" jumps to Oran without a search
 * box, the whole thing is one tab stop instead of a popover to open and dismiss, and on
 * a phone it opens the OS picker rather than a scrolling div. The region list is the
 * long one, and it is exactly where those matter.
 *
 * `appearance-none` plus our own chevron is what keeps it looking like the rest of the
 * toolbar; everything else about it is the browser's.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  isDisabled,
  isLabelHidden,
  className,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  isDisabled?: boolean;
  /** Kept for screen readers only, where the chosen option already says what the
   * control is — "All regions" needs no "Region" above it. */
  isLabelHidden?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <label
        htmlFor={id}
        className={isLabelHidden ? 'sr-only' : 'text-micro text-muted font-bold tracking-[0.1em] uppercase'}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          className="text-body border-field-border bg-field-background text-field-foreground focus-visible:ring-focus h-9 w-full appearance-none rounded-xl border ps-3 pe-8 outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden
          className="text-muted pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2"
        />
      </div>
    </div>
  );
}
