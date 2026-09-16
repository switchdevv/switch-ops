import { Suspense } from 'react';
import { ManagersScreen } from '@/components/managers/managers-screen';

export default function ManagersPage() {
  return (
    // The list reads its filters from useSearchParams(), which Next requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <ManagersScreen />
    </Suspense>
  );
}
