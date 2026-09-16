'use client';

import { useId, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import {
  newOptionId,
  newRowKey,
  uncoveredSupplements,
  type GroupDraft,
  type ProductDraft,
  type ProductProblem,
  type SupplementDraft,
  type VariantDraft,
} from '@/lib/ops/product-form';
import { FormSection, INPUT_CLASS, inputBorder, LABEL_CLASS } from '@/components/ui/form-controls';
import { AlertIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, PlusIcon, TrashIcon } from '@/components/icons';

/**
 * A dish's options: its supplements, the groups they are shown in, and its variants — the
 * three editors on the dashboard's product dialog.
 */

type EditorProps = {
  draft: ProductDraft;
  problems: Set<ProductProblem>;
  showErrors: boolean;
  onChange: (patch: Partial<ProductDraft>) => void;
};

function has(problems: Set<ProductProblem>, showErrors: boolean, key: string): boolean {
  return showErrors && problems.has(key);
}

/* ---- supplements ------------------------------------------------------------ */

/**
 * Removing a supplement shifts every later one up a place, so the groups are shifted with
 * them — otherwise each group below it would silently pick up its neighbour's first item.
 */
function removeSupplement(draft: ProductDraft, index: number): Partial<ProductDraft> {
  const number = index + 1;
  return {
    supplements: draft.supplements.filter((_, position) => position !== index),
    groups: draft.groups.map((group) => {
      const first = Number(group.first);
      const last = Number(group.last);
      if (!Number.isFinite(first) || !Number.isFinite(last)) return group;
      return {
        ...group,
        first: String(first > number ? first - 1 : first),
        last: String(last >= number ? last - 1 : last),
      };
    }),
  };
}

export function SupplementsEditor({
  draft,
  problems,
  showErrors,
  onChange,
  suggestions,
}: EditorProps & { suggestions: string[] }) {
  const { t } = useI18n();
  const listId = useId();

  const updateAt = (index: number, patch: Partial<SupplementDraft>) =>
    onChange({ supplements: draft.supplements.map((item, position) => (position === index ? { ...item, ...patch } : item)) });

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= draft.supplements.length) return;
    const next = [...draft.supplements];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ supplements: next });
  };

  return (
    <FormSection
      title={t('catalogue.productForm.supplements')}
      description={t('catalogue.productForm.supplementsHint')}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onPress={() => onChange({ supplements: [...draft.supplements, { id: newOptionId(), name: '', cost: '0' }] })}
        >
          <PlusIcon aria-hidden className="size-4" />
          {t('catalogue.productForm.addSupplement')}
        </Button>
      }
    >
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>

      {draft.supplements.length === 0 ? (
        <p className="text-caption text-muted">{t('catalogue.productForm.noSupplements')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {draft.supplements.map((item, index) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-muted tabular w-6 shrink-0 text-end font-bold">{index + 1}</span>
              <input
                aria-label={t('catalogue.productForm.optionName', { number: index + 1 })}
                list={listId}
                value={item.name}
                onChange={(event) => updateAt(index, { name: event.target.value })}
                placeholder={t('catalogue.productForm.supplementPlaceholder')}
                className={`${INPUT_CLASS} h-9 min-w-40 flex-1 ${inputBorder(has(problems, showErrors, `supplement.${index}.name`))}`}
              />
              <CostInput
                label={t('catalogue.productForm.optionCost', { number: index + 1 })}
                value={item.cost}
                isInvalid={has(problems, showErrors, `supplement.${index}.cost`)}
                onChange={(cost) => updateAt(index, { cost })}
              />
              <IconButton label={t('catalogue.productForm.moveUp')} isDisabled={index === 0} onPress={() => move(index, -1)}>
                <ChevronUpIcon className="size-4" />
              </IconButton>
              <IconButton
                label={t('catalogue.productForm.moveDown')}
                isDisabled={index === draft.supplements.length - 1}
                onPress={() => move(index, 1)}
              >
                <ChevronDownIcon className="size-4" />
              </IconButton>
              <IconButton label={t('catalogue.productForm.remove')} isDanger onPress={() => onChange(removeSupplement(draft, index))}>
                <TrashIcon className="size-4" />
              </IconButton>
            </li>
          ))}
        </ol>
      )}
    </FormSection>
  );
}

/* ---- groups ----------------------------------------------------------------- */

export function GroupsEditor({ draft, problems, showErrors, onChange }: EditorProps) {
  const { t } = useI18n();
  const count = draft.supplements.length;
  const uncovered = uncoveredSupplements(draft);

  const updateAt = (index: number, patch: Partial<GroupDraft>) =>
    onChange({ groups: draft.groups.map((group, position) => (position === index ? { ...group, ...patch } : group)) });

  return (
    <FormSection
      title={t('catalogue.productForm.groups')}
      description={t('catalogue.productForm.groupsHint')}
      actions={
        <Button
          variant="secondary"
          size="sm"
          isDisabled={count === 0}
          onPress={() =>
            onChange({
              groups: [
                ...draft.groups,
                { key: newRowKey(), name: '', first: '1', last: String(Math.max(1, count)), min: '', max: '' },
              ],
            })
          }
        >
          <PlusIcon aria-hidden className="size-4" />
          {t('catalogue.productForm.addGroup')}
        </Button>
      }
    >
      {draft.groups.length === 0 ? (
        <p className="text-caption text-muted">
          {t(count === 0 ? 'catalogue.productForm.noGroupsNoSupplements' : 'catalogue.productForm.noGroups')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {draft.groups.map((group, index) => {
            const rangeInvalid = has(problems, showErrors, `group.${index}.range`);
            return (
              <li key={group.key} className="border-border/70 flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={t('catalogue.productForm.groupName')}
                    value={group.name}
                    onChange={(event) => updateAt(index, { name: event.target.value })}
                    placeholder={t('catalogue.productForm.groupPlaceholder')}
                    className={`${INPUT_CLASS} h-9 flex-1 ${inputBorder(has(problems, showErrors, `group.${index}.name`))}`}
                  />
                  <IconButton
                    label={t('catalogue.productForm.remove')}
                    isDanger
                    onPress={() => onChange({ groups: draft.groups.filter((_, position) => position !== index) })}
                  >
                    <TrashIcon className="size-4" />
                  </IconButton>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <SmallNumber
                    label={t('catalogue.productForm.groupFirst')}
                    value={group.first}
                    isInvalid={rangeInvalid}
                    onChange={(first) => updateAt(index, { first })}
                  />
                  <SmallNumber
                    label={t('catalogue.productForm.groupLast')}
                    value={group.last}
                    isInvalid={rangeInvalid}
                    onChange={(last) => updateAt(index, { last })}
                  />
                  <SmallNumber
                    label={t('catalogue.productForm.groupMin')}
                    value={group.min}
                    placeholder="—"
                    isInvalid={has(problems, showErrors, `group.${index}.min`)}
                    onChange={(min) => updateAt(index, { min })}
                  />
                  <SmallNumber
                    label={t('catalogue.productForm.groupMax')}
                    value={group.max}
                    placeholder="—"
                    isInvalid={has(problems, showErrors, `group.${index}.max`)}
                    onChange={(max) => updateAt(index, { max })}
                  />
                </div>
                {rangeInvalid && (
                  <p role="alert" className="text-micro text-danger">
                    {t('catalogue.productForm.errors.groupRange', { count })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {uncovered.length > 0 && (
        <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-1.5">
          <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('catalogue.productForm.uncovered', { numbers: uncovered.join(', ') })}
        </p>
      )}
    </FormSection>
  );
}

/* ---- variants --------------------------------------------------------------- */

export function VariantsEditor({ draft, problems, showErrors, onChange }: EditorProps) {
  const { t } = useI18n();

  const updateAt = (index: number, next: VariantDraft) =>
    onChange({ variants: draft.variants.map((variant, position) => (position === index ? next : variant)) });

  return (
    <FormSection
      title={t('catalogue.productForm.variants')}
      description={t('catalogue.productForm.variantsHint')}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onPress={() =>
            onChange({
              variants: [
                ...draft.variants,
                { id: newOptionId(), name: '', options: [{ key: newRowKey(), name: '', cost: '0' }] },
              ],
            })
          }
        >
          <PlusIcon aria-hidden className="size-4" />
          {t('catalogue.productForm.addVariant')}
        </Button>
      }
    >
      {draft.variants.length === 0 ? (
        <p className="text-caption text-muted">{t('catalogue.productForm.noVariants')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {draft.variants.map((variant, index) => (
            <li key={variant.id} className="border-border/70 flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label={t('catalogue.productForm.variantName')}
                  value={variant.name}
                  onChange={(event) => updateAt(index, { ...variant, name: event.target.value })}
                  placeholder={t('catalogue.productForm.variantPlaceholder')}
                  className={`${INPUT_CLASS} h-9 flex-1 font-bold ${inputBorder(has(problems, showErrors, `variant.${index}.name`))}`}
                />
                <IconButton
                  label={t('catalogue.productForm.duplicateVariant')}
                  onPress={() =>
                    onChange({
                      variants: [
                        ...draft.variants,
                        {
                          ...variant,
                          id: newOptionId(),
                          options: variant.options.map((option) => ({ ...option, key: newRowKey() })),
                        },
                      ],
                    })
                  }
                >
                  <CopyIcon className="size-4" />
                </IconButton>
                <IconButton
                  label={t('catalogue.productForm.remove')}
                  isDanger
                  onPress={() => onChange({ variants: draft.variants.filter((_, position) => position !== index) })}
                >
                  <TrashIcon className="size-4" />
                </IconButton>
              </div>

              <ul className="flex flex-col gap-2 ps-4">
                {variant.options.map((option, optionIndex) => (
                  <li key={option.key} className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label={t('catalogue.productForm.optionName', { number: optionIndex + 1 })}
                      value={option.name}
                      onChange={(event) =>
                        updateAt(index, {
                          ...variant,
                          options: variant.options.map((item, position) =>
                            position === optionIndex ? { ...item, name: event.target.value } : item,
                          ),
                        })
                      }
                      placeholder={t('catalogue.productForm.choicePlaceholder')}
                      className={`${INPUT_CLASS} h-9 min-w-40 flex-1 ${inputBorder(has(problems, showErrors, `variant.${index}.option.${optionIndex}.name`))}`}
                    />
                    <CostInput
                      label={t('catalogue.productForm.optionCost', { number: optionIndex + 1 })}
                      value={option.cost}
                      isInvalid={has(problems, showErrors, `variant.${index}.option.${optionIndex}.cost`)}
                      onChange={(cost) =>
                        updateAt(index, {
                          ...variant,
                          options: variant.options.map((item, position) => (position === optionIndex ? { ...item, cost } : item)),
                        })
                      }
                    />
                    <IconButton
                      label={t('catalogue.productForm.remove')}
                      isDanger
                      onPress={() =>
                        updateAt(index, { ...variant, options: variant.options.filter((_, position) => position !== optionIndex) })
                      }
                    >
                      <TrashIcon className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
              <div className="ps-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    updateAt(index, { ...variant, options: [...variant.options, { key: newRowKey(), name: '', cost: '0' }] })
                  }
                >
                  <PlusIcon aria-hidden className="size-4" />
                  {t('catalogue.productForm.addChoice')}
                </Button>
              </div>
              {has(problems, showErrors, `variant.${index}.options`) && (
                <p role="alert" className="text-micro text-danger">
                  {t('catalogue.productForm.errors.variantOptions')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

/* ---- small controls ----------------------------------------------------------- */

function CostInput({
  label,
  value,
  isInvalid,
  onChange,
}: {
  label: string;
  value: string;
  isInvalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span className="relative w-28 shrink-0">
      <span aria-hidden className="text-caption text-muted pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
        +
      </span>
      <input
        aria-label={label}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} tabular h-9 ps-6 ${inputBorder(isInvalid)}`}
      />
    </span>
  );
}

function SmallNumber({
  label,
  value,
  placeholder,
  isInvalid,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  isInvalid: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex w-24 flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT_CLASS} tabular h-9 ${inputBorder(isInvalid)}`}
      />
    </div>
  );
}

function IconButton({
  label,
  isDisabled,
  isDanger,
  onPress,
  children,
}: {
  label: string;
  isDisabled?: boolean;
  isDanger?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={isDisabled}
      onClick={onPress}
      className={
        'focus-visible:ring-focus grid size-8 shrink-0 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-2 disabled:opacity-30 ' +
        (isDanger ? 'text-danger hover:bg-danger-soft' : 'text-muted hover:bg-surface-tertiary hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}
