'use client';

import { proxima } from '@/fonts';
import { CrashScreen } from '@/components/crash-screen';
import './globals.css';

/**
 * The last boundary: an error in the root layout itself (the providers). It replaces the
 * whole document, so it brings its own <html>, <body>, fonts and stylesheet.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className={proxima.variable}>
      <body className="bg-background text-foreground font-sans antialiased">
        <CrashScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
