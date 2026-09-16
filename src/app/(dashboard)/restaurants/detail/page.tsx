import { Suspense } from 'react';
import { RestaurantDetailScreen } from '@/components/restaurants/restaurant-detail-screen';

export default function RestaurantDetailPage() {
  return (
    // Addressed as ?id= (the app is a static export), read with useSearchParams() — hence the Suspense boundary.
    <Suspense fallback={null}>
      <RestaurantDetailScreen />
    </Suspense>
  );
}
