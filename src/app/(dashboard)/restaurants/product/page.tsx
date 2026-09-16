import { Suspense } from 'react';
import { ProductFormScreen } from '@/components/restaurants/product-form';

export default function ProductPage() {
  return (
    // Addressed as ?menu=&id= (the app is a static export), read with useSearchParams() — hence the Suspense boundary.
    <Suspense fallback={null}>
      <ProductFormScreen />
    </Suspense>
  );
}
