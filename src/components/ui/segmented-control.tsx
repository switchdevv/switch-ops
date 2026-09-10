'use client';

/**
 * A row of mutually exclusive options — date presets, the theme, the language.
 *
 * Plain buttons rather than a component-library tab set: these segments carry no panels
 * to associate with, and the tokens here are the same ones the pager and the toggles
 * use, so nothing on a page looks like it came from a different kit.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  isDisabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-surface-secondary border-border/70 rounded-pill inline-flex w-fit items-center gap-0.5 border p-1"
    >
      {options.map((option) => {
        const isSelected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={isDisabled}
            onClick={() => onChange(option.key)}
            className={
              'text-caption focus-visible:ring-focus rounded-pill px-3 py-1.5 font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 disabled:opacity-50 ' +
              (isSelected
                ? 'bg-surface text-foreground shadow-card'
                : 'text-muted hover:text-foreground')
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
