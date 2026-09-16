import { Suspense } from 'react';
import { AccessScreen } from '@/components/access/access-screen';

export default function AccessPage() {
  return (
    // The list reads its filters from useSearchParams(), which Next requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <AccessScreen />
    </Suspense>
  );
}
