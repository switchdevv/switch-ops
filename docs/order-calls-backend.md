# Order call marks — Parse Dashboard setup

**Audience:** whoever administers the Parse Server behind `api.switchfood.net`.
**Status:** the console (this repo) is wired end to end. It needs **two columns on `Order`**,
added once by hand. No cloud code, no permission change, no app update.

## What the console does

Most restaurants don't run the manager app, so ops handle each new order by phone: they call
the **customer** to confirm it, then the **restaurant** to launch it, then press Confirm.
Switch Ops records both calls on the order itself — answered, or no answer, with who and
when — so every agent sees which orders still need a call, can filter on it (`/orders?calls=…`),
and can take a mark back. Marking the restaurant's call done on a placed order opens the
Confirm step. Rules in `src/lib/ops/order-calls.ts`, writes in `src/lib/services/order-calls.ts`.

## 1. Schema — add two columns

In the Parse Dashboard: **Browser → Order → Add a new column**, twice:

| Column | Type | Written by |
|---|---|---|
| `opsCustomerCall` | Object | Switch Ops only |
| `opsRestaurantCall` | Object | Switch Ops only |

Leave both optional, with no default.

**Why the console can't add them itself:** `Order`'s class permissions leave `addField` to the
master key (`switch-server/_SCHEMA.json`). Until the columns exist, marking a call fails with
Parse's 119 "Permission denied for action addField on class Order", and the console says
"Call tracking isn't set up on the server yet". The list, the chips and the filters keep
working before then; every placed order simply reads as not called.

## 2. What a column holds

```json
{
  "outcome": "done",
  "log": [
    { "outcome": "noAnswer", "at": "2026-09-17T13:30:12.000Z", "by": "<staff objectId>", "byName": "Karim" },
    { "outcome": "done",     "at": "2026-09-17T13:41:55.000Z", "by": "<staff objectId>", "byName": "Sofia" }
  ]
}
```

- `outcome` is the last entry's outcome (`done` or `noAnswer`). It is the only key the board
  queries, as a dotted key: `opsCustomerCall.outcome != "done"` means "still to call". That
  also matches an order whose column was never written.
- `log` is every mark, oldest first, capped at 20.
- Taking the only mark back **deletes** the column (`__op: Delete`) rather than setting it
  to null.

Don't edit these by hand unless you keep `outcome` equal to the last entry's outcome. The
console trusts `outcome` for both the filters and the chips, so they always agree.

## 3. Permissions — nothing to change

- `Order` already grants `update` to `role:Staff`, and orders are created by the master key
  with no ACL. So the plain save that writes a mark passes, as the console's "unassign
  driver" save already does.
- No trigger on `Order` exists in `switch-server/cloud`, and no app writes `Order` rows, so a
  mark notifies nobody and nothing overwrites it.
- Anyone signed in can read `Order` (`find` has `requiresAuthentication`). The marks, including
  the staff member's name and the time, are therefore readable by any account that reads
  orders. Nothing else is stored in them.

## Rollout

1. Add both columns (§1).
2. Deploy Switch Ops.

In the other order, marking calls fails with the setup message until step 1 is done.
Nothing else breaks.
