'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useMenu } from '@/hooks/use-menus';
import { useCreateProduct, useProduct, useSupplementSuggestions, useUpdateProduct } from '@/hooks/use-products';
import { useI18n } from '@/lib/i18n/provider';
import type { PreparedImage } from '@/lib/media/image';
import { parseAmount } from '@/lib/ops/order-edit';
import {
  changedProductFields,
  draftFromProduct,
  emptyProductDraft,
  productFields,
  validateProductDraft,
  type ProductDraft,
} from '@/lib/ops/product-form';
import { parseErrorKey } from '@/lib/parse/errors';
import { menuHref, restaurantHref, RESTAURANTS_PATH } from '@/lib/url/restaurant-filters';
import type { MenuWithRestaurant, Product } from '@/types/restaurant';
import { AmountField, CheckboxField, FormSection, TextAreaField, TextField } from '@/components/ui/form-controls';
import { PageHeader } from '@/components/ui/page-header';
import { AlertIcon } from '@/components/icons';
import { CatalogueGate } from './catalogue-gate';
import { ImageField } from './image-field';
import { GroupsEditor, SupplementsEditor, VariantsEditor } from './product-options-editor';
import { Breadcrumbs } from './restaurant-bits';

/**
 * `/restaurants/product?menu=…[&id=…]` — a new dish in a menu, or an existing one.
 *
 * An id that belongs to a dish in another menu is answered as not found: the menu in the
 * URL is what the page names and where Save returns to, and a mismatch is a hand-edited
 * link rather than something to guess the meaning of.
 */
export function ProductFormScreen() {
  const params = useSearchParams();
  const menuId = params.get('menu') ?? '';
  const productId = params.get('id') ?? '';
  const menuQuery = useMenu(menuId);
  const productQuery = useProduct(productId);
  const menu = menuQuery.data;
  const product = productQuery.data;

  const status =
    !menuId || (menuQuery.status === 'success' && (!productId || productQuery.status === 'success'))
      ? 'success'
      : menuQuery.status === 'error' || productQuery.status === 'error'
        ? 'error'
        : 'pending';
  const exists = !!menu?.restaurant && (!productId || product?.list?.objectId === menu.objectId);

  return (
    <CatalogueGate
      status={status}
      error={menuQuery.error ?? productQuery.error}
      exists={exists}
      regionId={menu?.restaurant?.city?.objectId}
      onRetry={() => {
        void menuQuery.refetch();
        if (productId) void productQuery.refetch();
      }}
    >
      {menu && exists && <ProductForm key={productId || 'new'} menu={menu} product={product ?? undefined} />}
    </CatalogueGate>
  );
}

function ProductForm({ menu, product }: { menu: MenuWithRestaurant; product?: Product }) {
  const { t, format } = useI18n();
  const router = useRouter();
  const restaurant = menu.restaurant!;
  const currency = restaurant.city?.currency;
  const isCreate = !product;

  const [initialDraft] = useState<ProductDraft>(() => (product ? draftFromProduct(product) : emptyProductDraft()));
  const [draft, setDraft] = useState<ProductDraft>(initialDraft);
  const [picture, setPicture] = useState<PreparedImage | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const suggestions = useSupplementSuggestions();
  const create = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const mutation = isCreate ? create : updateMutation;

  const problems = useMemo(() => validateProductDraft(draft), [draft]);
  const show = (key: string, message: string) => (showErrors && problems.has(key) ? message : null);

  const update = (patch: Partial<ProductDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    mutation.reset();
  };

  const price = parseAmount(draft.price);
  const discount = draft.discountPrice.trim() ? parseAmount(draft.discountPrice) : null;
  const charged = price !== null && discount !== null && discount > 0 && discount < price ? discount : price;
  const backHref = menuHref(menu.objectId);

  const save = () => {
    if (problems.size > 0) {
      setShowErrors(true);
      return;
    }
    const fields = productFields(draft);
    if (!product) {
      create.mutate(
        {
          place: { menuId: menu.objectId, restaurantId: restaurant.objectId, regionId: restaurant.city?.objectId ?? '' },
          fields,
          picture,
        },
        { onSuccess: () => router.push(backHref) },
      );
      return;
    }
    const changed = changedProductFields(fields, productFields(initialDraft));
    updateMutation.mutate(
      {
        id: product.objectId,
        restaurantId: restaurant.objectId,
        fields: changed,
        picture,
        previousPicture: picture ? (product.picture?.name ?? null) : null,
      },
      { onSuccess: () => router.push(backHref) },
    );
  };

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
            { label: restaurant.name ?? t('common.none'), href: restaurantHref(restaurant.objectId) },
            { label: menu.name ?? t('common.none'), href: backHref },
            { label: product ? (product.name ?? t('common.none')) : t('catalogue.productForm.newCrumb') },
          ]}
        />
        <PageHeader
          eyebrow={t('catalogue.products.eyebrow', { restaurant: restaurant.name ?? '' })}
          title={product ? t('catalogue.productForm.editTitle', { product: product.name ?? '' }) : t('catalogue.productForm.newTitle')}
          description={t('catalogue.productForm.subtitle', { menu: menu.name ?? '' })}
        />
      </div>

      <FormSection title={t('catalogue.form.details')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('catalogue.productForm.name')}
            value={draft.name}
            onChange={(name) => update({ name })}
            error={show('name', t('catalogue.productForm.errors.name'))}
            isRequired
            maxLength={120}
            className="sm:col-span-2"
          />
          <TextAreaField
            label={t('catalogue.form.description')}
            value={draft.description}
            onChange={(description) => update({ description })}
            className="sm:col-span-2"
            maxLength={500}
          />
          <AmountField
            label={t('catalogue.productForm.price')}
            value={draft.price}
            onChange={(value) => update({ price: value })}
            error={show('price', t('catalogue.productForm.errors.price'))}
            hint={charged !== null ? t('catalogue.productForm.charged', { amount: format.money(charged, currency) }) : undefined}
            isRequired
          />
          <AmountField
            label={t('catalogue.productForm.discountPrice')}
            value={draft.discountPrice}
            onChange={(value) => update({ discountPrice: value })}
            error={show('discount', t('catalogue.productForm.errors.discount'))}
            hint={t('catalogue.productForm.discountHint')}
          />
        </div>
        <ImageField
          label={t('catalogue.form.picture')}
          current={product?.picture}
          name={draft.name}
          value={picture}
          onChange={(value) => {
            setPicture(value);
            mutation.reset();
          }}
        />
        <CheckboxField
          label={t('catalogue.form.enabled')}
          description={t('catalogue.productForm.enabledHint')}
          isChecked={draft.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </FormSection>

      <SupplementsEditor
        draft={draft}
        problems={problems}
        showErrors={showErrors}
        onChange={update}
        suggestions={suggestions.data ?? []}
      />
      <GroupsEditor draft={draft} problems={problems} showErrors={showErrors} onChange={update} />
      <VariantsEditor draft={draft} problems={problems} showErrors={showErrors} onChange={update} />

      <div className="border-border/70 bg-background/85 sticky bottom-0 z-10 -mx-5 flex flex-col gap-2 border-t px-5 py-3 backdrop-blur-xl lg:-mx-8 lg:px-8">
        {showErrors && problems.size > 0 && (
          <p role="alert" className="text-caption text-danger flex items-center gap-1.5 font-bold">
            <AlertIcon aria-hidden className="size-3.5" />
            {t('catalogue.form.fixErrors')}
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className="text-caption text-danger flex items-center gap-1.5 font-bold">
            <AlertIcon aria-hidden className="size-3.5" />
            {t(isCreate ? 'catalogue.productForm.createFailed' : 'catalogue.form.saveFailed')}{' '}
            {t(parseErrorKey(mutation.error, 'catalogue'))}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" isDisabled={mutation.isPending} onPress={() => router.push(backHref)}>
            {t('catalogue.confirm.cancel')}
          </Button>
          <Button type="submit" variant="primary" size="md" isPending={mutation.isPending}>
            {mutation.isPending
              ? t('catalogue.actions.saving')
              : t(isCreate ? 'catalogue.productForm.create' : 'catalogue.form.save')}
          </Button>
        </div>
      </div>
    </form>
  );
}
