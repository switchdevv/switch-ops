import { IMAGE_UNREADABLE } from '@/lib/parse/errors';

/**
 * A picked image, cropped and scaled in the browser before it is uploaded.
 *
 * Same treatment switch-dashboard gives every picture (src/utils/ImageUploadResize): a
 * 600 × 600 centre crop that covers the square. The apps draw restaurant covers and dish
 * photos in fixed square-ish frames, and a 4000-pixel phone photo would cost every
 * customer's data plan for nothing.
 */
export type PreparedImage = {
  /** `data:image/…;base64,…` — what `Parse.File` takes, and what an `<img>` can preview. */
  dataUrl: string;
  fileName: string;
};

const SIZE = 600;

/** The formats the dashboard accepts. */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp';

/**
 * PNG stays PNG so a logo keeps its transparent corners, and a GIF becomes PNG because a
 * canvas can't write GIF (the dashboard names those files `.gif` anyway, which is wrong).
 * Everything else is a photo and becomes JPEG.
 */
function outputType(sourceType: string): { mime: string; extension: string } {
  if (sourceType === 'image/png' || sourceType === 'image/gif') return { mime: 'image/png', extension: 'png' };
  return { mime: 'image/jpeg', extension: 'jpg' };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(IMAGE_UNREADABLE));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(IMAGE_UNREADABLE));
    image.src = source;
  });
}

/** A short random name; Parse prefixes its own unique id to whatever it is given. */
function randomName(extension: string): string {
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join('');
  return `${letters}.${extension}`;
}

/**
 * A stored picture, downloaded so it can be uploaded again as a file of its own — for a
 * copied restaurant or dish. It is already the platform's 600 × 600, so it is not redrawn.
 *
 * Pictures are served straight from the storage CDN, so this depends on that host allowing
 * the request from the browser; the caller treats a failure as "copied without a picture".
 */
export async function downloadImage(url: string): Promise<PreparedImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(IMAGE_UNREADABLE);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error(IMAGE_UNREADABLE);
  const dataUrl = await readAsDataUrl(blob);
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : 'jpg';
  return { dataUrl, fileName: randomName(extension) };
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error(IMAGE_UNREADABLE);

  const image = await loadImage(await readAsDataUrl(file));
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context || image.width === 0 || image.height === 0) throw new Error(IMAGE_UNREADABLE);

  const scale = Math.max(SIZE / image.width, SIZE / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (SIZE - width) / 2, (SIZE - height) / 2, width, height);

  const { mime, extension } = outputType(file.type);
  return { dataUrl: canvas.toDataURL(mime, 0.9), fileName: randomName(extension) };
}
