'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { ACCEPTED_IMAGE_TYPES, prepareImage, type PreparedImage } from '@/lib/media/image';
import { parseErrorKey } from '@/lib/parse/errors';
import type { ParseFileJSON } from '@/types/parse';
import { LABEL_CLASS } from '@/components/ui/form-controls';
import { ImageIcon } from '@/components/icons';
import { Thumb } from './restaurant-bits';

/**
 * A picture for a restaurant or a dish. The file is cropped and scaled as soon as it is
 * picked (lib/media/image.ts) and only uploaded when the form saves, so a picture chosen and
 * then abandoned never reaches the server.
 */
export function ImageField({
  label,
  hint,
  current,
  name,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  /** The picture on the row now. */
  current?: ParseFileJSON | null;
  name?: string;
  /** A new picture waiting to be uploaded. */
  value: PreparedImage | null;
  onChange: (value: PreparedImage | null) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setIsReading(true);
    try {
      onChange(await prepareImage(file));
    } catch (reason) {
      setError(t(parseErrorKey(reason, 'catalogue')));
    } finally {
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className={LABEL_CLASS}>{label}</span>
      <div className="flex items-center gap-3">
        <Thumb picture={current} previewUrl={value?.dataUrl} name={name} className="size-20 rounded-2xl" />
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              onChange={(event) => void pick(event.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" isPending={isReading} onPress={() => inputRef.current?.click()}>
              <ImageIcon aria-hidden className="size-4" />
              {t(current || value ? 'catalogue.image.change' : 'catalogue.image.choose')}
            </Button>
            {value && (
              <Button variant="ghost" size="sm" onPress={() => onChange(null)}>
                {t('catalogue.image.undo')}
              </Button>
            )}
          </div>
          {error ? (
            <p role="alert" className="text-micro text-danger">
              {error}
            </p>
          ) : (
            <p className="text-micro text-faint">{value ? t('catalogue.image.pending') : (hint ?? t('catalogue.image.hint'))}</p>
          )}
        </div>
      </div>
    </div>
  );
}
