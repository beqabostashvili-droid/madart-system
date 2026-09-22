# Architecture

MADART Smart Ordering & Production System is a modular monorepo. Every sales
channel (Kiosk, POS, Mobile) talks to **one central API** and **one Order
Engine**. Production, dispatching and the customer display consume the same
orders through the same real-time event stream.

```
 KIOSK ─┐
 POS  ──┼──► apps/api (NestJS) ──► PostgreSQL (Prisma)
 MOBILE ┘        │  ▲
                 │  │ REST + Socket.IO
                 ▼  │
   ┌─────────────┴──┴───────────────────────────┐
   │ Production/KDS  Dispatcher  Customer Display │  Admin
   └────────────────────────────────────────────┘
```

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Domain | `packages/domain` | Pure TypeScript, zero runtime deps. Enums, state machines (order, payment, production task), scheduling engine, order-number rules, permission catalogue. Fully unit-tested. |
| Contracts | `packages/types` | Wire-level DTOs and realtime event payloads shared by API and every client. |
| Persistence | `packages/database` | Prisma schema, migrations, generated client, seed. |
| Hardware | `packages/hardware-adapters` | Adapter interfaces (payment terminal, receipt printer, cash drawer, scanners) + mock implementations. |
| Application | `apps/api` | NestJS modules: auth, branches, catalog, orders, payments, production, dispatch, realtime, catalog-import, devices, audit, health. All business rules are enforced here; the API is authoritative. |
| Clients | `apps/*` | Thin UIs over `packages/api-client`. No business decisions in clients. |
| UI Kit | `packages/ui` | Design tokens (status colours are configuration, not scattered literals), touch-first components, toast/modal system. |

## Runtime topology

* **api** – single NestJS process serving REST (`/api/v1`) and Socket.IO on the
  same port (default `4000`). Horizontal scaling is possible by switching the
  `EventBus` from `InMemoryEventBus` to `RedisEventBus` (`REDIS_URL`).
* **PostgreSQL** – system of record. Docker Compose for teams with Docker; an
  embedded PostgreSQL launcher (`pnpm db:local`) for machines without it.
* **Redis** – optional in MVP (event fan-out between API instances, rate
  limiting). The abstraction exists from day one.
* **Web apps** (Next.js): admin `3001`, dispatcher `3002`, customer-display
  `3003`, mobile-ordering `3004`.
* **Desktop apps** (Vite + React + Electron shell): kiosk `5173`, pos `5174`,
  production `5175`. In development they run in the browser; `pnpm electron`
  in each app launches the Windows full-screen shell.

## Key design decisions

1. **Single order aggregate.** `Order` has `source` (KIOSK/POS/MOBILE/…),
   `paymentMethod`, `pickupType`. Nothing else differs per channel.
2. **Payment before production.** An order enters the scheduler only on the
   `PAID` transition. See `ORDER_LIFECYCLE.md`.
3. **Backend-authoritative state transitions.** Every transition is a
   conditional `UPDATE … WHERE status = :expected` inside a transaction. A
   second concurrent START/READY/confirm is rejected as a no-op conflict, never
   applied twice.
4. **Idempotency.** Order creation and payment operations accept an
   `Idempotency-Key`. Keys are stored with the response hash; replays return the
   original result.
5. **Persisted vs derived production status.** DB stores
   `SCHEDULED | IN_PRODUCTION | READY | CANCELLED`. `STARTING_SOON`,
   `START_NOW`, `LATE` are derived from planned times and the clock, by a pure
   domain function used by both API and KDS.
6. **Multi-stage ready.** `ProductionTask` → `ProductionStep[]`. MVP creates
   exactly one step per task (the whole production time). Adding steps later
   is data, not a rewrite.
7. **External vs internal product data.** Catalog fields (names, description,
   image, price) live on `Product`/`ProductTranslation`; operational fields live
   on `ProductProductionConfig` and `ProductBranch`. The importer never touches
   the latter.
8. **Scoped realtime rooms.** Clients join `branch:{id}`,
   `branch:{id}:station:{id}`, `branch:{id}:display`, `branch:{id}:dispatch`.
   A HOT_KITCHEN screen never receives another branch's events.

## Repository layout

```
apps/
  api/               NestJS backend
  admin/             Next.js backoffice
  dispatcher/        Next.js order assembly
  customer-display/  Next.js full-screen board
  mobile-ordering/   Next.js PWA
  kiosk/             Vite+React (+Electron)
  pos/               Vite+React (+Electron)
  production/        Vite+React KDS (+Electron)
packages/
  domain/            pure business logic
  types/             shared contracts
  database/          Prisma
  api-client/        REST + socket client
  ui/                design system
  hardware-adapters/ device abstractions + mocks
  config/            shared tsconfig / eslint
docs/
tools/               dev scripts (embedded Postgres launcher)
```

See `DATABASE.md`, `ORDER_LIFECYCLE.md`, `PAYMENTS.md`,
`PRODUCTION_SCHEDULING.md`, `REALTIME_EVENTS.md`, `API.md`.
