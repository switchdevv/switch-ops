'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { AccountMenu } from './account-menu';
import { BrandMark } from './brand-mark';
import { LanguageToggle } from './language-toggle';
import { ListIcon, MapIcon } from './icons';
import { ThemeToggle } from './theme-toggle';

type NavItem = {
  href: string;
  labelKey: MessageKey;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Fills the frame instead of sitting in the padded, max-width column the rest of the
   * console reads in. A map in a letterbox is a map you have to pan constantly, and its
   * own panel already does the job the page margins do elsewhere.
   */
  isFullBleed?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/orders', labelKey: 'nav.orders', icon: ListIcon },
  { href: '/map', labelKey: 'nav.map', icon: MapIcon, isFullBleed: true },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href));
  const isFullBleed = current?.isFullBleed ?? false;

  return (
    // A full-bleed page owns the viewport exactly: the shell stops scrolling and hands
    // the leftover height to `main`, which is what lets a map fill it and its own panel
    // scroll inside instead of the window doing it.
    <div className={isFullBleed ? 'flex h-dvh overflow-hidden' : 'flex min-h-dvh'}>
      <Sidebar pathname={pathname} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky + translucent so content scrolls under the bar rather than being cut
            off by it; the blur is what keeps the text legible while it does. */}
        <header className="border-border/70 bg-background/75 sticky top-0 z-20 border-b backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-5 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/orders" className="flex items-center gap-2 lg:hidden">
                <BrandMark className="size-8" />
              </Link>
              <span className="text-h6 text-foreground hidden truncate font-bold lg:block">
                {current ? t(current.labelKey) : t('app.title')}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <LanguageToggle />
              <ThemeToggle />
              {/* The account lives in the sidebar card on wide screens; there is no
                  sidebar below `lg`, so the same menu hangs off the header avatar. */}
              <div className="lg:hidden">
                <AccountMenu variant="avatar" />
              </div>
            </div>
          </div>

          {/* The sidebar is desktop-only, so the same destinations ride along under the
              header as a scrollable pill row on narrow screens. */}
          <nav className="flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'text-body rounded-pill flex shrink-0 items-center gap-2 px-3.5 py-2 transition-colors ' +
                    (active
                      ? 'bg-accent text-accent-foreground font-bold'
                      : 'bg-surface text-muted border-border/70 border')
                  }
                >
                  <item.icon className="size-4" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </header>

        {/* Wider than switch-finance's 7xl: the order rows carry four columns of
            people and money, and squeezing them under 1400px starts truncating names. */}
        {isFullBleed ? (
          <main className="relative flex min-h-0 flex-1">{children}</main>
        ) : (
          <main className="mx-auto w-full max-w-[92rem] flex-1 px-5 py-7 lg:px-8 lg:py-9">
            {children}
          </main>
        )}
      </div>
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const { t } = useI18n();

  return (
    <aside className="border-border/70 bg-surface/60 sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-4 py-5 backdrop-blur-xl lg:flex">
      <Link href="/orders" className="mb-8 flex items-center gap-3 px-2">
        <BrandMark className="size-9" />
        <span className="flex flex-col leading-tight">
          <span className="text-h6 font-bold">{t('app.name')}</span>
          <span className="text-micro text-muted tracking-[0.16em] uppercase">
            {t('app.suite')}
          </span>
        </span>
      </Link>

      <span className="text-micro text-muted mb-2 px-3 font-bold tracking-[0.16em] uppercase">
        {t('nav.menu')}
      </span>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                'text-body relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ' +
                (active
                  ? 'bg-accent-soft text-accent-soft-foreground font-bold'
                  : 'text-muted hover:bg-surface-secondary hover:text-foreground')
              }
            >
              {/* Active rail: absolutely positioned so it can bleed past the item's
                  padding without nudging the icon/label alignment. */}
              <span
                aria-hidden
                className={
                  'bg-accent absolute inset-y-2 -left-4 w-1 rounded-r-full transition-opacity ' +
                  (active ? 'opacity-100' : 'opacity-0')
                }
              />
              <item.icon className="size-[18px] shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Sign-out moved inside this menu with the rest of the account. It was a
          one-click icon here before, which is one click from signing yourself out of a
          board you are watching — and the profile it now sits under is the thing
          somebody actually opens this corner of the screen for. */}
      <div className="mt-auto">
        <AccountMenu variant="card" />
      </div>
    </aside>
  );
}
