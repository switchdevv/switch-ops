'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Modal, Spinner } from '@heroui/react';
import { useAssignManager, useManagerCandidate } from '@/hooks/use-restaurants';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { restaurantHref } from '@/lib/url/restaurant-filters';
import type { RestaurantRow } from '@/types/restaurant';
import { CopyValue } from '@/components/ui/copy-value';
import { INPUT_CLASS, LABEL_CLASS } from '@/components/ui/form-controls';
import { AlertIcon, UserIcon } from '@/components/icons';

/**
 * The dashboard's "Assign manager", with the lookup it never had.
 *
 * The dashboard takes a pasted user id and sends it straight to `assignManager`, which then
 * turns whatever account that is — a customer, a driver, a typo'd id belonging to someone
 * else — into the restaurant's manager, with write access to its whole menu. Here the id is
 * looked up first and the account shown, and an account that already runs another
 * restaurant is refused (see `assignRestaurantManager`).
 */
export function AssignManagerDialog({
  restaurant,
  onClose,
  onDone,
}: {
  restaurant: RestaurantRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const lookup = useManagerCandidate(lookupId);
  const assign = useAssignManager();

  const current = restaurant.manager;
  const found = lookup.data;
  const candidate = found?.candidate;
  const managesOther = !!found?.storeId && found.storeId !== restaurant.objectId;
  const isCurrent = !!candidate && candidate.objectId === current?.objectId;
  const canAssign = !!candidate && !managesOther && !isCurrent && !assign.isPending;

  const submitLookup = () => {
    assign.reset();
    setIsRemoving(false);
    setLookupId(draft.trim());
  };

  const run = (managerId: string | null, message: string) => {
    assign.mutate({ restaurantId: restaurant.objectId, managerId }, { onSuccess: () => onDone(message) });
  };

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!assign.isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !assign.isPending) onClose();
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>{t('catalogue.manager.title', { restaurant: restaurant.name ?? '' })}</Modal.Heading>
            <p className="text-caption text-muted">{t('catalogue.manager.hint')}</p>
          </Modal.Header>

          <Modal.Body className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <h3 className={LABEL_CLASS}>{t('catalogue.manager.current')}</h3>
              {current ? (
                <div className="border-border/70 bg-surface-secondary/50 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="text-body truncate font-bold">{current.fullname ?? current.username ?? t('common.none')}</p>
                    <p className="text-caption text-muted flex flex-wrap items-center gap-x-2">
                      {current.phone && <span className="tabular">{current.phone}</span>}
                      <CopyValue value={current.objectId} prefix="" label={t('orders.detail.copyId')} />
                    </p>
                  </div>
                  {!isRemoving && (
                    <Button variant="danger-soft" size="sm" isDisabled={assign.isPending} onPress={() => setIsRemoving(true)}>
                      {t('catalogue.manager.remove')}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-body text-muted">{t('catalogue.manager.none')}</p>
              )}

              {current && isRemoving && (
                <div className="border-border/70 flex flex-col gap-2 rounded-xl border p-3">
                  <p className="text-caption">
                    {t('catalogue.manager.removeHint', { name: current.fullname ?? current.username ?? '' })}
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" isDisabled={assign.isPending} onPress={() => setIsRemoving(false)}>
                      {t('catalogue.confirm.cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isPending={assign.isPending}
                      onPress={() => run(null, t('catalogue.manager.removed', { restaurant: restaurant.name ?? '' }))}
                    >
                      {t('catalogue.manager.removeConfirm')}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitLookup();
              }}
            >
              <label htmlFor={inputId} className={LABEL_CLASS}>
                {t(current ? 'catalogue.manager.replaceLabel' : 'catalogue.manager.assignLabel')}
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t('catalogue.manager.idPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${INPUT_CLASS} border-field-border tabular h-9`}
                />
                <Button type="submit" variant="secondary" size="md" isDisabled={!draft.trim()}>
                  {t('catalogue.manager.lookUp')}
                </Button>
              </div>
            </form>

            {lookupId && lookup.isPending && (
              <p className="text-caption text-muted flex items-center gap-2">
                <Spinner size="sm" />
                {t('catalogue.manager.looking')}
              </p>
            )}
            {lookupId && lookup.isError && (
              <p role="alert" className="text-caption text-danger">
                {t(parseErrorKey(lookup.error, 'fetch'))}
              </p>
            )}
            {lookupId && lookup.isSuccess && !candidate && (
              <p role="alert" className="text-caption text-danger">
                {t('catalogue.manager.notFound')}
              </p>
            )}

            {candidate && (
              <div className="border-border/70 flex flex-col gap-2.5 rounded-xl border p-3">
                <div className="flex items-center gap-3">
                  <span className="bg-accent-soft text-accent-soft-foreground grid size-9 shrink-0 place-items-center rounded-xl">
                    <UserIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-body truncate font-bold">{candidate.fullname ?? candidate.username ?? t('common.none')}</p>
                    <p className="text-caption text-muted tabular truncate">
                      {[candidate.username, candidate.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>

                {isCurrent && <Warning>{t('catalogue.manager.alreadyThis')}</Warning>}
                {managesOther && (
                  <Warning tone="danger">
                    {t('catalogue.manager.managesOther', { restaurant: found?.storeName ?? found?.storeId ?? '' })}{' '}
                    <Link href={restaurantHref(found!.storeId!)} className="underline">
                      {t('catalogue.manager.openOther')}
                    </Link>
                  </Warning>
                )}
                {candidate.enabled === false && <Warning>{t('catalogue.manager.disabledAccount')}</Warning>}
                {candidate.staffType && <Warning>{t('catalogue.manager.staffAccount')}</Warning>}
                {candidate.appType?.includes('driver') && <Warning>{t('catalogue.manager.driverAccount')}</Warning>}

                {canAssign && (
                  <p className="text-caption text-muted">{t('catalogue.manager.assignHint')}</p>
                )}
              </div>
            )}

            {assign.isError && (
              <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
                <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <p className="text-caption">{t(parseErrorKey(assign.error, 'catalogue'))}</p>
              </div>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button variant="ghost" size="sm" isDisabled={assign.isPending} onPress={onClose}>
              {t('catalogue.confirm.close')}
            </Button>
            {candidate && (
              <Button
                variant="primary"
                size="sm"
                isDisabled={!canAssign}
                isPending={assign.isPending && !isRemoving}
                onPress={() =>
                  run(
                    candidate.objectId,
                    t('catalogue.manager.assigned', {
                      name: candidate.fullname ?? candidate.username ?? '',
                      restaurant: restaurant.name ?? '',
                    }),
                  )
                }
              >
                {t('catalogue.manager.assign', { name: candidate.fullname ?? candidate.username ?? '' })}
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function Warning({ tone = 'warning', children }: { tone?: 'warning' | 'danger'; children: ReactNode }) {
  return (
    <p
      className={
        'text-caption flex items-start gap-2 rounded-lg px-2.5 py-1.5 ' +
        (tone === 'danger' ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-warning-soft text-warning-soft-foreground')
      }
    >
      <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
