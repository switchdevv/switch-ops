import { Suspense } from 'react';
import { SupportScreen } from '@/components/support/support-screen';

export default function SupportPage() {
  return (
    // The inbox reads its filters and the open message from useSearchParams(), which Next requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <SupportScreen />
    </Suspense>
  );
}
