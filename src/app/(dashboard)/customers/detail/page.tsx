import { Suspense } from 'react';
import { CustomerDetailScreen } from '@/components/customers/customer-detail-screen';

export default function CustomerDetailPage() {
  return (
    // Addressed as ?id= (the app is a static export), read with useSearchParams() — hence the Suspense boundary.
    <Suspense fallback={null}>
      <CustomerDetailScreen />
    </Suspense>
  );
}
