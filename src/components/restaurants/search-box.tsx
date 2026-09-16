'use client';

import { useId, useState } from 'react';
import { Button } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { LABEL_CLASS } from '@/components/ui/form-controls';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { CloseIcon, SearchIcon } from '@/components/icons';

/**
 * The search row of a catalogue toolbar: what to match on, the text, and Search.
 *
 * The text is local until submitted, as on the orders board — a query per keystroke buys
 * nothing, and a half-typed id matches nothing. It follows the URL when that changes from
 * outside (Back, a pasted link), adjusted during render rather than in an effect for the
 * reason the orders toolbar gives.
 */
export function SearchBox({
  query,
  field,
  fields,
  placeholder,
  onFieldChange,
  onSubmit,
  className,
}: {
  query: string;
  field?: string;
  /** Left out when there is only one thing to search. */
  fields?: SelectOption[];
  placeholder: string;
  onFieldChange?: (field: string) => void;
  onSubmit: (query: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [draft, setDraft] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setDraft(query);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft.trim());
      }}
      className={`border-separator/70 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:p-5 ${className ?? ''}`}
    >
      {fields && field !== undefined && onFieldChange && (
        <SelectField
          label={t('orders.search.field')}
          value={field}
          options={fields}
          onChange={onFieldChange}
          className="sm:w-44"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={inputId} className={LABEL_CLASS}>
          {t('orders.search.label')}
        </label>
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden
            className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <input
            id={inputId}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="text-body border-field-border bg-field-background text-field-foreground placeholder:text-field-placeholder focus-visible:ring-focus h-9 w-full rounded-xl border ps-9 pe-9 outline-none focus-visible:ring-2"
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                onSubmit('');
              }}
              aria-label={t('orders.search.clear')}
              className="text-muted hover:text-foreground focus-visible:ring-focus absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg outline-none focus-visible:ring-2"
            >
              <CloseIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      <Button type="submit" variant="primary" size="md">
        {t('orders.search.submit')}
      </Button>
    </form>
  );
}
