import type { Metadata } from 'next';
import { proxima } from '@/fonts';
import { en } from '@/lib/i18n/dictionaries/en';
import { Providers } from './providers';
import './globals.css';

// Static metadata, so English. The document title is the one string the language
// switcher cannot reach: it is baked into the exported HTML, and the tab is read
// before the app has decided which language it is in. `lang` on <html> below is
// corrected at runtime by I18nProvider, which is the half that matters for
// screen readers and browser translation.
export const metadata: Metadata = {
  title: en.app.title,
  description: en.app.description,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the `class`
    // attribute on this element before hydration to avoid a light/dark flash, which
    // would otherwise trip React's hydration mismatch warning on this one attribute.
    <html lang="en" suppressHydrationWarning className={proxima.variable}>
      <body className="bg-background text-foreground font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
