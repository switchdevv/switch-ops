import { Suspense } from 'react';
import { CustomersScreen } from '@/components/customers/customers-screen';

export default function CustomersPage() {
  return (
    // The list reads its filters from useSearchParams(), which Next requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <CustomersScreen />
    </Suspense>
  );
}
