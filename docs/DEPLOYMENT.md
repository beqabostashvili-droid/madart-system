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
