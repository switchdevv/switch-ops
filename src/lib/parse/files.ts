import type { ParseFileJSON } from '@/types/parse';
import { runFunction } from './cloud';
import { getParse } from './client';

/**
 * Pictures — a restaurant's cover and a dish's photo.
 *
 * Uploads go through `Parse.File`, as switch-dashboard's `postFile` does
 * (src/api/modules/files.js). The server refuses a file from a signed-out request and
 * records every stored file in `FileObject` against the account that sent it
 * (switch-server cloud/files/files.js); `assignStoreFile` / `assignProduct` later hand that
 * record to the restaurant's manager, so the manager app can replace the picture itself.
 */

/** Stores an image and returns the file literal a row's `picture` column takes. `dataUrl`
 * is a `data:image/…;base64,` URL — see lib/media/image.ts. */
export async function uploadImage(fileName: string, dataUrl: string): Promise<ParseFileJSON> {
  const Parse = getParse();
  const file = new Parse.File(fileName, { base64: dataUrl });
  await file.save();
  return file.toJSON() as ParseFileJSON;
}

/**
 * Deletes a stored file through the platform's `deleteFile`, which a Staff-role account may
 * call for any file. Used for the picture a new upload replaced, only after the row
 * pointing at the new one has saved — so a failed save never leaves a restaurant pointing
 * at a deleted image.
 */
export async function deleteStoredFile(fileName: string): Promise<void> {
  await runFunction('deleteFile', { filename: fileName });
}
