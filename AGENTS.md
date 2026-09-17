<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# switch-ops

The operations console. Same Parse backend (`switchApp` @ `api.switchfood.net`) as
switch-food / switch-driver / switch-manager, switch-dashboard and switch-finance.

- **Parse is browser-only** (`src/lib/parse/client.ts` is `client-only`). There is no
  server-side data fetching, no API routes, no middleware, no dynamic `[param]` segments —
  the app is a Next static export (`output: 'export'`) on Firebase Hosting.
- **Auth is the `loginStaff` cloud function**, not `Parse.User.logIn`. It authorizes staff
  server-side and hands back a session token that `Parse.User.become` adopts. See
  `src/hooks/use-session.ts`.
- **Only admins and granted staff get in** — switch-finance's access model, for this
  console. `loginStaff` admits anyone in the Staff role (it's shared with switch-dashboard),
  so the gate re-reads the account's row on every page load: an `Admin` `staffType` always
  gets in; a `Staff` one only with `opsAccess === true`; anyone else sees "can't use Switch
  Ops". Admins grant and revoke on **`/access`** (admin-only page and nav item; admins' rows
  have no switch), which calls **`setOpsAccess`** — a cloud function that is **not on the
  server yet**, specified with its `beforeSave` guard in `docs/ops-access-backend.md`. Until
  it ships, every switch fails with "not enabled on the server yet", and deploying the
  console locks out every non-admin staff account unless `opsAccess` is set by hand in the
  Parse Dashboard first. Rule in `lib/auth/access.ts`, I/O in `lib/services/staff.ts`.
- **Every user-facing string goes through `t()`** (`src/lib/i18n`). English and French
  dictionaries are structurally identical types — adding a key to one is a type error
  until it exists in the other.
- **Money, status and label rules are transcribed, not invented.** Their sources are cited
  in comments; change them there, not at a call site.
- **Dispatch is manual.** Ops assign every delivery's driver themselves, through the
  `assignDriver` cloud function. The backend also has `chooseDriver` (an automatic
  search); it is not how this team works, so nothing here should call it.
- **Ops can confirm and edit an order.** Confirm is `acceptManager` with
  `noChoose: true` — without that flag the function itself starts `chooseDriver` for a
  delivery. The dashboard's "Don't choose a driver" question is answered manually instead:
  Confirm on a delivery lists the nearest free drivers, and picking one sends
  `assignDriver` right after the confirm ("No driver yet" confirms only). Edit is
  `editOrder` (status, canceled, and the money in `options`, merged server-side),
  switch-dashboard's edit dialog; it notifies nobody. Rules in `lib/ops/order-edit.ts`,
  calls in `lib/services/order-actions.ts`.
- **Ops can unassign a driver** from a delivery they accepted and haven't delivered
  (`canUnassignDriver`), on the board's detail and the map's alike. No cloud function
  does only that — `cancelDriver` either starts `chooseDriver` or pushes all staff
  "canceled by the driver" — so it is one of the two order changes made as a plain save:
  `driver: null` on the row (the `Order` CLP grants update to `role:Staff`), then every
  queue row for the order is dropped (`unassigned`), then the driver is sent the
  platform's cancel push (`cancel` + `id`) through `sendPush`, which makes the driver app
  `hideOrder` it and go back online. If that push can't be sent, the console says to call
  the driver. Status and customer are left alone. Call in
  `lib/services/order-actions.ts`.
- **Ops mark their two calls on a new order** — most restaurants don't run the manager app,
  so ops call the **customer** to confirm the order, then the **restaurant** to launch it,
  then Confirm. Each call is marked **done** (Confirmed / Launched) or **no answer**, with who
  and when, and the last mark can be taken back. They live on the order in two Object
  columns, `opsCustomerCall` and `opsRestaurantCall`, which **must be added in the Parse
  Dashboard** (`addField` on `Order` is master-key only; `docs/order-calls-backend.md`). Until
  then a mark fails with "not set up on the server yet", while every placed order reads as not
  called. The other plain save on an order (`Order` has no triggers, and no app writes it,
  so nobody is notified): the column is re-read first, so done is never marked twice and an
  Undo can't take back a newer mark (`CALL_CHANGED`). Taking the only mark back deletes the
  column rather than nulling it. A column is `{ outcome, log[] }`, and `outcome` is what the
  filters query (`opsCustomerCall.outcome`, a dotted key) and what the chips show, so the two
  agree. Only a **placed** order has a call due: the customer's first, then the restaurant's
  (`nextCallDue`). Calls can be marked until the food leaves (status ≤ 1). They show as two
  chips on every board row (a popover per call; their own column from `xl`), as two cards in
  the order's detail on the board and the map (compact chips once the order is confirmed),
  and as marks on the map's rows. The board filters on them (`?calls=customer|restaurant|done`,
  composed after needs-a-driver's status bound), and the pipeline counts both calls still due.
  **Marking the restaurant's call done on a placed order opens the Confirm step** — from a
  row's chip it opens the row first. The step warns about calls not marked but doesn't
  require them. Rules in `lib/ops/order-calls.ts`, I/O in `lib/services/order-calls.ts`, UI in
  `components/orders/order-calls.tsx`.
- **A pickup never gets a driver.** The customer collects it. The server's `assignDriver`
  does not check `deliveryType` (and clears `canceled` on whatever it is given), so every
  assign path here checks `isUnassignedDelivery` first. Pickups carry the ink
  `PickupBadge` (`components/ui/pickup-badge.tsx`) everywhere an order is listed — it
  marks a kind of order, not a state, so it takes no status colour.
- **The driver queue is the one automated `assignDriver` caller.** A driver carries one
  order at a time, so ops line the next ones up behind a busy driver, and the console
  sends each as soon as the driver is free. Ops still choose every driver; only the
  timing is automated. The line lives in this app's own Parse class, `DispatchQueue`
  (rules in `lib/ops/queue.ts`, I/O in `lib/services/queue.ts`), which must exist on the
  server — create it in the Parse Dashboard. It is sent by `components/queue-runner.tsx`,
  mounted in the dashboard layout: one tab per browser runs it (Web Locks; a look that hangs
  is abandoned, and a tab that hears no finished look for `RUNNER_STALL_MS` steals the lock,
  so a stuck or sleeping leader can't hold the queue), its timer lives
  in a Worker so a background tab keeps ticking, and an atomic `claim` counter stops two
  consoles sending the same order. With no console open, nothing is sent. **Only ops put
  an order in a line**: a row is sent at most once, a row whose driver took the order is
  closed (`accepted`), and a manual assign takes the order out of every line — so a
  driver who cancels hands the order back to ops as needing a driver, never to a queue.
- **Ops manage the catalogue** — restaurants (`/restaurants`), their menus (the `List`
  class, the dashboard's "Lists") and products (`Food`), plus a restaurant's manager and a
  read-only reviews list: switch-dashboard's Stores / Lists / Products / Reviews pages,
  without the finance side. Writes follow the dashboard exactly — a plain save for a
  restaurant's own columns and for Pause (`active`), and the cloud functions for the rest
  (`toggleEnableStores`, `assignManager`, `changeRegion`, `assignStoreFile`, `deleteStores`,
  `editList` / `assignList` / `deletelists`, `editProduct` / `assignProduct` /
  `deleteProducts` / `duplicateProduct`). What differs, on purpose: an edit writes only the
  columns that changed (the manager app edits the same rows); enabling/disabling re-reads
  the row first, because `toggleEnableStores` flips rather than sets; deleting a menu or a
  restaurant also deletes its products, which neither function does; a manager is looked
  up before being assigned, and an account that already runs another restaurant is
  refused; close must be after open. `Restaurant.fee` is the commission switch-finance
  bills on, so it is **admin-only** here (a staff-created restaurant starts at
  `DEFAULT_COMMISSION_RATE`, 0, and admins see "No commission"), and so is **deleting a
  restaurant**. Every page is paginated with its filters in the URL, and a staff account
  only sees its own region — the list is pinned where the URL is read, and a restaurant,
  menu or product in another region answers as not found (`CatalogueGate`). **Duplicating
  a menu or a restaurant** has no cloud function (only `duplicateProduct` exists), so it is
  built from plain saves in `lib/services/duplicate.ts`: pictures are downloaded from the
  storage CDN and uploaded as new files (never shared — deleting a dish deletes its file;
  a picture the CDN won't serve to the browser is skipped and counted), rows are created
  oldest first to keep the customer app's order, a restaurant copy starts disabled with no
  manager, and a copy that fails part-way is kept and linked rather than rolled back. Rules in
  `lib/ops/restaurant-form.ts` and `lib/ops/product-form.ts`, I/O in
  `lib/services/{restaurants,menus,products,reviews}.ts`.
- **Ops manage drivers** (`/drivers`) — switch-dashboard's Users page filtered to the driver
  app. A driver is a `_User` whose `appType` holds 'driver'. Writes go only through the cloud
  functions (`addUser`, `editUser`, `toggleEnableUsers`, `sendPush`), because a `_User` row
  is owner-only to a Staff session. **Active means `enabled === true`**: `beforeLogin` and
  `assignDriver` both refuse without it; `driverActive` is only the driver's own GO switch.
  `toggleEnableUsers` *flips*, so the row is re-read and the call refused unless it is still
  in the state ops saw (`DRIVER_STATE_CHANGED`). Deactivating drops that driver's
  `DispatchQueue` rows (`driverDisabled`) so their orders need a driver again, and the map's
  online-drivers query filters on `enabled` so a deactivated driver who taps GO can't show as
  available. It does **not** sign them out — a password reset through `editUser` is the only
  sign-out (Parse revokes every session on a password change). Staff and admin accounts (a
  `staffType`, or `appType` staff/admin) are refused by every write, because `editUser`
  always writes `staffType` and would strip it. `editUser` is sent the fresh row's `appType`
  (a driver who is also a customer keeps 'food'), and `email` only comes from `getUsers` —
  Parse hides it from a session read — narrowed to the form's fields before it reaches the
  cache. **None of these functions check region or admin**, so a staff account is confined
  here, before each call, and a driver outside its region answers as not found. The list
  reads the whole fleet in scope (up to 1000) and searches, counts and pages in the browser;
  "delivering" and "queued" come from the map's own open-orders and queue reads. A driver's
  cash balance is the dashboard's per-driver formula, counted from status 2. Rules in
  `lib/ops/{drivers,driver-form,driver-settlement}.ts`, I/O in `lib/services/drivers.ts`.
- **Ops manage customers** (`/customers`) — switch-dashboard's Users page for the customer
  app: a `_User` whose `appType` holds 'food'. The list pages on the server (search by name,
  phone, username, id; region, status, sort in the URL). `_User`'s protectedFields hide
  `email`, `cartFood`, `promosUsed` and `favorites` from a session read, so the detail page
  and every form read the account through `getUsers` (master key), narrowed at the boundary
  (arrays to counts, `authData` to provider names), and an **email search goes through
  `getUsers` too**. The page shows profile, cart / promo / favourite counts, order tallies,
  saved addresses and the order history as the board's own expandable rows. Writes are
  `addUser` / `editUser` / `toggleEnableUsers` / `deleteUsers`, guarded here because none
  checks region or role: staff never see or touch a staff-tagged account (admins may, and
  `editUser` is sent the fresh row's `appType` **and** `staffType` so neither is stripped);
  nobody changes their own account; toggle re-reads first (it flips); **delete is
  admin-only and refused for an account with `managerStore`** — `deleteUsers` would delete
  the restaurant, and `toggleEnableUsers` cascades to it (the dialog names it). A password
  reset is the only sign-out. Rules in `lib/ops/{customers,customer-form}.ts` (phone/email
  rules imported from `driver-form.ts`), I/O in `lib/services/customers.ts`.
- **Ops manage restaurant managers** (`/managers`) — built like Drivers (whole list in scope
  read at once, searched/counted/paged in the browser, staff pinned to their region, staff
  and admin accounts refused, form and password rules from `driver-form.ts`). A manager is a
  `_User` whose `appType` holds 'manager'; the manager app only opens with a phone **and** a
  `managerStore`, so status is running / no restaurant / deactivated. Restaurant links are
  `assignManager` only: Assign is offered to an account with no `managerStore` (whoever
  managed that restaurant loses it — the dialog names them); Remove (no `managerId`) also
  takes 'manager' out of `appType`, so the account leaves the list, and is refused unless the
  restaurant still names this account — on a restaurant that moved on it would unlink the
  *other* manager. **`toggleEnableUsers` on a manager also sets their restaurant's and every
  dish's `enabled`** (not the menus'), so both confirm dialogs say so. Rules in
  `lib/ops/managers.ts`, I/O in `lib/services/managers.ts`.
- **Ops answer support** (`/support`) — switch-dashboard's Support page as an inbox: the
  `Message` rows the Support screens of switch-food, switch-driver and switch-manager save.
  A row is `user`, `fullname`, `email`, `phone`, `message` and nothing else — no region, no
  status — and its ACL is the author's (plus public read), so a Staff session can read or
  delete it and **never update it**. Hence: a message's region is its **sender's `city`**
  (matched through `user` with `matchesQuery`, the same rule the server's `afterSave` uses to
  notify staff), and **read/unread is per account, per browser** in localStorage
  (`hooks/use-support-read-marks.ts`) — the screen says so. Delete is `deleteMessages`; reply
  is `sendPush` to the sender's account with the app ops pick (a message doesn't record which
  app it came from). Neither function checks region, so the message is re-read inside the
  staff account's region before each. Account-deletion requests are recognised by the text
  switch-food's Settings prefills. The included `_User` is narrowed at the boundary. Rules in
  `lib/ops/support.ts`, I/O in `lib/services/support.ts`.
- **Support is how ops and drivers talk while a delivery runs**, and the screen is built
  around that: a driver writes what the order really came to ("1600", "he added a dish"),
  ops correct the order and say so. What follows from it:
  - **An account is read as one role, work apps first.** `SENDER_APPS` is ordered
    `driver, manager, food` and `senderAppOf` takes the first the account holds — nearly
    every driver has also ordered dinner, so a row saying "Customer · Driver" said nothing
    about anybody. That order decides the list row's label, the reader's first tag and the
    app a reply is sent to.
  - **A driver's message is read beside their deliveries** (`listSenderDeliveries`,
    `components/support/sender-deliveries.tsx`): their orders up to the message's own
    `createdAt`, newest first, with the money on each and the gap to the message. Anchored
    on the message rather than on now, so it reads the same an hour later — and it claims
    nothing about *which* order was in hand, because `Order` carries no accepted-at,
    collected-at or delivered-at column and `updatedAt` moves on the very edit ops are about
    to make. **Edit opens the board's own dialog in place** (`EditOrderDialog` is exported
    from `components/orders/order-actions.tsx` for this), because correcting a total is what
    the message is asking for. Their orders *as a customer* sit last and disappear when
    there are none.
  - **Replying is a box under the message**, not a dialog (`reply-composer.tsx`): Enter
    sends, `R` jumps to it, and the three answers ops send all evening fill the box rather
    than sending — a push cannot be taken back. The push carries `screen: 'Support'` and a
    `button`, which all three apps turn into a card button that opens their own Support
    form, so the answer comes back as the next `Message`. That title, that button and those
    quick answers are in the **recipient's** language (`replyCopyFor`, from `_User.language`
    — 'ar' as often as not), never the console's, for the same reason the driver pushes in
    `lib/services/notify.ts` keep their own copy table. Nothing records what was sent: a push
    leaves no trace on the message and no other console can see it, so the composer shows
    only the last reply sent from this screen. A shared thread would need a class of its own
    on the server.
  - From `lg` the reader **scrolls inside itself** under its sticky top: with an answer box,
    deliveries and history it is taller than the screen, and a sticky panel taller than the
    viewport can only be read by scrolling the list to its end.
- **Ops are told when support writes** — the console raises the alert itself. There is no
  web push here: the server sends every staff push (orders *and* support) to the single
  `_User.pushToken.staff` slot that switch-dashboard writes on each load, so ops would take
  the dashboard's notifications and receive order pushes with them; a background push can't
  be silently dropped either. `components/support-alerts.tsx` is mounted in the dashboard
  layout beside the queue runner and, while any tab is open, looks for new `Message` rows
  every 30 s — one tab per browser (a Web Lock, **stolen on focus**, so the tab someone is
  using is the one that alerts, and the one allowed to play a sound), beating from a worker
  (`lib/worker-ticker.ts`). It walks forward from a cursor of the newest `createdAt` it has
  seen, shared between tabs through localStorage, so nothing is missed on a reload, nothing
  repeats when leadership moves, and a clock that is minutes out can't skip a message; a
  cursor older than ten minutes means the console was shut, and its backlog stays in the
  bell rather than arriving as a burst. Region and read state are decided in the browser
  (`isInScope` / `isUnread`), which keeps the tick to a few `Message` rows instead of the
  `_User`-by-city subquery the inbox pays for. It announces with a toast, the dashboard's
  own `alert.mp3` and, when the tab isn't focused, a desktop notification; sound and
  notifications are switched per browser from the bell. The **bell** in the shell header
  (`components/support/support-bell.tsx`) is the unread inbox, not a second log: it shares
  the inbox's own unread query and its per-account read marks, so opening a message anywhere
  empties it. Moving to push later is specified in `docs/support-push-notifications.md`.
- **The live map gives its height to the orders.** Its Live switch and region filter are
  portalled into the shell's header through `PageToolbar` (`components/page-toolbar.tsx`),
  not stacked in the panel; below `lg` that header row is the page's, so language and theme
  move into the avatar's account menu on every page. The panel keeps one strip of three
  numbers above the search and tabs, and its footnotes sit after the last row. From `lg` the
  panel sits beside the map; below it, it is `DispatchSheet`, a bottom sheet with three stops
  (peek = the numbers, half, full) dragged or tapped by its grab bar, whose settled height
  feeds the map's framing padding and `--ops-map-inset-bottom` (attribution, legend, loading
  card). The map wrapper is `isolate`: pins carry z-indexes up to 90, which otherwise paint
  over the sheet.
- **The maps are client-only.** MapLibre touches `window` on import, so
  `components/dispatch/dispatch-map.tsx` and the restaurant form's
  `components/restaurants/location-map.tsx` are loaded with `next/dynamic` + `ssr: false`,
  and they are the only modules allowed to import `lib/map/basemap.ts`. Pins are DOM markers rendered
  through React portals, which is why they can use the palette tokens directly.
  MapLibre's own stylesheet is unlayered, so overrides for it in `globals.css` must stay
  outside every `@layer` (and beat it on specificity) to apply at all.
