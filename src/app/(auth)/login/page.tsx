import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    // LoginForm reads useSearchParams() (the `next` redirect target), which Next
    // requires to sit inside a Suspense boundary.
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
