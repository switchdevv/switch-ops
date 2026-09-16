import { Suspense } from 'react';
import { RestaurantsScreen } from '@/components/restaurants/restaurants-screen';

export default function RestaurantsPage() {
  return (
    // The list reads its filters from useSearchParams(), which Next requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <RestaurantsScreen />
    </Suspense>
  );
}
