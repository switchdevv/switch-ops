# switch-ops

The Switch operations console: the orders board, the live dispatch map, and the drivers,
managers, restaurants, customers, support and access pages. Admins can always sign in; other
staff need an admin to give them access.

## Environments

| | Local | Staging | Production |
|---|---|---|---|
| Console | http://localhost:3020 | https://switchfood-staging-ops.web.app | https://switch-ops.web.app |
| Server | switch-server-v2 on your machine | switch-server-v2 on staging | `api.switchfood.net` |
| Data | test data | test data | **real orders, drivers and customers** |
| How it gets there | `npm run dev:local` | merge into `stg` | `npm run deploy`, by hand |

## Run it locally

You need Node 24, Docker Desktop, and the `switch-server-v2` repository next to this one, set up
once as its onboarding guide says (`docs/00-onboarding.md` there).

```bash
npm install
cd ../switch-server-v2
pnpm dev:all --only ops    # local server + test data + this console on :3020
```

Sign in as `ops` or `admin`, password `switch-dev`. If the local server is already running,
`npm run dev:local` here starts only the console.

`npm run dev` (without `:local`) talks to the **production** server. Don't use it to try things
out.

## Ship a change to staging

1. Start from an up-to-date `stg`:

   ```bash
   git switch stg && git pull
   git switch -c fix/short-description
   ```

2. Make the change and try it locally. Then run what CI runs:

   ```bash
   npm run lint
   npm run build:staging    # type check, staging build, and no production address in it
   ```

3. Push and open a pull request into `stg`:

   ```bash
   git push -u origin fix/short-description
   gh pr create --base stg --fill
   ```

   CI checks the pull request: lint, type check, the staging build, a production-address check,
   a dependency audit and a secret scan. Fix anything red and push again.

4. Merge. Every merge into `stg` deploys to staging on its own in a few minutes
   (`gh run watch`). Don't push straight to `stg`: that deploys without review.

5. Test on https://switchfood-staging-ops.web.app with the staging accounts (ask the team for
   the password).

If the change needs a server change too, ship the server to staging first (switch-server-v2's
own `stg`), then the console.

**Production** is still deployed by hand with `npm run deploy`. A pipeline from `main` will come
later; nothing deploys from `main` today.

## Good to know

- Staging's one-time setup, rollback and troubleshooting: [docs/staging.md](docs/staging.md).
- A new `NEXT_PUBLIC_*` setting needs its staging value in `.env.staging`, or the staging build
  fails.
- The map uses [OpenFreeMap](https://openfreemap.org) tiles: no key, no account.
- Code conventions and the reasons behind them: [AGENTS.md](AGENTS.md).
