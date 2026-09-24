# Deployment

## Topology (single branch, MVP)

```
 Windows touch devices ── LAN ──► API host (Node 24)  ──► PostgreSQL 17
   kiosk / pos / production                        └──► Redis (optional)
 Browser screens: admin, dispatcher, customer display, mobile (public)
```

* **API**: `apps/api` → `pnpm --filter @madart/api... build` → `node apps/api/dist/main.js`.
  Or `docker compose --profile full up -d` (builds `apps/api/Dockerfile`, runs
  `prisma migrate deploy` on start).
* **Web apps**: Next.js apps build with `pnpm --filter <app> build` and run with
  `next start` (or deploy to any Node host / Vercel). Set `NEXT_PUBLIC_API_URL`.
* **Desktop apps**: Vite build + Electron. `pnpm --filter kiosk electron:build`
  produces a Windows installer via electron-builder (config in each app's
  `package.json`). Set `VITE_API_URL` at build time; the device token is
  entered once via `?token=` or the pairing screen and kept in local storage.

## Free-tier hosting recipe (every module on its own public URL)

| Piece | Service | Notes |
|---|---|---|
| PostgreSQL | **Neon** free project | pooled connection string → `DATABASE_URL`; migrate + seed from a developer machine (`pnpm db:deploy`, `SEED_PASSWORD=… pnpm db:seed`) |
| API + Socket.IO | **Render** free web service | `render.yaml` blueprint in the repo root; sleeps after 15 min idle (first request wakes it in ~30-60 s) |
| admin, dispatcher, customer-display, mobile-ordering | **Vercel** (4 projects) | root directory = `apps/<name>`, `vercel.json` sets install/build via turbo; env `NEXT_PUBLIC_API_URL` |
| kiosk, pos, production (web versions) | **Vercel** (3 static projects) | root directory = `apps/<name>`; env `VITE_API_URL` |

Live Vercel projects (team `beqabostashvilis-projects`): https://madart-admin.vercel.app ·
https://madart-dispatcher.vercel.app · https://madart-display.vercel.app ·
https://madart-mobile.vercel.app · https://madart-kiosk.vercel.app ·
https://madart-pos.vercel.app · https://madart-kitchen.vercel.app.
Redeploy any of them from the repo root: `vercel link --project <name> && vercel deploy --prod`.

Order of operations: Neon DB → Render API (needs `DATABASE_URL`, `API_PUBLIC_URL`, `JWT_SECRET`) → Vercel frontends (need the API URL) → set `CORS_ORIGINS` on Render to the 7 Vercel URLs → run `pnpm db:deploy` and seed against Neon with `SEED_PASSWORD` and the same `JWT_SECRET` as Render (device tokens are signed with it) → open the device URLs printed by the seed.

## Environment
See `.env.example`. Required in production: `DATABASE_URL`, `JWT_SECRET`
(≥32 random chars), `CORS_ORIGINS` (exact origins of the web apps),
`API_PUBLIC_URL` (used in payment callback URLs). Recommended: `REDIS_URL`
when running more than one API instance, `LOG_LEVEL=info`.

## Database
```bash
pnpm --filter @madart/database migrate:deploy   # apply migrations
pnpm --filter @madart/database seed             # first install only (creates admin)
```
Change seeded passwords immediately in Admin → Employees.

### Migrations behind a connection pooler (Neon)
`migrate deploy` takes a session advisory lock (`pg_advisory_lock(72707369)`).
Through Neon's **pooled** endpoint (`…-pooler…`, PgBouncer) that lock can be
left behind when a migration process is killed mid-run: the client disconnects
but the pooled server connection stays open, so the lock is never released and
every later deploy fails with `Error: P1002 … Timed out trying to acquire a
postgres advisory lock`. The app itself is unaffected — only migrations block.

Check with:
```sql
select l.pid, a.state from pg_locks l join pg_stat_activity a using (pid)
where l.locktype = 'advisory' and l.objid = 72707369;
```
It clears on its own once the pooler recycles that backend (~10 min idle), and
redeploying then succeeds. The durable fix is to point migrations at the
**direct** (non-pooled) Neon endpoint — same host without `-pooler` — via a
separate `DIRECT_URL`, and use `DATABASE_URL` (pooled) only for the running app.

## Kiosk desktop app (Windows)
```bash
pnpm --filter kiosk desktop     # vite build + electron-builder
```
Produces an NSIS installer and a portable exe in
`%LOCALAPPDATA%\MADART\kiosk-release`. The installer is per-user (no admin),
creates desktop and Start-menu shortcuts and ships an uninstaller. The window
runs full-screen kiosk mode; staff exit with **Ctrl+Shift+Q**, and
`KIOSK_MODE=false` starts it windowed for testing.

The API URL is baked in at build time by the `desktop:build` script
(`VITE_API_URL`, currently the Render deployment) — change it there to point a
build at a different backend. Each installed kiosk is paired once by pasting its
device token from Admin → Devices; the token is then kept locally.

Artefacts are built outside the repository because a file-system watcher on the
Desktop tree makes electron-builder's rename step fail with `EPERM`. Builds are
unsigned, so Windows SmartScreen warns on first run ("More info → Run anyway");
a code-signing certificate removes that.

## Reverse proxy
Terminate TLS in front of the API and web apps. Socket.IO needs WebSocket
upgrade headers (`Upgrade`, `Connection`) forwarded on `/rt`.

## Observability
* Structured JSON logs (`LOG_LEVEL`, `NODE_ENV=production` switches the Nest
  logger to JSON). Searchable fields: `order_id`, `public_order_number`,
  `branch_id`, `device_id`, `payment_id`, `production_task_id`, `requestId`.
* `GET /health`, `/health/database`, `/health/redis` for uptime checks.

## Backups
PostgreSQL is the only state. Nightly `pg_dump` + WAL archiving as usual;
device tokens are hashed in the DB (rotate from Admin if a device is lost).
