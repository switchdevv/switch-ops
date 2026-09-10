import { findOne } from '@/lib/parse/query';
import type { SwitchUser } from '@/types/user';

const COLLECTION = '_User';

/**
 * Re-reads the signed-in account's own row — the role and region the console runs on,
 * and the profile the account menu shows.
 *
 * Still narrowed with `select`: this is a `_User` row, and there is no reason for an
 * operations console to pull an account's push token, cart or auth data across the wire.
 * Everything listed is something the shell renders or the access rule reads.
 *
 * `city` comes back as a bare pointer, and that is all that is wanted — the account
 * menu names the region from the `City` list the board has already cached, so adding an
 * `include` here would buy a second copy of a row the app is holding anyway (and Parse
 * is unreliable about `select` and `include` together — see lib/services/orders.ts).
 */
export function getAccessFor(objectId: string): Promise<SwitchUser | null> {
  return findOne<SwitchUser>(COLLECTION, [
    { equalTo: { key: 'objectId', value: objectId } },
    {
      select: [
        'username',
        'fullname',
        'email',
        'phone',
        'staffType',
        'appType',
        'enabled',
        'city',
      ],
    },
  ]);
}
