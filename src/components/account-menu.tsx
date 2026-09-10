'use client';

import type { ComponentType, SVGProps } from 'react';
import { Button, Popover } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useLogout } from '@/hooks/use-session';
import { initials } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { ChevronDownIcon, LogOutIcon, MailIcon, MapPinIcon, PhoneIcon } from './icons';

/**
 * The signed-in account, on click of its own avatar.
 *
 * It answers one question the board cannot: *why am I seeing these orders and not
 * others?* A staff account is confined to a single region (lib/auth/access.ts), and
 * without somewhere that says so out loud, the missing rows read as a broken filter or
 * a broken backend. So the region is stated here next to the role, in the same place
 * the profile lives, rather than only implied by a disabled dropdown in the toolbar.
 *
 * Nothing here is fetched for the occasion: the role, region, name, email and phone all
 * come off the row `useAccess` already re-reads on every page load, and the region's
 * *name* off the `City` list the board has cached since it drew its filter.
 */
export function AccountMenu({ variant }: { variant: 'card' | 'avatar' }) {
  const { t } = useI18n();
  const { role, region, account } = useAccess();
  const { data: cities } = useCities();
  const logout = useLogout();

  const username = account?.username ?? '';
  const name = account?.fullname?.trim() || username || t('nav.account');
  const roleLabel = role === 'admin' ? t('nav.admin') : t('nav.staff');

  // The unassigned case can't reach the shell — RequireAuth turns it into a screen that
  // says so, because an account with no region has no board to be shown. It is still
  // spelled out rather than folded into one of the other two: a wrong answer here would
  // be a confident label over the wrong set of orders.
  const regionName =
    region.kind === 'all'
      ? t('account.allRegions')
      : region.kind === 'single'
        ? // The city list is cached for the tab's lifetime but can still be in flight on
          // a cold load, and an objectId is not a region name — so say nothing rather
          // than something wrong, for the one frame it takes to arrive.
          (cities?.find((city) => city.objectId === region.regionId)?.name ?? t('common.loading'))
        : t('account.noRegion');

  const scopeLine =
    region.kind === 'all'
      ? t('account.scopeAll')
      : region.kind === 'single'
        ? t('account.scopeSingle', { region: regionName })
        : null;

  return (
    <Popover>
      {variant === 'card' ? (
        // The whole sidebar card is the target, not a hit-area the size of the avatar:
        // it is already shaped like a button and sits alone at the foot of the nav.
        <Popover.Trigger
          tabIndex={0}
          className="border-border/70 bg-surface-secondary/60 hover:bg-surface-tertiary focus-visible:ring-focus flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-2.5 text-start transition-colors outline-none focus-visible:ring-2"
        >
          <Initials name={name} className="size-9 rounded-xl" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-body truncate font-bold">{name}</span>
            <span className="text-micro text-muted truncate">
              {roleLabel} · {regionName}
            </span>
          </span>
          <ChevronDownIcon aria-hidden className="text-muted ms-auto size-4 shrink-0" />
        </Popover.Trigger>
      ) : (
        // Narrow screens have no sidebar, so the avatar rides in the header — where it
        // replaces the bare sign-out button that used to be the only account control.
        <Popover.Trigger
          tabIndex={0}
          aria-label={t('account.open')}
          className="focus-visible:ring-focus cursor-pointer rounded-xl outline-none focus-visible:ring-2"
        >
          <Initials name={name} className="size-8 rounded-xl" />
        </Popover.Trigger>
      )}

      <Popover.Content
        placement={variant === 'card' ? 'top start' : 'bottom end'}
        className="w-[18rem] max-w-[calc(100vw-2rem)]"
      >
        <Popover.Dialog aria-label={t('account.title')} className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <Initials name={name} className="text-body size-11 rounded-2xl" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-h6 truncate font-bold">{name}</span>
              {username && <span className="text-caption text-muted truncate">{username}</span>}
            </div>
          </div>

          <span className="bg-accent-soft text-accent-soft-foreground text-micro rounded-pill w-fit px-2.5 py-1 font-bold tracking-[0.1em] uppercase">
            {roleLabel}
          </span>

          <dl className="border-separator/70 flex flex-col gap-3 border-t pt-3.5">
            <Fact icon={MapPinIcon} label={t('account.region')} value={regionName} />
            <Fact icon={MailIcon} label={t('account.email')} value={account?.email} />
            <Fact icon={PhoneIcon} label={t('account.phone')} value={account?.phone} />
          </dl>

          {scopeLine && <p className="text-caption text-muted">{scopeLine}</p>}

          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onPress={() => logout.mutate()}
            isDisabled={logout.isPending}
          >
            <LogOutIcon className="size-4" />
            {logout.isPending ? t('nav.signingOut') : t('nav.signOut')}
          </Button>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/** The picture-less avatar. `initials()` rather than the first two characters of the
 * username, so "Yacine Ould" reads as YO and an Arabic name works the same way. */
function Initials({ name, className }: { name: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`brand-gradient text-micro grid shrink-0 place-items-center font-bold text-white uppercase ${className}`}
    >
      {initials(name)}
    </span>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string | undefined;
}) {
  const { t } = useI18n();

  return (
    <div className="flex items-start gap-2.5">
      <Icon aria-hidden className="text-faint mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col leading-tight">
        <dt className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{label}</dt>
        {/* Fields on a `_User` row are sparse — an account provisioned without a phone
            simply has none, and an empty line under a label reads as a rendering bug. */}
        <dd className="text-body truncate">{value?.trim() || t('common.none')}</dd>
      </div>
    </div>
  );
}
