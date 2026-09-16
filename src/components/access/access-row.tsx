'use client';

import { useState } from 'react';
import { Switch } from '@heroui/react';
import { useSetOpsAccess } from '@/hooks/use-staff';
import { opsGrantOf } from '@/lib/auth/access';
import { initials, splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import type { SwitchUser } from '@/types/user';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { Tag } from '@/components/restaurants/restaurant-bits';
import { MapPinIcon, PhoneIcon } from '@/components/icons';

/**
 * One staff account on /access: who it is, and its Ops access — the one control on the
 * page that writes.
 *
 * An admin's row has no switch. Admins have the console by role, which `opsAccess` doesn't
 * govern, so a switch there would visibly do nothing — and it also means the admin looking
 * at the page can never switch themselves out of it. A failed toggle is explained under
 * its own row, like every other row action in the console.
 */
export function AccessRow({
  account,
  regionName,
  isSelf,
}: {
  account: SwitchUser;
  regionName: string | undefined;
  isSelf: boolean;
}) {
  const { t } = useI18n();
  const setAccess = useSetOpsAccess();
  // Optimistic only while the request is out: on failure it snaps back, so the switch never
  // rests in a position the server didn't agree to. On success the cached row already
  // holds the new value (see useSetOpsAccess), so letting go of this doesn't flicker.
  const [pending, setPending] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<NoticeValue | null>(null);

  const grant = opsGrantOf(account);
  const granted = pending ?? grant === 'granted';
  const name = account.fullname?.trim() || account.username || t('common.none');
  const phone = splitPhones(account.phone)[0];

  const toggle = (next: boolean) => {
    setPending(next);
    setNotice(null);
    setAccess.mutate(
      { userId: account.objectId, granted: next },
      {
        onError: (error) => setNotice({ kind: 'error', title: t(parseErrorKey(error, 'access')) }),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <li className="border-separator/70 flex flex-col gap-2 border-b px-3 py-3 last:border-b-0 sm:px-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <span
          aria-hidden
          className="bg-accent-soft text-accent-soft-foreground text-caption grid size-10 shrink-0 place-items-center rounded-full font-bold uppercase"
        >
          {initials(name)}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-body truncate font-bold">{name}</span>
            {isSelf && <Tag tone="accent">{t('access.row.you')}</Tag>}
            {grant === 'admin' && <Tag tone="accent">{t('nav.admin')}</Tag>}
            {/* A grant outlives a deactivation — it is there again when the account is
                switched back on — but the admin should see that it can't sign in today.
                `!== true`, as `beforeLogin` reads it. */}
            {account.enabled !== true && <Tag tone="danger">{t('access.row.deactivated')}</Tag>}
          </div>

          <div className="text-caption text-muted flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            {account.username && <span className="truncate">@{account.username}</span>}
            {phone && (
              <span className="tabular inline-flex items-center gap-1 whitespace-nowrap">
                <PhoneIcon aria-hidden className="size-3.5" />
                {phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <MapPinIcon aria-hidden className="size-3.5" />
              {regionName ?? t('access.row.noRegion')}
            </span>
          </div>
        </div>

        <div className="shrink-0">
          {grant === 'admin' ? (
            <span className="text-caption text-muted">
              {t('access.row.always')}
              <span className="sr-only"> — {t('access.row.alwaysHint')}</span>
            </span>
          ) : (
            <Switch
              isSelected={granted}
              onChange={toggle}
              isDisabled={setAccess.isPending}
              aria-label={t('access.row.toggle', { name })}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
              <span className="text-caption hidden min-w-[5.5rem] sm:inline">
                {granted ? t('access.row.granted') : t('access.row.notGranted')}
              </span>
            </Switch>
          )}
        </div>
      </div>

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
    </li>
  );
}
