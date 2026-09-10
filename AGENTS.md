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
- **The live map is client-only.** MapLibre touches `window` on import, so
  `components/dispatch/dispatch-map.tsx` is loaded with `next/dynamic` + `ssr: false` and
  is the only module allowed to import `lib/map/basemap.ts`. Pins are DOM markers rendered
  through React portals, which is why they can use the palette tokens directly.
  MapLibre's own stylesheet is unlayered, so overrides for it in `globals.css` must stay
  outside every `@layer` (and beat it on specificity) to apply at all.
