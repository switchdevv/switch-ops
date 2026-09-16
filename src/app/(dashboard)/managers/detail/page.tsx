import { Suspense } from 'react';
import { ManagerDetailScreen } from '@/components/managers/manager-detail-screen';

export default function ManagerDetailPage() {
  return (
    // Addressed as ?id= (the app is a static export), read with useSearchParams() — hence the Suspense boundary.
    <Suspense fallback={null}>
      <ManagerDetailScreen />
    </Suspense>
  );
}
