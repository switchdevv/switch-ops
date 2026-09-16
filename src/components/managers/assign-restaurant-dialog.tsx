'use client';

import { useId, useState } from 'react';
import { Button, Modal, Spinner } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useAssignableRestaurants, useAssignManagerRestaurant } from '@/hooks/use-managers';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import type { ManagerView } from '@/lib/ops/managers';
import { parseErrorKey } from '@/lib/parse/errors';
import type { AssignableRestaurant } from '@/lib/services/managers';
import { INPUT_CLASS, LABEL_CLASS } from '@/components/ui/form-controls';
import { DialogError, DialogWarning, Tag } from '@/components/drivers/driver-bits';
import { Thumb } from '@/components/restaurants/restaurant-bits';

/**
 * Gives a manager without a restaurant one, from the restaurants in their region — the
 * restaurant dialog's "Assign manager" seen from the other side. Picking a restaurant that
 * already has a manager says, before the button, that they lose it (and the manager app).
 */
export function AssignRestaurantDialog({
  manager,
  onClose,
  onDone,
}: {
  manager: ManagerView;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const { region } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  // A staff account's own region; otherwise the manager's, so a restaurant in another city
  // isn't handed to them by accident. An account with no region searches everywhere.
  const searchRegion = pinnedRegion || manager.row.city?.objectId || '';

  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<AssignableRestaurant | null>(null);
  const options = useAssignableRestaurants(searchRegion, query);
  const assign = useAssignManagerRestaurant();

  const name = manager.row.fullname ?? manager.row.username ?? t('common.none');
  const pickedManager = picked?.manager;
  const replaces = !!pickedManager && pickedManager.objectId !== manager.id;

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
            <Modal.Heading>{t('managers.assign.title', { manager: name })}</Modal.Heading>
            <p className="text-caption text-muted">{t('managers.assign.hint')}</p>
          </Modal.Header>

          <Modal.Body className="flex flex-col gap-3">
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPicked(null);
                assign.reset();
                setQuery(draft.trim());
              }}
            >
              <label htmlFor={inputId} className={LABEL_CLASS}>
                {t('managers.assign.search')}
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t('managers.assign.searchPlaceholder')}
                  autoComplete="off"
                  className={`${INPUT_CLASS} border-field-border h-9`}
                />
                <Button type="submit" variant="secondary" size="md">
                  {t('managers.assign.searchButton')}
                </Button>
              </div>
            </form>

            {options.isPending ? (
              <p className="text-caption text-muted flex items-center gap-2">
                <Spinner size="sm" />
                {t('common.loading')}
              </p>
            ) : options.isError ? (
              <DialogError>{t(parseErrorKey(options.error, 'fetch'))}</DialogError>
            ) : options.data.length === 0 ? (
              <p className="text-caption text-muted">{t('managers.assign.empty')}</p>
            ) : (
              <ul
                role="listbox"
                aria-label={t('managers.assign.search')}
                className="border-border/70 flex max-h-72 flex-col overflow-y-auto rounded-xl border"
              >
                {options.data.map((restaurant) => {
                  const isPicked = picked?.objectId === restaurant.objectId;
                  return (
                    <li key={restaurant.objectId} className="border-separator/70 border-b last:border-b-0">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isPicked}
                        onClick={() => {
                          assign.reset();
                          setPicked(restaurant);
                        }}
                        className={
                          'flex w-full items-center gap-3 px-3 py-2 text-start transition-colors ' +
                          (isPicked ? 'bg-accent-soft' : 'hover:bg-surface-secondary')
                        }
                      >
                        <Thumb picture={restaurant.picture} name={restaurant.name} className="size-9" />
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="text-body truncate font-bold">{restaurant.name ?? t('common.none')}</span>
                          <span className="text-caption text-muted truncate">
                            {restaurant.manager
                              ? t('managers.assign.managedBy', {
                                  name: restaurant.manager.fullname ?? restaurant.manager.username ?? restaurant.manager.objectId,
                                })
                              : t('catalogue.row.noManager')}
                          </span>
                        </span>
                        {restaurant.enabled !== true && <Tag tone="danger">{t('catalogue.state.disabled')}</Tag>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {options.data && options.data.length >= 20 && (
              <p className="text-micro text-faint">{t('managers.assign.refine')}</p>
            )}

            {picked && replaces && (
              <DialogWarning>
                {t('managers.assign.replaces', {
                  name: pickedManager?.fullname ?? pickedManager?.username ?? '',
                  restaurant: picked.name ?? '',
                })}
              </DialogWarning>
            )}
            {picked && picked.enabled !== true && <DialogWarning>{t('managers.assign.disabledRestaurant')}</DialogWarning>}

            {assign.isError && <DialogError>{t(parseErrorKey(assign.error, 'managers'))}</DialogError>}
          </Modal.Body>

          <Modal.Footer>
            <Button variant="ghost" size="sm" isDisabled={assign.isPending} onPress={onClose}>
              {t('catalogue.confirm.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              isDisabled={!picked}
              isPending={assign.isPending}
              onPress={() => {
                if (!picked) return;
                assign.mutate(
                  { id: manager.id, restaurantId: picked.objectId, pinnedRegion },
                  {
                    onSuccess: () =>
                      onDone(t('managers.assign.done', { manager: name, restaurant: picked.name ?? '' })),
                  },
                );
              }}
            >
              {picked ? t('managers.assign.confirm', { restaurant: picked.name ?? '' }) : t('managers.actions.assign')}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
