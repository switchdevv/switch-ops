import { Suspense } from 'react';
import { DriverDetailScreen } from '@/components/drivers/driver-detail-screen';

export default function DriverDetailPage() {
  return (
    // Addressed as ?id= (the app is a static export), read with useSearchParams() — hence the Suspense boundary.
    <Suspense fallback={null}>
      <DriverDetailScreen />
    </Suspense>
  );
}
