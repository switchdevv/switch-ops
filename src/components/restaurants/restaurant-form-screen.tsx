'use client';

import { useSearchParams } from 'next/navigation';
import { useRestaurant } from '@/hooks/use-restaurants';
import { CatalogueGate } from './catalogue-gate';
import { RestaurantForm } from './restaurant-form';

/** `/restaurants/new`. */
export function NewRestaurantScreen() {
  return <RestaurantForm />;
}

/** `/restaurants/edit?id=` — the form, once the row it edits has loaded. */
export function EditRestaurantScreen() {
  const id = useSearchParams().get('id') ?? '';
  const query = useRestaurant(id);
  const restaurant = query.data;

  return (
    <CatalogueGate
      status={id ? query.status : 'success'}
      error={query.error}
      exists={!!restaurant}
      regionId={restaurant?.city?.objectId}
      onRetry={() => void query.refetch()}
    >
      {/* Keyed on the id alone. The row re-reads when the tab regains focus, and keying on
          anything that changes with it would throw away whatever was being typed; the
          form compares against the draft it opened with instead. */}
      {restaurant && <RestaurantForm key={restaurant.objectId} restaurant={restaurant} />}
    </CatalogueGate>
  );
}
