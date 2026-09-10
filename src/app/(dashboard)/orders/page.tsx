import { Suspense } from 'react';
import { OrdersBoard } from '@/components/orders/orders-board';

export default function OrdersPage() {
  return (
    // The board reads useSearchParams() — the whole filter state lives there — which
    // Next requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <OrdersBoard />
    </Suspense>
  );
}
