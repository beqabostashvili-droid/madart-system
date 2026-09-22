# Development

## Prerequisites
* Node.js ≥ 22 (tested on 24), pnpm ≥ 10
* Either Docker (recommended) **or** nothing extra – `pnpm db:local` runs an
  embedded PostgreSQL (A-08).

## First run

```bash
pnpm install
cp .env.example .env            # adjust if needed
pnpm db:local                   # terminal 1 – embedded Postgres on :5433 (skip if using Docker)
#   or: docker compose up -d postgres redis
pnpm db:migrate                 # applies Prisma migrations
pnpm db:seed                    # branch, stations, users, products, devices
pnpm dev                        # terminal 2 – API + all apps via turbo
```

| App | URL | Login |
|-----|-----|-------|
| API | http://localhost:4000/api/v1 (health: `/health`) | – |
| Admin | http://localhost:3001 | admin@madart.local / admin123 |
| Dispatcher | http://localhost:3002 | dispatcher@madart.local / dispatch123 |
| Customer display | http://localhost:3003/?token=… | device token (seed prints it) |
| Mobile ordering | http://localhost:3004 | public |
| Kiosk | http://localhost:5173/?token=… | device token |
| POS | http://localhost:5174 | cashier@madart.local / cashier123 |
| Production KDS | http://localhost:5175/?token=… | device token |

Seed prints device tokens; they are also in `.local/seed-output.json`.

## Commands
| Command | What |
|---------|------|
| `pnpm dev` | all apps in watch mode |
| `pnpm dev:api` | API only |
| `pnpm build` | build everything (packages first) |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm lint` | eslint |
| `pnpm test` | unit + integration tests (integration needs the DB) |
| `pnpm test:e2e` | end-to-end critical scenario against the API |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:reset` | drop + migrate + seed |
| `pnpm db:clean` | delete all orders/payments/tasks/audit + e2e artefacts, keep catalog & users; numbering restarts at A001 |
| `pnpm db:studio` | Prisma Studio |
| `pnpm --filter kiosk electron` | launch kiosk in Electron kiosk mode (dev server must be running) |
| `pnpm launch:kiosk` / `launch:pos` / `launch:production` | one-click Windows launcher: starts DB + API + dev server if needed, opens the Electron window |
| `pnpm shortcuts` | (re)create the Desktop shortcuts „MADART კიოსკი“, „MADART სალარო“, „MADART სამზარეულო“ with the Madart icon. Stubs + icons are copied to `%LOCALAPPDATA%\MADART\launch` because Windows .lnk targets cannot contain non-ANSI (Georgian) path characters; the launcher itself adds `%APPDATA%
pm` and `Program Files
odejs` to PATH so it works from Explorer. |

## Roadmap (spec §44)

| Phase | Scope | Status |
|-------|-------|--------|
| 1 Foundation | monorepo, DB, API, auth, branches, catalog, stations, admin basics, realtime infra | done |
| 2 Order Engine | orders, items, state machine, payments abstraction, scheduler | done (e2e tested) |
| 3 POS | cashier app, cash orders, card mock, receipt mock | done (MVP) |
| 4 Kiosk | catalog, cart, checkout, card/cash, order number, order slip | done (MVP) |
| 5 Production | tasks, scheduling, KDS, START/READY, realtime | done (MVP) |
| 6 Dispatcher + Display | assembly, ready, handover, customer display | done (MVP) |
| 7 Mobile | branch, catalog, pickup time, scheduled order, mock online payment, tracking | done (MVP, mock payment) |
| 8 Madart import | importer, preview, import, dedupe | done (snapshot source; live site needs a session) |
| 9 Hardware / payment | real terminal, printer, drawer, scanner, fiscal | blocked on provider info |

The first end-to-end demo (spec §45) spans phases 1, 2, 4, 5, 6 and is the
acceptance test `apps/api/test/e2e/critical-flow.e2e.spec.ts`. It was also
walked through manually in the browser (kiosk → KDS → dispatcher → display).

## Known gaps / next steps
* Real payment terminal, fiscal printer, cash drawer, scanners (Phase 9) – mocks today.
* Mobile online payment uses the mock provider; a real PSP needs `OnlinePaymentProvider`.
* Discounts / promo codes: schema has `discountTotal`, no UI or rules yet.
* Modifiers: supported end-to-end in the engine and kiosk, no Admin editor yet.
* Browser E2E (Playwright) for the UIs; API E2E exists.
* Electron builds are dev launchers only (`pnpm --filter kiosk electron`); no installer packaging yet.

## Conventions
* Money in tetri (integers). Times in UTC ISO strings on the wire.
* Domain logic → `packages/domain` with unit tests. No Prisma imports there.
* API modules: `controller → service → (engine) → prisma`, transitions inside
  `prisma.$transaction`.
* Never `alert()`; use `@madart/ui` toasts/modals.
* Status colours come from `packages/ui/src/tokens.ts`.
