# Switch Ops access control — backend requirements

**Audience:** whoever owns the Parse Server behind `api.switchfood.net`.
**Status:** the console (this repo) is wired end to end. Everything below is still
missing on the server. It is the same design as switch-finance's
`docs/finance-access-backend.md`, for a second field, and the two are best shipped together.

## What the console does

Only two kinds of account get past the gate (`src/lib/auth/access.ts`):

| Account | Gets in? |
|---|---|
| `staffType` `Admin` (any casing), `appType` holds `staff` or `admin`, `enabled` not `false` | **Always** |
| `staffType` `Staff`, same `appType` and `enabled` rules, **`opsAccess === true`** | Yes |
| Anything else, including a `Staff` account without `opsAccess` | No — "This account can't use Switch Ops" |

Admins grant and revoke `opsAccess` on `/access`, which calls
`Parse.Cloud.run('setOpsAccess', { userId, granted })`.

`loginStaff` is unchanged and still decides who gets a session (anyone in the Staff role).
It is shared with switch-dashboard, so it can't be the place Ops access is checked; the
console re-reads the account's row on every page load and turns a staff account without the
grant away there.

## Why the client can't do this alone

`_User` rows carry an owner-only-write ACL. So an admin's browser **cannot** write
another account's row (none of the existing functions writes arbitrary fields — `editUser`
writes a fixed list), and every account **can** write its own. Hence a master-key function
(§2) and a trigger that stops an account granting itself (§3).

---

## 1. Schema

One Boolean field on `_User`:

| Field | Type | Meaning |
|---|---|---|
| `opsAccess` | Boolean | Access to Switch Ops, granted by an admin. Ignored for admins. |

The function's master-key save creates the column if the schema doesn't have it yet.

## 2. Cloud function: `setOpsAccess`

```js
Parse.Cloud.define('setOpsAccess', async (request) => {
  const { user, params } = request;
  const { userId, granted } = params;

  if (!user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Sign in first.');
  }
  if (typeof userId !== 'string' || !userId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'userId is required.');
  }
  if (typeof granted !== 'boolean') {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'granted must be a boolean.');
  }

  // The caller's current row, read with the master key — not request.user's cached fields.
  const caller = await new Parse.Query(Parse.User)
    .equalTo('objectId', user.id)
    .first({ useMasterKey: true });

  if (!caller || caller.get('enabled') === false) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Account is disabled.');
  }
  if (String(caller.get('staffType') || '').trim().toLowerCase() !== 'admin') {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Only admins can change access.');
  }

  const target = await new Parse.Query(Parse.User)
    .equalTo('objectId', userId)
    .first({ useMasterKey: true });

  if (!target) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'No such account.');
  }

  // Only the staff pool is grantable — the same predicate as the console's isStaffAccount.
  const staffType = String(target.get('staffType') || '').trim().toLowerCase();
  const appType = target.get('appType') || [];
  const isStaff =
    ['staff', 'admin'].includes(staffType) &&
    Array.isArray(appType) &&
    appType.some((type) => ['staff', 'admin'].includes(type));

  if (!isStaff) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Only staff accounts can be granted Ops access.');
  }
  // Admins have access by role; the console shows no switch for them.
  if (staffType === 'admin') {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Admins always have access.');
  }

  target.set('opsAccess', granted);
  await target.save(null, { useMasterKey: true });

  return { objectId: target.id, opsAccess: granted };
});
```

Throw `Parse.Error`s with these codes rather than this server's `CLOUD_ERRORS` strings —
the console (`src/lib/parse/errors.ts`, context `access`) reads the code:

| Code | Shown as |
|---|---|
| 119 `OPERATION_FORBIDDEN` | "Only admins can change access." |
| 141 with `Invalid function: "setOpsAccess"` | "Access changes aren't enabled on the server yet — ask the platform team to deploy `setOpsAccess`." |
| 209 `INVALID_SESSION_TOKEN` | "Your session has expired. Please sign in again." |

Until the function exists, every switch on `/access` fails with the 141 message.

## 3. `beforeSave(Parse.User)` — the actual boundary

Without this, §2 is theatre: any account can save `opsAccess: true` on its own row. If
switch-finance's trigger is already deployed, add `opsAccess` to it — there is only one
`beforeSave` per class.

```js
Parse.Cloud.beforeSave(Parse.User, async (request) => {
  if (request.master) return; // §2's save and Parse Dashboard edits

  const object = request.object;
  for (const field of ['opsAccess', 'financeAccess']) {
    if (object.dirty(field)) {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `${field} can only be changed by an admin.`);
    }
  }
  if (object.existed() && object.dirty('staffType')) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'staffType can only be changed by the platform team.');
  }
});
```

Don't add `appType`: the RN apps append to it on every login.

What this does **not** do: a staff account without the grant still has a Staff-role
session, and the platform's dashboard functions (`getUsers`, `assignDriver`, …) accept any
Staff role member. The grant keeps accounts out of the console, not out of those functions.

## 4. Rollout order

Deploying the console first locks every non-admin staff account out, with no way to grant
access from the page until §2 exists. So:

1. Deploy §2 and §3.
2. Grant the ops team — from `/access` on the currently deployed console by an admin once the
   new console is up, or ahead of it by hand in the Parse Dashboard (`_User` → `opsAccess` →
   `true`).
3. Deploy the console.

Admins are unaffected at every step.
