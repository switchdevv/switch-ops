import type { ParseDateJSON, ParsePointer } from '@/types/parse';
import { getParse } from './client';

/**
 * The write half of the Parse layer for plain object saves — kept apart from query.ts so a
 * module that only reads cannot acquire the ability to write by importing a helper.
 *
 * The dispatch queue writes this way: `DispatchQueue` is this console's own class with
 * nothing behind it, so a save is the whole operation. Everything ops does *to an order*
 * goes through a cloud function (see cloud.ts), because those functions do more than write
 * the row — with one exception, unassigning a driver, which no function does on its own
 * (see `unassignDriver` in lib/services/order-actions.ts).
 *
 * These go through the SDK's REST controller rather than `Parse.Object#save`, for one
 * reason: the claim counter. After an `increment`, `save()` reports a value either way —
 * the server's, if the server echoed it, or its own guess of `1` if it didn't — and the two
 * cannot be told apart. A claim decided on a guess is two consoles dispatching the same
 * order. The raw response says which it is. The session token is attached by the
 * controller itself, exactly as it is for every other request this app makes.
 */

type Body = Record<string, unknown>;

function rest() {
  return getParse().CoreManager.getRESTController();
}

/** The signed-in account's objectId, or undefined before sign-in. */
export function currentUserId(): string | undefined {
  return getParse().User.current()?.id;
}

/** Who may see and change a row, as Parse's REST ACL JSON. */
export type AclSpec = {
  /** Readable by anyone the class permissions let in. */
  publicRead?: boolean;
  /** A Parse role that may read and write it, e.g. 'Staff'. */
  role?: string;
  /**
   * One account that may read and change the row — the driver a queue row belongs to.
   *
   * The class permissions decide who Parse lets near the class at all (`DispatchQueue` grants
   * its rows' own driver through a pointer permission on `driver`), but the row's ACL is
   * checked as well and has to name the account. Setting the permission without this leaves
   * every write from the driver app rejected.
   */
  userWrite?: string;
};

/**
 * The signed-in account can always read and write what it created; the spec adds to that.
 * Same shape switch-dashboard gives a restaurant (src/api/modules/objects.js `post`).
 */
function aclJSON(spec: AclSpec): Record<string, { read?: boolean; write?: boolean }> {
  const acl: Record<string, { read?: boolean; write?: boolean }> = {};
  const userId = currentUserId();
  if (userId) acl[userId] = { read: true, write: true };
  if (spec.publicRead) acl['*'] = { read: true };
  if (spec.role) acl[`role:${spec.role}`] = { read: true, write: true };
  if (spec.userWrite) acl[spec.userWrite] = { read: true, write: true };
  return acl;
}

/** Creates a row and returns its new objectId. */
export async function createObject(className: string, fields: Body, acl?: AclSpec): Promise<string> {
  const body = acl ? { ...fields, ACL: aclJSON(acl) } : fields;
  const response = (await rest().request('POST', `classes/${className}`, body)) as { objectId: string };
  return response.objectId;
}

/**
 * Writes fields onto an existing row and returns the server's response — `updatedAt`, plus
 * the resulting value of any atomic operation in `fields` that the server chose to echo.
 */
export async function updateObject(
  className: string,
  objectId: string,
  fields: Body,
  acl?: AclSpec,
): Promise<Body> {
  const body = acl ? { ...fields, ACL: aclJSON(acl) } : fields;
  return (await rest().request('PUT', `classes/${className}/${objectId}`, body)) as Body;
}

/* ---- REST literals ------------------------------------------------------------ */

export function dateField(date: Date): ParseDateJSON {
  return { __type: 'Date', iso: date.toISOString() };
}

export function pointerField<ClassName extends string>(
  className: ClassName,
  objectId: string,
): ParsePointer<ClassName> {
  return { __type: 'Pointer', className, objectId };
}

export function incrementField(amount = 1) {
  return { __op: 'Increment', amount };
}

/** Clears a field. */
export function deleteField() {
  return { __op: 'Delete' };
}
