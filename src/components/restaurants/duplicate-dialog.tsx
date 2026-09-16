'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Modal } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { PartialCopyError, type CopyProgress, type CopyResult } from '@/lib/services/duplicate';
import { TextField } from '@/components/ui/form-controls';
import { AlertIcon, CheckIcon } from '@/components/icons';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: CopyProgress | null }
  | { kind: 'done'; result: CopyResult }
  | { kind: 'failed'; error: unknown; partialId: string | null };

/**
 * Copying a menu or a restaurant: the new name, then progress, then what came of it.
 *
 * It stays open until the copy finishes and can't be dismissed while it runs — the copy is
 * driven from this tab, one save at a time, so closing the page would stop it part-way.
 * The outcome is shown here rather than in a banner, because it is worth reading: how
 * much was copied, which pictures weren't, and — when it stopped — where the partial copy
 * is.
 */
export function DuplicateDialog({
  title,
  hint,
  defaultName,
  nameLabel,
  extraFields,
  isNameShared,
  countsMenus,
  run,
  hrefFor,
  openLabel,
  onClose,
}: {
  title: string;
  hint: ReactNode;
  defaultName: string;
  nameLabel: string;
  /** A restaurant copy reports its menus as well as its products. */
  countsMenus?: boolean;
  /** More fields under the name — the region, for a restaurant. */
  extraFields?: ReactNode;
  /** Whether the copy may keep the source's name (a restaurant in another region may). */
  isNameShared?: (name: string) => boolean;
  run: (name: string, onProgress: (progress: CopyProgress) => void) => Promise<CopyResult>;
  /** Where the copy (or a partial one) is. */
  hrefFor: (id: string) => string;
  openLabel: string;
  onClose: () => void;
}) {
  const { t, tCount, format } = useI18n();
  const [name, setName] = useState(defaultName);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [showError, setShowError] = useState(false);
  const trimmed = name.trim();
  const isRunning = phase.kind === 'running';
  const nameProblem = !trimmed ? t('catalogue.duplicate.nameRequired') : isNameShared?.(trimmed) ? t('catalogue.duplicate.nameSame') : null;

  const start = () => {
    if (nameProblem) {
      setShowError(true);
      return;
    }
    setPhase({ kind: 'running', progress: null });
    run(trimmed, (progress) => setPhase({ kind: 'running', progress }))
      .then((result) => setPhase({ kind: 'done', result }))
      .catch((error: unknown) =>
        setPhase({
          kind: 'failed',
          error: error instanceof PartialCopyError ? error.reason : error,
          partialId: error instanceof PartialCopyError ? error.copyId : null,
        }),
      );
  };

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!isRunning}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isRunning) onClose();
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (phase.kind === 'idle') start();
            }}
          >
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              {phase.kind === 'idle' && (
                <>
                  <div className="text-body text-muted">{hint}</div>
                  <TextField
                    label={nameLabel}
                    value={name}
                    onChange={setName}
                    error={showError ? nameProblem : null}
                    isRequired
                    autoFocus
                    maxLength={120}
                  />
                  {extraFields}
                </>
              )}

              {phase.kind === 'running' && (
                <div className="flex flex-col gap-2" role="status">
                  <p className="text-body font-bold">
                    {phase.progress && phase.progress.total > 0
                      ? t('catalogue.duplicate.progress', {
                          done: format.number(phase.progress.done),
                          total: format.number(phase.progress.total),
                        })
                      : t('catalogue.duplicate.starting')}
                  </p>
                  <div className="bg-accent-soft h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-accent h-full rounded-full transition-[width]"
                      style={{
                        width: `${phase.progress && phase.progress.total > 0 ? Math.round((phase.progress.done / phase.progress.total) * 100) : 4}%`,
                      }}
                    />
                  </div>
                  <p className="text-caption text-muted">{t('catalogue.duplicate.keepOpen')}</p>
                </div>
              )}

              {phase.kind === 'done' && (
                <div className="flex flex-col gap-2">
                  <p role="status" className="bg-success-soft text-success-soft-foreground text-caption flex items-start gap-2 rounded-xl p-2.5 font-bold">
                    <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {t('catalogue.duplicate.done')}{' '}
                    {countsMenus
                      ? `${tCount('catalogue.duplicate.menus', phase.result.menus)} · ${tCount('catalogue.menus.products', phase.result.products)}`
                      : tCount('catalogue.menus.products', phase.result.products)}
                  </p>
                  {phase.result.picturesMissed > 0 && (
                    <p className="bg-warning-soft text-warning-soft-foreground text-caption flex items-start gap-2 rounded-xl p-2.5">
                      <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                      {tCount('catalogue.duplicate.picturesMissed', phase.result.picturesMissed)}
                    </p>
                  )}
                </div>
              )}

              {phase.kind === 'failed' && (
                <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
                  <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <div className="text-caption min-w-0">
                    <p className="font-bold">
                      {t(phase.partialId ? 'catalogue.duplicate.stopped' : 'catalogue.duplicate.failed')}
                    </p>
                    <p>{t(parseErrorKey(phase.error, 'catalogue'))}</p>
                    {phase.partialId && (
                      <p className="mt-1">
                        {t('catalogue.duplicate.partialHint')}{' '}
                        <Link href={hrefFor(phase.partialId)} onClick={onClose} className="font-bold underline">
                          {t('catalogue.duplicate.openPartial')}
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              {phase.kind === 'idle' && (
                <>
                  <Button variant="ghost" size="sm" onPress={onClose}>
                    {t('catalogue.confirm.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    {t('catalogue.duplicate.start')}
                  </Button>
                </>
              )}
              {isRunning && (
                <Button variant="primary" size="sm" isPending>
                  {t('catalogue.duplicate.copying')}
                </Button>
              )}
              {(phase.kind === 'done' || phase.kind === 'failed') && (
                <>
                  <Button variant="ghost" size="sm" onPress={onClose}>
                    {t('catalogue.confirm.close')}
                  </Button>
                  {phase.kind === 'done' && (
                    // Closes as it goes: a restaurant copy opens on the same route as the
                    // page this dialog sits on, which stays mounted under the new id.
                    <Link
                      href={hrefFor(phase.result.id)}
                      onClick={onClose}
                      className="text-body text-link px-2 font-bold hover:underline"
                    >
                      {openLabel}
                    </Link>
                  )}
                </>
              )}
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
