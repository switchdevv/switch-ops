'use client';

import { CrashScreen } from '@/components/crash-screen';

/**
 * Any page that throws — while rendering or in an effect — lands here instead of taking the
 * whole console down to Next's bare error card. See components/crash-screen.tsx.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <CrashScreen error={error} retry={retry} />;
}
