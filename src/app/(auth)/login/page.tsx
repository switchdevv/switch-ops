import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { FullPageLoader } from '@/components/full-page-loader';

export default function LoginPage() {
  return (
    // LoginForm reads useSearchParams() (the `next` redirect target), which Next
    // requires to sit inside a Suspense boundary. Its fallback is the loader, never
    // nothing — an empty page reads as a broken one.
    <Suspense fallback={<FullPageLoader />}>
      <LoginForm />
    </Suspense>
  );
}
