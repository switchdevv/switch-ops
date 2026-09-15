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
  "canceled by the driver" — so it is the one order change made as a plain save:
  `driver: null` on the row (the `Order` CLP grants update to `role:Staff`), then every
  queue row for the order is dropped (`unassigned`), then the driver is sent the
  platform's cancel push (`cancel` + `id`) through `sendPush`, which makes the driver app
  `hideOrder` it and go back online. If that push can't be sent, the console says to call
  the driver. Status and customer are left alone. Call in
  `lib/services/order-actions.ts`.
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
- **The live map is client-only.** MapLibre touches `window` on import, so
  `components/dispatch/dispatch-map.tsx` is loaded with `next/dynamic` + `ssr: false` and
  is the only module allowed to import `lib/map/basemap.ts`. Pins are DOM markers rendered
  through React portals, which is why they can use the palette tokens directly.
  MapLibre's own stylesheet is unlayered, so overrides for it in `globals.css` must stay
  outside every `@layer` (and beat it on specificity) to apply at all.
