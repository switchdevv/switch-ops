'use client';

import { useId, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useCategories, useCreateRestaurant, useUpdateRestaurant } from '@/hooks/use-restaurants';
import { pinnedRegionId } from '@/lib/auth/access';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import type { PreparedImage } from '@/lib/media/image';
import { categoryName } from '@/lib/ops/catalogue';
import { regionOutline, toLatLng, type LatLng } from '@/lib/ops/dispatch';
import {
  changedRestaurantFields,
  draftFromRestaurant,
  emptyRestaurantDraft,
  restaurantFields,
  validateRestaurantDraft,
  WEEKDAYS,
  type RestaurantDraft,
  type RestaurantField,
} from '@/lib/ops/restaurant-form';
import { parseErrorKey } from '@/lib/parse/errors';
import { restaurantHref, RESTAURANTS_PATH } from '@/lib/url/restaurant-filters';
import type { RestaurantRow } from '@/types/restaurant';
import {
  CheckboxField,
  Field,
  FormSection,
  INPUT_CLASS,
  inputBorder,
  LABEL_CLASS,
  TextAreaField,
  TextField,
} from '@/components/ui/form-controls';
import { PageHeader } from '@/components/ui/page-header';
import { SelectField } from '@/components/ui/select-field';
import { AlertIcon } from '@/components/icons';
import { ImageField } from './image-field';
import { Breadcrumbs } from './restaurant-bits';

const LocationMap = dynamic(() => import('./location-map'), {
  ssr: false,
  loading: () => <div className="bg-surface-secondary h-72 w-full animate-pulse rounded-xl sm:h-80" />,
});

const PROBLEM_KEY: Record<RestaurantField, MessageKey> = {
  name: 'catalogue.form.errors.name',
  phone: 'catalogue.form.errors.phone',
  address: 'catalogue.form.errors.address',
  region: 'catalogue.form.errors.region',
  categories: 'catalogue.form.errors.categories',
  location: 'catalogue.form.errors.location',
  openTime: 'catalogue.form.errors.time',
  closeTime: 'catalogue.form.errors.time',
  hours: 'catalogue.form.errors.hours',
  breakStart: 'catalogue.form.errors.time',
  breakEnd: 'catalogue.form.errors.time',
  breakHours: 'catalogue.form.errors.breakHours',
  workingDays: 'catalogue.form.errors.workingDays',
  commission: 'catalogue.form.errors.commission',
};

/**
 * Creating and editing a restaurant — the dashboard's Stores dialog, as a page, because it
 * is a long form with a map in it.
 *
 * On edit only the columns that changed are written (see `changedRestaurantFields`), and
 * Pause and Enable are not on the form at all: they are actions with consequences of their
 * own, on the restaurant page and the list.
 */
export function RestaurantForm({ restaurant }: { restaurant?: RestaurantRow }) {
  const { t, locale, format } = useI18n();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { role, region } = useAccess();
  const isAdmin = role === 'admin';
  const pinnedRegion = pinnedRegionId(region);
  const isCreate = !restaurant;

  // The draft the form opened with, kept so an edit can be compared against it.
  const [initialDraft] = useState<RestaurantDraft>(() =>
    restaurant ? draftFromRestaurant(restaurant) : emptyRestaurantDraft(pinnedRegion),
  );
  const [draft, setDraft] = useState<RestaurantDraft>(initialDraft);
  const [picture, setPicture] = useState<PreparedImage | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const citiesQuery = useCities();
  const categoriesQuery = useCategories();
  const createMutation = useCreateRestaurant();
  const updateMutation = useUpdateRestaurant();
  const mutation = isCreate ? createMutation : updateMutation;

  const problems = useMemo(() => validateRestaurantDraft(draft, { canSetCommission: isAdmin }), [draft, isAdmin]);
  const errorFor = (...fields: RestaurantField[]) => {
    if (!showErrors) return null;
    const field = fields.find((candidate) => problems.includes(candidate));
    return field ? t(PROBLEM_KEY[field]) : null;
  };

  const update = (patch: Partial<RestaurantDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    mutation.reset();
  };

  const city = citiesQuery.data?.find((item) => item.objectId === draft.regionId);
  const outline = useMemo(() => regionOutline(city), [city]);
  const theme = resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : null;
  const isRegionChanged = !isCreate && draft.regionId !== initialDraft.regionId;

  const save = () => {
    if (problems.length > 0) {
      setShowErrors(true);
      return;
    }
    const options = { isCreate, canSetCommission: isAdmin };
    const fields = restaurantFields(draft, options);

    if (!restaurant) {
      createMutation.mutate({ fields, picture }, { onSuccess: (id) => router.replace(restaurantHref(id)) });
      return;
    }

    const changed = changedRestaurantFields(fields, restaurantFields(initialDraft, options));
    if (Object.keys(changed).length === 0 && !picture) {
      router.push(restaurantHref(restaurant.objectId));
      return;
    }
    updateMutation.mutate(
      {
        id: restaurant.objectId,
        fields: changed,
        picture,
        previous: { picture: restaurant.picture, regionId: initialDraft.regionId },
      },
      { onSuccess: () => router.push(restaurantHref(restaurant.objectId)) },
    );
  };

  const cancelHref = restaurant ? restaurantHref(restaurant.objectId) : RESTAURANTS_PATH;

  return (
    <form
      noValidate
      className="flex flex-col gap-5 pb-24"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: t('catalogue.list.title'), href: RESTAURANTS_PATH },
            ...(restaurant
              ? [
                  { label: restaurant.name ?? t('common.none'), href: restaurantHref(restaurant.objectId) },
                  { label: t('catalogue.form.editCrumb') },
                ]
              : [{ label: t('catalogue.form.newCrumb') }]),
          ]}
        />
        <PageHeader
          eyebrow={t('catalogue.eyebrow')}
          title={restaurant ? t('catalogue.form.editTitle', { restaurant: restaurant.name ?? '' }) : t('catalogue.form.newTitle')}
          description={t(isCreate ? 'catalogue.form.newSubtitle' : 'catalogue.form.editSubtitle')}
        />
      </div>

      <FormSection title={t('catalogue.form.details')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('catalogue.form.name')}
            value={draft.name}
            onChange={(name) => update({ name })}
            error={errorFor('name')}
            isRequired
            maxLength={120}
          />
          <TextField
            label={t('catalogue.form.phone')}
            value={draft.phone}
            onChange={(phone) => update({ phone })}
            error={errorFor('phone')}
            hint={t('catalogue.form.phoneHint')}
            isRequired
            type="tel"
            inputMode="tel"
          />
          <TextField
            label={t('catalogue.form.address')}
            value={draft.address}
            onChange={(address) => update({ address })}
            error={errorFor('address')}
            isRequired
            className="sm:col-span-2"
          />
          <TextAreaField
            label={t('catalogue.form.description')}
            value={draft.description}
            onChange={(description) => update({ description })}
            className="sm:col-span-2"
            maxLength={500}
          />
        </div>
        <ImageField
          label={t('catalogue.form.picture')}
          current={restaurant?.picture}
          name={draft.name}
          value={picture}
          onChange={(value) => {
            setPicture(value);
            mutation.reset();
          }}
        />
      </FormSection>

      <FormSection title={t('catalogue.form.placement')}>
        <div className="flex flex-col gap-4">
          <SelectField
            label={t('orders.filters.region')}
            value={draft.regionId}
            isDisabled={pinnedRegion.length > 0}
            options={
              pinnedRegion
                ? [{ value: pinnedRegion, label: citiesQuery.data?.find((item) => item.objectId === pinnedRegion)?.name ?? pinnedRegion }]
                : [
                    { value: '', label: t('catalogue.form.chooseRegion') },
                    ...(citiesQuery.data ?? []).map((item) => ({ value: item.objectId, label: item.name ?? item.objectId })),
                  ]
            }
            onChange={(regionId) => update({ regionId })}
            className="sm:w-72"
          />
          {errorFor('region') && <p role="alert" className="text-micro text-danger -mt-3">{errorFor('region')}</p>}
          {pinnedRegion && <p className="text-caption text-faint -mt-2">{t('catalogue.form.regionLocked')}</p>}
          {isRegionChanged && (
            <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-1.5">
              <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t('catalogue.form.regionChanged')}
            </p>
          )}

          <Field label={t('catalogue.form.categories')} error={errorFor('categories')} isRequired>
            <div className="flex flex-wrap gap-2">
              {(categoriesQuery.data ?? [])
                .map((category) => ({ id: category.objectId, label: categoryName(category, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))
                .map((category) => {
                  const isChecked = draft.categoryIds.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className={
                        'text-body rounded-pill flex cursor-pointer items-center gap-2 border px-3 py-1.5 transition-colors ' +
                        (isChecked
                          ? 'bg-accent-soft text-accent-soft-foreground border-transparent font-bold'
                          : 'border-border/70 hover:bg-surface-secondary')
                      }
                    >
                      <input
                        type="checkbox"
                        className="accent-accent size-3.5"
                        checked={isChecked}
                        onChange={(event) =>
                          update({
                            categoryIds: event.target.checked
                              ? [...draft.categoryIds, category.id]
                              : draft.categoryIds.filter((id) => id !== category.id),
                          })
                        }
                      />
                      {category.label}
                    </label>
                  );
                })}
              {categoriesQuery.isPending && <span className="text-caption text-muted">{t('common.loading')}…</span>}
            </div>
          </Field>
        </div>
      </FormSection>

      <FormSection title={t('catalogue.form.location')} description={t('catalogue.form.locationHint')}>
        <CoordinatesField
          value={draft.location}
          error={errorFor('location')}
          onChange={(location) => update({ location })}
        />
        {theme ? (
          <LocationMap
            value={draft.location}
            onChange={(location) => update({ location })}
            regionOutline={outline}
            theme={theme}
            locale={locale}
          />
        ) : (
          <div className="bg-surface-secondary h-72 w-full rounded-xl sm:h-80" />
        )}
      </FormSection>

      <FormSection title={t('catalogue.form.hours')} description={t('catalogue.form.hoursHint')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeField
            label={t('catalogue.form.openTime')}
            value={draft.openTime}
            error={errorFor('openTime', 'hours')}
            onChange={(openTime) => update({ openTime })}
          />
          <TimeField
            label={t('catalogue.form.closeTime')}
            value={draft.closeTime}
            error={errorFor('closeTime')}
            onChange={(closeTime) => update({ closeTime })}
          />
        </div>

        <CheckboxField
          label={t('catalogue.form.hasBreak')}
          description={t('catalogue.form.hasBreakHint')}
          isChecked={draft.hasBreak}
          onChange={(hasBreak) => update({ hasBreak })}
        />
        {draft.hasBreak && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TimeField
              label={t('catalogue.form.breakStart')}
              value={draft.breakStart}
              error={errorFor('breakStart', 'breakHours')}
              onChange={(breakStart) => update({ breakStart })}
            />
            <TimeField
              label={t('catalogue.form.breakEnd')}
              value={draft.breakEnd}
              error={errorFor('breakEnd')}
              onChange={(breakEnd) => update({ breakEnd })}
            />
          </div>
        )}

        <Field label={t('catalogue.form.workingDays')} error={errorFor('workingDays')} isRequired>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const isChecked = draft.workingDays.includes(day);
              return (
                <label
                  key={day}
                  className={
                    'text-body flex min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 capitalize transition-colors ' +
                    (isChecked
                      ? 'bg-accent-soft text-accent-soft-foreground border-transparent font-bold'
                      : 'border-border/70 text-muted hover:bg-surface-secondary')
                  }
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isChecked}
                    onChange={(event) =>
                      update({
                        workingDays: event.target.checked
                          ? [...draft.workingDays, day]
                          : draft.workingDays.filter((item) => item !== day),
                      })
                    }
                  />
                  {format.weekday(day)}
                </label>
              );
            })}
          </div>
        </Field>
      </FormSection>

      <FormSection title={t('catalogue.form.visibility')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField
            label={t('catalogue.form.featured')}
            description={t('catalogue.form.featuredHint')}
            isChecked={draft.isFeatured}
            onChange={(isFeatured) => update({ isFeatured })}
          />
          {isCreate && (
            <>
              <CheckboxField
                label={t('catalogue.form.enabled')}
                description={t('catalogue.form.enabledHint')}
                isChecked={draft.enabled}
                onChange={(enabled) => update({ enabled })}
              />
              <CheckboxField
                label={t('catalogue.form.active')}
                description={t('catalogue.form.activeHint')}
                isChecked={draft.active}
                onChange={(active) => update({ active })}
              />
            </>
          )}
        </div>
      </FormSection>

      {isAdmin ? (
        <FormSection title={t('catalogue.form.commission')} description={t('catalogue.form.commissionHint')}>
          <TextField
            label={t('catalogue.form.commissionRate')}
            value={draft.commission}
            onChange={(commission) => update({ commission })}
            error={errorFor('commission')}
            isRequired
            inputMode="decimal"
            autoComplete="off"
            className="sm:w-48"
          />
          {!isCreate && draft.commission !== initialDraft.commission && (
            <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-1.5">
              <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t('catalogue.form.commissionChanged')}
            </p>
          )}
        </FormSection>
      ) : (
        isCreate && <p className="text-caption text-muted px-1">{t('catalogue.form.commissionByAdmin')}</p>
      )}

      {/* The save bar stays in reach at the foot of the screen — the form is long, and the
          error summary belongs next to the button that produced it. */}
      <div className="border-border/70 bg-background/85 sticky bottom-0 z-10 -mx-5 flex flex-col gap-2 border-t px-5 py-3 backdrop-blur-xl lg:-mx-8 lg:px-8">
        {showErrors && problems.length > 0 && (
          <p role="alert" className="text-caption text-danger flex items-center gap-1.5 font-bold">
            <AlertIcon aria-hidden className="size-3.5" />
            {t('catalogue.form.fixErrors')}
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className="text-caption text-danger flex items-center gap-1.5 font-bold">
            <AlertIcon aria-hidden className="size-3.5" />
            {t(isCreate ? 'catalogue.form.createFailed' : 'catalogue.form.saveFailed')}{' '}
            {t(parseErrorKey(mutation.error, 'catalogue'))}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" isDisabled={mutation.isPending} onPress={() => router.push(cancelHref)}>
            {t('catalogue.confirm.cancel')}
          </Button>
          <Button type="submit" variant="primary" size="md" isPending={mutation.isPending}>
            {mutation.isPending
              ? t('catalogue.actions.saving')
              : t(isCreate ? 'catalogue.form.create' : 'catalogue.form.save')}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TimeField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} error={error} isRequired>
      <input
        id={id}
        type="time"
        step={60}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${INPUT_CLASS} tabular h-9 ${inputBorder(!!error)}`}
      />
    </Field>
  );
}

/**
 * The pin as numbers, for a position copied out of Google Maps ("36.7538, 3.0588"). Kept as
 * its own text until it parses, so typing through a half-finished pair doesn't move the pin
 * on every keystroke.
 */
function CoordinatesField({
  value,
  error,
  onChange,
}: {
  value: LatLng | null;
  error: string | null;
  onChange: (value: LatLng | null) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const asText = (point: LatLng | null) => (point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : '');
  const [text, setText] = useState(() => asText(value));
  const [lastValue, setLastValue] = useState(value);
  const [isInvalid, setIsInvalid] = useState(false);
  if (lastValue !== value) {
    setLastValue(value);
    setText(asText(value));
    setIsInvalid(false);
  }

  const commit = () => {
    if (!text.trim()) return;
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
    const point = match ? toLatLng({ latitude: Number(match[1]), longitude: Number(match[2]) }) : null;
    setIsInvalid(!point);
    if (point) onChange(point);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {t('catalogue.form.coordinates')}
        <span aria-hidden className="text-danger ms-0.5">
          *
        </span>
      </label>
      <input
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
        placeholder="36.753800, 3.058800"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={isInvalid || !!error || undefined}
        className={`${INPUT_CLASS} tabular h-9 sm:w-80 ${inputBorder(isInvalid || !!error)}`}
      />
      {isInvalid ? (
        <p role="alert" className="text-micro text-danger">
          {t('catalogue.form.errors.coordinates')}
        </p>
      ) : error ? (
        <p role="alert" className="text-micro text-danger">
          {error}
        </p>
      ) : (
        <p className="text-micro text-faint">{t('catalogue.form.coordinatesHint')}</p>
      )}
    </div>
  );
}
