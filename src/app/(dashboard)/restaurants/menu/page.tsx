import { Suspense } from 'react';
import { MenuScreen } from '@/components/restaurants/menu-screen';

export default function MenuPage() {
  return (
    // Addressed as ?id= (the app is a static export), read with useSearchParams() — hence the Suspense boundary.
    <Suspense fallback={null}>
      <MenuScreen />
    </Suspense>
  );
}
