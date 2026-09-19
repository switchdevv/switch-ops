'use client';

import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/errors/chunk-reload';
import { DICTIONARIES } from '@/lib/i18n/dictionary';
import { detectLocale, readStoredLocale } from '@/lib/i18n/locales';
import { BrandMark } from './brand-mark';

/**
 * What the console shows instead of a screen that threw — for app/error.tsx and
 * app/global-error.tsx alike.
 *
 * Reads its words straight from the dictionaries rather than through `useI18n()`: when the
 * root layout is what crashed, the provider is gone with it.
 *
 * A stale chunk after a deploy reloads the page once on its own (lib/errors/chunk-reload.ts);
 * the screen only appears if that isn't the cause, or didn't help.
 */
export function CrashScreen({ error, retry }: { error: Error; retry: () => void }) {
  const [copy] = useState(() => DICTIONARIES[readStoredLocale() ?? detectLocale()].crash);

  // A stale chunk reloads the page on its own; the screen below shows for the moment that
  // takes, and stays when the reload was already tried.
  useEffect(() => {
    if (isChunkLoadError(error) && reloadOnceForChunkError()) return;
    console.error('[switch-ops] screen crashed', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark className="size-12" />
      <div className="max-w-prose">
        <h1 className="text-h5 font-bold">{copy.title}</h1>
        <p className="text-muted text-body mt-2">{copy.body}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onPress={retry}>
          {copy.tryAgain}
        </Button>
        <Button variant="secondary" size="sm" onPress={() => window.location.reload()}>
          {copy.reload}
        </Button>
      </div>
    </div>
  );
}
