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

Everything reads the shared Parse backend from the browser; see `AGENTS.md` for the
constraints that follow from that.

## The map's tiles

The base map is [OpenFreeMap](https://openfreemap.org) — OpenStreetMap vector tiles, no
API key, no account, free for commercial use — drawn by MapLibre GL. The two style URLs
are the only place the provider is named (`src/lib/map/basemap.ts`); swapping to MapTiler,
Stadia or a self-hosted planetiler is an edit to that constant. If the tiles are
unreachable the panel keeps working, including assigning drivers.
