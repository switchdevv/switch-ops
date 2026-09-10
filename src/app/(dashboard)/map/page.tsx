import { Suspense } from 'react';
import { DispatchScreen } from '@/components/dispatch/dispatch-screen';

export default function MapPage() {
  return (
    // The screen reads useSearchParams() — the region and the selected pin live in the
    // URL, so a dispatcher can send someone the exact order they are looking at — and
    // Next requires that inside a Suspense boundary.
    <Suspense fallback={null}>
      <DispatchScreen />
    </Suspense>
  );
}
