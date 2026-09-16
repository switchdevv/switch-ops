'use client';

import { useId, useState, type ReactNode } from 'react';
import { Button, Modal } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { AlertIcon } from '@/components/icons';
import { INPUT_CLASS, LABEL_CLASS } from './form-controls';

/**
 * The one question a catalogue action asks before it goes.
 *
 * `confirmText`, when set, has to be typed before the button arms — kept for the actions
 * that delete more than the row on screen and can't be undone, where a dialog clicked
 * through on reflex is exactly the failure. Mount it only while open, so the typed text
 * never carries over to the next time.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel,
  isDanger,
  isPending,
  error,
  confirmText,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  isDanger?: boolean;
  isPending: boolean;
  /** A translated reason the last attempt failed. */
  error?: string | null;
  confirmText?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const isArmed = !confirmText || typed.trim() === confirmText.trim();

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isPending) onClose();
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (isArmed && !isPending) onConfirm();
            }}
          >
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              {children}

              {confirmText && (
                <div className="flex flex-col gap-1">
                  <label htmlFor={inputId} className={LABEL_CLASS}>
                    {t('catalogue.confirm.typeToConfirm', { text: confirmText })}
                  </label>
                  <input
                    id={inputId}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className={`${INPUT_CLASS} border-field-border h-9`}
                  />
                </div>
              )}

              {error && (
                <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
                  <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <p className="text-caption">{error}</p>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" size="sm" isDisabled={isPending} onPress={onClose}>
                {t('catalogue.confirm.cancel')}
              </Button>
              <Button
                type="submit"
                variant={isDanger ? 'danger' : 'primary'}
                size="sm"
                isDisabled={!isArmed}
                isPending={isPending}
              >
                {isPending ? pendingLabel : confirmLabel}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
