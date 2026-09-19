'use client';

import { useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { useLogin, useSession } from '@/hooks/use-session';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { BrandMark } from '@/components/brand-mark';
import { FullPageLoader } from '@/components/full-page-loader';
import { LanguageToggle } from '@/components/language-toggle';

/**
 * Where to go once signed in. Anything that isn't a single-slash-rooted in-app path is
 * discarded: `next` is a query parameter, and `//evil.example` or `https://evil.example`
 * would otherwise turn this form into an open redirect that carries Switch's branding
 * right up to the moment the user leaves.
 */
function safeNext(raw: string | null): string {
  // Already decoded once by URLSearchParams — decoding again would unescape the
  // target's own nested parameters (the board's filters) and break them.
  if (!raw) return '/orders';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/orders';
}

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const { data: user, isPending: sessionPending } = useSession();
  const login = useLogin();

  // Mirror of RequireAuth's guard: an already-authenticated visitor landing here
  // (browser Back, a stale bookmark) should bounce forward, not see the form.
  useEffect(() => {
    if (!sessionPending && user) router.replace(next);
  }, [sessionPending, user, next, router]);

  // Never an empty page: while the session resolves, or while a signed-in visitor is sent
  // on — a navigation that can take a while on a slow connection — the loader shows, with
  // its way out if it takes too long.
  if (sessionPending || user) return <FullPageLoader />;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    login.mutate({ username, password }, { onSuccess: () => router.replace(next) });
  };

  return (
    <div className="w-full max-w-[26rem]">
      {/* The gradient lives on a wrapper one pixel larger than the card, so the card
          reads as having a lit rim rather than a coloured border box. It fades to the
          ordinary border colour within the first third, so only the top-left edge
          catches the brand light instead of the whole outline glowing. */}
      <div
        className="shadow-raised rounded-[calc(var(--radius-card)+1px)] p-px"
        style={{
          backgroundImage:
            'linear-gradient(145deg, var(--brand-400), var(--border) 38%, var(--border))',
        }}
      >
        <div className="bg-surface rounded-card p-8">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-4">
              <BrandMark className="size-11" />
              <div>
                <h1 className="text-h4 font-bold">
                  {t('app.name')} <span className="brand-gradient-text">{t('app.suite')}</span>
                </h1>
                <p className="text-muted text-body mt-1">{t('login.subtitle')}</p>
              </div>
            </div>
            {/* Here as well as in the shell: someone who cannot read the form cannot
                get far enough into the app to reach the shell's copy of it. */}
            <LanguageToggle />
          </div>

          <Form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <TextField name="username" isRequired fullWidth>
              <Label>{t('login.username')}</Label>
              <Input
                autoFocus
                autoComplete="username"
                placeholder={t('login.usernamePlaceholder')}
              />
              <FieldError />
            </TextField>

            <TextField name="password" isRequired fullWidth>
              <Label>{t('login.password')}</Label>
              <Input type="password" autoComplete="current-password" placeholder="••••••••" />
              <FieldError />
            </TextField>

            {login.isError && (
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Description>{t(parseErrorKey(login.error, 'login'))}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="shadow-accent mt-1"
              isDisabled={login.isPending}
              fullWidth
            >
              {login.isPending ? t('login.submitting') : t('login.submit')}
            </Button>
          </Form>
        </div>
      </div>

      <p className="text-caption text-muted mt-6 text-center">{t('login.footnote')}</p>
    </div>
  );
}
