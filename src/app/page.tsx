'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FullPageLoader } from '@/components/full-page-loader';

// The dashboard route group owns the auth guard (see (dashboard)/layout.tsx), so an
// unauthenticated visitor lands here, bounces to /orders, and is redirected again to
// /login from there. No auth branching belongs at the root.
//
// The bounce is client-side rather than next/navigation's redirect(): the app is
// exported to static files (see next.config.ts) and there is no server to answer with
// a 307. The loader is what the visitor sees for the frame it takes.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/orders');
  }, [router]);

  return <FullPageLoader />;
}
