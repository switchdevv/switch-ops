import { Suspense } from 'react';
import { EditRestaurantScreen } from '@/components/restaurants/restaurant-form-screen';

export default function EditRestaurantPage() {
  return (
    // Addressed as ?id= (the app is a static export), read with useSearchParams() — hence the Suspense boundary.
    <Suspense fallback={null}>
      <EditRestaurantScreen />
    </Suspense>
  );
}
