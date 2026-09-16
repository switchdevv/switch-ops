import { Suspense } from 'react';
import { DriversScreen } from '@/components/drivers/drivers-screen';

export default function DriversPage() {
  return (
    // The list reads its filters from useSearchParams(), which Next requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <DriversScreen />
    </Suspense>
  );
}
