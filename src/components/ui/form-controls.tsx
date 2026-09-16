'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * The console's form controls — native inputs in the toolbar's own styling, for the same
 * reasons `SelectField` is native: the platform's keyboard, autofill and phone keypads, and
 * one tab stop each. The catalogue forms are long, and each of those matters more the
 * longer a form is.
 */

export const INPUT_CLASS =
  'text-body bg-field-background text-field-foreground placeholder:text-field-placeholder focus-visible:ring-focus w-full rounded-xl border px-3 outline-none focus-visible:ring-2 disabled:opacity-50';

export function inputBorder(isInvalid: boolean | undefined): string {
  return isInvalid ? 'border-danger' : 'border-field-border';
}

export const LABEL_CLASS = 'text-micro text-muted font-bold tracking-[0.1em] uppercase';

/** A label over a control, with the error (or else the hint) under it. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  isRequired,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  isRequired?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
        {isRequired && (
          <span aria-hidden className="text-danger ms-0.5">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-micro text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-micro text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  isRequired?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>;

export function TextField({ label, value, onChange, error, hint, isRequired, className, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} isRequired={isRequired} className={className}>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${INPUT_CLASS} h-9 ${inputBorder(!!error)}`}
        {...input}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  hint,
  rows = 3,
  maxLength,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} className={className}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${INPUT_CLASS} resize-y py-2 ${inputBorder(!!error)}`}
      />
    </Field>
  );
}

/**
 * A whole amount. Text with a numeric keypad rather than `type="number"`, for the reasons
 * the order edit dialog gives: no "1e3", no value scrolled by a stray wheel.
 */
export function AmountField(props: Omit<TextFieldProps, 'inputMode' | 'type'>) {
  return <TextField {...props} type="text" inputMode="numeric" autoComplete="off" className={`tabular ${props.className ?? ''}`} />;
}

export function CheckboxField({
  label,
  description,
  isChecked,
  onChange,
  isDisabled,
}: {
  label: string;
  description?: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
  isDisabled?: boolean;
}) {
  return (
    <label
      className={
        'border-border/70 bg-surface-secondary/40 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ' +
        (isDisabled ? 'opacity-50' : 'hover:bg-surface-tertiary cursor-pointer')
      }
    >
      <input
        type="checkbox"
        checked={isChecked}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent mt-0.5 size-4 shrink-0"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-bold">{label}</span>
        {description && <span className="text-caption text-muted">{description}</span>}
      </span>
    </label>
  );
}

/** A titled block of a long form. */
export function FormSection({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-h6 font-bold">{title}</h2>
          {description && <p className="text-caption text-muted mt-0.5 max-w-prose">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
