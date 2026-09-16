# switch-ops

The Switch operations console — the live view of orders for the ops team.

## Running it

```bash
npm install
cp .env.example .env.local   # already present in a fresh checkout
npm run dev                  # http://localhost:3020
```

Ports across the Switch web apps: 3000 switch-finance, 3010 switch-dashboard,
3020 switch-ops.

## Deploying

```bash
npm run deploy
```

Builds a static export into `out/` and publishes it to the `switch-ops` Firebase Hosting
site in project `switch-proj`. The site must exist first:
`firebase hosting:sites:create switch-ops`.

## What's here

- **Orders** (`/orders`) — the board: every order on the platform, newest first, with the
  pipeline, filters and a detail per row.
- **Live map** (`/map`) — the dispatch screen: every open order, its restaurant, its
  customer and every driver on one map, with the panel that assigns them.
- **Drivers** (`/drivers`) — the fleet: add a driver, edit their profile, activate or
  deactivate them, reset a password, send them a message, and see a driver's deliveries and
  cash balance for a period.
- **Support** (`/support`) — the inbox for messages sent from the customer, driver and
  restaurant apps: read them with the sender's region, apps, recent orders and earlier
  messages beside them, then call, email, reply by push notification or delete.
- **Access** (`/access`, admins only) — which staff accounts may use the console. Admins
  always can; everyone else needs an admin to switch their access on. Needs the
  `setOpsAccess` cloud function on the server first — see `docs/ops-access-backend.md`.

Everything reads the shared Parse backend from the browser; see `AGENTS.md` for the
constraints that follow from that.

## The map's tiles

The base map is [OpenFreeMap](https://openfreemap.org) — OpenStreetMap vector tiles, no
API key, no account, free for commercial use — drawn by MapLibre GL. The two style URLs
are the only place the provider is named (`src/lib/map/basemap.ts`); swapping to MapTiler,
Stadia or a self-hosted planetiler is an edit to that constant. If the tiles are
unreachable the panel keeps working, including assigning drivers.
