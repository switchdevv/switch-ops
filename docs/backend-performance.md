# Switch Ops — backend performance

**Audience:** whoever owns the Parse Server behind `api.switchfood.net` and its MongoDB Atlas
cluster.
**Status:** the console has already been changed to stop waiting forever and to send far
fewer heavy requests (see "What the console does now" at the end). What is below is the
half only the backend can do. Start with section 1 — the indexes. It needs only Atlas and
no deploy.

## Why this matters

`api.switchfood.net` is Parse Server 4.3 on one App Engine **F1** instance class (256 MB,
600 MHz — `switch-server/app.yaml`). Three things make it stall under ordinary load:

- **Missing indexes.** `switch-server/_SCHEMA.json` shows no index on `_User.city`,
  `_User.driverActive`, `_User.appType`, `Message.createdAt`, `Message.user`, `Order.city`
  or `Order.driver`. Every query on those is a full collection scan, and on Parse 4.3 every
  non-master `count` is a real `countDocuments` scan.
- **Sub-queries over `_User`** (`matchesQuery`, as the support inbox's "Sent from" filter
  uses on `appType`). Parse 4.3 runs a sub-query with **no limit and no keys**
  (`parse-server/lib/RestQuery.js`, `replaceInQuery`): it loads **every matching account, in
  full**, into the instance's memory, then matches the rows against that list. The support
  inbox used to send one of these on *every* read, for the sender's region — it timed out,
  and the inbox came up empty. That filter is gone (the inbox has no region any more), so
  the only one left is optional and narrow.
- **A small database pool that waits forever.** The MongoDB driver (3.5.9) keeps 10
  connections and its wait queue has no timeout, and Parse has no `maxTimeMS`. A few slow
  queries fill the pool, and every other request, however small, queues behind them.

## 1. Add the indexes in MongoDB Atlas

Parse stores each class as a collection of the same name (`_User`, `Message`, `Order`), a
pointer as `_p_<field>` holding `"<Class>$<objectId>"`, and `createdAt` / `updatedAt` as
`_created_at` / `_updated_at`. The index keys below use those stored names.

**Through the Atlas UI**, for each index:

1. Atlas → your project → **Database** → the cluster → **Browse Collections**.
2. Open the database named in Parse's `databaseURI`, then the collection (`_User`,
   `Message` or `Order`).
3. **Indexes** tab → **Create Index**.
4. In **Fields**, paste the key document from the table (e.g. `{ "_p_city": 1 }`).
5. In **Options**, give it a name: `{ "name": "ops_user_city" }`. On a dedicated cluster
   (M10+), tick **Build index via rolling process** so it never locks the primary.
6. **Review → Confirm**, and wait for it to finish before starting the next.

**Or in `mongosh`** (Atlas → Connect → Shell), connected to the same database:

```js
db.getCollection('_User').createIndex({ _p_city: 1 }, { name: 'ops_user_city' })
db.getCollection('_User').createIndex({ driverActive: 1, _p_city: 1, _updated_at: -1 }, { name: 'ops_user_online_drivers' })
db.getCollection('_User').createIndex({ appType: 1, _p_city: 1 }, { name: 'ops_user_app_city' })
db.getCollection('Message').createIndex({ _created_at: -1 }, { name: 'ops_message_created' })
db.getCollection('Message').createIndex({ _p_user: 1, _created_at: -1 }, { name: 'ops_message_user_created' })
db.getCollection('Order').createIndex({ _p_city: 1, _created_at: -1 }, { name: 'ops_order_city_created' })
db.getCollection('Order').createIndex({ _p_driver: 1, _created_at: -1 }, { name: 'ops_order_driver_created' })
```

Build them **off-peak** (mornings, before the lunch rush), one at a time, `_User` first.
Each build reads the whole collection once.

| Collection | Keys | What it fixes |
|---|---|---|
| `_User` | `{ _p_city: 1 }` | The customers list's region filter |
| `_User` | `{ driverActive: 1, _p_city: 1, _updated_at: -1 }` | The live map's online drivers, read every 15 s per open map and in every Confirm step (`listOnlineDrivers`) |
| `_User` | `{ appType: 1, _p_city: 1 }` | The Drivers, Managers and Customers lists (`appType` is an array, so this is a multikey index — fine) |
| `Message` | `{ _created_at: -1 }` | The support alerts, which look for new messages every 30 s in every console; the inbox's newest-first sort; the unread count (`createdAt > …`) |
| `Message` | `{ _p_user: 1, _created_at: -1 }` | A sender's message history in the reader; the inbox searched by account id |
| `Order` | `{ _p_city: 1, _created_at: -1 }` | The orders board (list and its 8 counts every 20 s), the live map's open orders, both per region |
| `Order` | `{ _p_driver: 1, _created_at: -1 }` | The queue runner's "is this driver busy" check every 5 s; a driver's deliveries; a support message's deliveries |

**Check each one is used.** Run the query it is for with `explain` and look for an
`IXSCAN` on the new index, and `totalDocsExamined` close to `nReturned` (not the size of the
collection):

```js
// Replace the ids with real ones from the Parse Dashboard.
db.getCollection('_User').find({ _p_city: 'City$REGION_ID' }).explain('executionStats')
db.getCollection('_User').find({ driverActive: true, _p_city: 'City$REGION_ID', _updated_at: { $gt: new Date(Date.now() - 2 * 3600e3) } }).explain('executionStats')
db.getCollection('Message').find({ _created_at: { $gt: new Date(Date.now() - 86400e3) } }).sort({ _created_at: -1 }).explain('executionStats')
db.getCollection('Order').find({ _p_city: 'City$REGION_ID', _created_at: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }).explain('executionStats')
db.getCollection('Order').find({ _p_driver: { $in: ['_User$DRIVER_ID'] }, _created_at: { $gte: new Date(Date.now() - 12 * 3600e3) } }).explain('executionStats')
```

**Necessary, not sufficient.** An index makes a sub-query *find* its accounts quickly, but
Parse 4.3 still returns **every one of them, whole**, to a 256 MB instance, because a
sub-query carries no limit and no keys. Section 2 is why the support inbox no longer sends
one on every read.

## 2. The support inbox has no region — nothing to do here

This section used to specify a `Message.city` column, a `beforeSave` to stamp it, a backfill
and an index, so the inbox's region filter could be a plain indexed equality instead of a
sub-query over the sender's `city`. It is no longer needed: **the inbox has no region at
all.** Every staff account reads every message, which is how support is actually answered —
whoever is on the console replies, and a driver's message about the order in their hand
can't wait for the one dispatcher assigned to their city.

If a region ever has to come back to this inbox, this is still the shape of it: a column on
`Message`, written at save time, never a `matchesQuery` over `_User.city`.

## 3. App Engine — `switch-server/app.yaml`

| Setting | Now | Suggested | Why |
|---|---|---|---|
| `instance_class` | `F1` (256 MB, 600 MHz) | `F2` (512 MB) or `F4` (1 GB) | Parse Server, Agenda, firebase-admin, the AWS SDK and cloud code share 256 MB; one large sub-query result is enough to push it into garbage-collection stalls or past the memory limit (the instance is then killed, and every request on it fails). |
| `max_concurrent_requests` | `70` | `10`–`15` | App Engine keeps sending up to 70 requests to one instance before starting another. When that instance is stuck behind its database pool, all 70 wait with it. |
| `target_cpu_utilization` | `0.9` | `0.6` | Starts a second instance before the first is saturated, not after. |

Keep `min_instances: 1`, so there is always one warm instance.

## 4. Database options — `switch-server/index.js`

Pass `databaseOptions` to `new ParseServer({...})`:

```js
databaseOptions: {
    // A larger pool, so a few slow queries can't make every other request wait.
    poolSize: 25,
    // A server-side ceiling on any one query. Parse applies it to every operation
    // (MongoStorageAdapter). Without it, a runaway query holds a pool connection for up to
    // the driver's 6-minute socket timeout.
    maxTimeMS: 20000,
},
```

Check the Atlas tier's connection limit first: each instance opens up to `poolSize`
connections, times `max_instances` (5).

## What the console does now

For reference — none of this needs the backend, and it is already in this repo:

- Every Parse request has a deadline (`src/lib/parse/deadline.ts`): 15 s for a read, 45 s for
  a write, 120 s for an upload. Nothing waits forever any more.
- The console opens from the last verified access row instead of waiting on the network
  (`src/lib/auth/access-cache.ts`), and a service worker (`public/sw.js`) keeps its own files
  on the device, so a stalled phone connection no longer leaves a blank page.
- The live map no longer includes every dish and promo of up to 500 orders every 15 s; it
  reads them for the one open order.
- A queue-runner tick no longer re-reads the whole orders board in every open tab.
- The support unread count no longer re-runs its query each time a message is opened, or on
  every window focus.
- The support inbox sends no region sub-query at all: it reads every message, for every
  staff account, with one indexed query on `Message`.
