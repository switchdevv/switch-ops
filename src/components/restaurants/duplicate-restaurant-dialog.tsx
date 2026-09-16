'use client';

import { useState } from 'react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useDuplicateRestaurant } from '@/hooks/use-restaurants';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import { restaurantHref } from '@/lib/url/restaurant-filters';
import type { RestaurantRow } from '@/types/restaurant';
import { SelectField } from '@/components/ui/select-field';
import { DuplicateDialog } from './duplicate-dialog';

/**
 * Copying a restaurant with its menus and products — for a second branch, most often.
 *
 * An admin picks the region the copy goes to, which is how a chain opens in another city;
 * a staff account copies within its own. The copy keeps the original's name only in
 * another region: two identically named restaurants side by side in one region are
 * indistinguishable to customers and to ops.
 */
export function DuplicateRestaurantDialog({ restaurant, onClose }: { restaurant: RestaurantRow; onClose: () => void }) {
  const { t } = useI18n();
  const { region } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const citiesQuery = useCities();
  const duplicate = useDuplicateRestaurant();
  const sourceRegion = restaurant.city?.objectId ?? '';
  const [regionId, setRegionId] = useState(pinnedRegion || sourceRegion);
  const name = restaurant.name ?? '';

  const regionOptions = pinnedRegion
    ? [{ value: pinnedRegion, label: citiesQuery.data?.find((city) => city.objectId === pinnedRegion)?.name ?? pinnedRegion }]
    : (citiesQuery.data ?? []).map((city) => ({ value: city.objectId, label: city.name ?? city.objectId }));

  return (
    <DuplicateDialog
      title={t('catalogue.duplicate.restaurantTitle', { restaurant: name })}
      hint={
        <div className="flex flex-col gap-1.5">
          <p>{t('catalogue.duplicate.restaurantHint')}</p>
          <p className="text-caption">{t('catalogue.duplicate.restaurantNotCopied')}</p>
        </div>
      }
      nameLabel={t('catalogue.form.name')}
      defaultName={t('catalogue.duplicate.copyName', { name })}
      isNameShared={(copyName) => regionId === sourceRegion && copyName === name.trim()}
      countsMenus
      extraFields={
        <div className="flex flex-col gap-1">
          <SelectField
            label={t('orders.filters.region')}
            value={regionId}
            options={regionOptions}
            isDisabled={pinnedRegion.length > 0}
            onChange={setRegionId}
          />
          {regionId !== sourceRegion && (
            <p className="text-caption text-warning-soft-foreground">{t('catalogue.duplicate.otherRegion')}</p>
          )}
        </div>
      }
      run={(copyName, onProgress) =>
        duplicate.mutateAsync({ restaurantId: restaurant.objectId, name: copyName, regionId, onProgress })
      }
      hrefFor={(id) => restaurantHref(id)}
      openLabel={t('catalogue.duplicate.openRestaurant')}
      onClose={onClose}
    />
  );
}
