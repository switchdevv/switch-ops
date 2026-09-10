'use client';

import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { I18nProvider } from '@/lib/i18n/provider';
import { makeQueryClient } from '@/lib/query/client';

export function Providers({ children }: { children: ReactNode }) {
  // Created via useState(() => ...), never as a module-level singleton: the App Router
  // server-renders this module on every request, and a module-level QueryClient would
  // leak one cache across requests and across users.
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/* Outside QueryClientProvider would work too, but inside is wrong: I18nProvider
          withholds its children for one frame while it resolves the language (see the
          note there), and a query client mounted below it would be torn down and
          rebuilt on that flip, losing the session read already in flight. */}
      <QueryClientProvider client={queryClient}>
        <I18nProvider>{children}</I18nProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </NextThemesProvider>
  );
}
