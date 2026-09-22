# MADART Smart Ordering & Production System

One central Order Engine for every sales channel (Kiosk, POS, Mobile), a
scheduling engine that plans production backwards from the pickup time,
station-scoped kitchen displays, a dispatcher assembly screen and a real-time
customer display — all in one TypeScript monorepo.

```
KIOSK / POS / MOBILE → ORDER ENGINE → PAYMENT → SCHEDULER → KDS → DISPATCHER → CUSTOMER DISPLAY → COMPLETED
```

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm db:local        # embedded PostgreSQL (or: docker compose up -d postgres redis)
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Then open Admin http://localhost:3001 (admin@madart.local / admin123).
Full instructions, ports and logins: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

| Doc | Content |
|-----|---------|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | layers, topology, key decisions, repo layout |
| [ASSUMPTIONS](docs/ASSUMPTIONS.md) | every decision the spec left open |
| [DATABASE](docs/DATABASE.md) | domain model & schema |
| [ORDER_LIFECYCLE](docs/ORDER_LIFECYCLE.md) | order / payment state machines |
| [PAYMENTS](docs/PAYMENTS.md) | payment flows, idempotency, adapters |
| [PRODUCTION_SCHEDULING](docs/PRODUCTION_SCHEDULING.md) | planning algorithm, derived statuses |
| [REALTIME_EVENTS](docs/REALTIME_EVENTS.md) | Socket.IO rooms & events |
| [API](docs/API.md) | REST endpoints |
| [HARDWARE_INTEGRATION](docs/HARDWARE_INTEGRATION.md) | adapter interfaces |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | production deployment |
| [DEVELOPMENT](docs/DEVELOPMENT.md) | setup, commands, roadmap |
| [TESTING](docs/TESTING.md) | test strategy |

## Workspace

```
apps/       api · admin · dispatcher · customer-display · mobile-ordering · kiosk · pos · production
packages/   domain · types · database · api-client · ui · hardware-adapters · config
tools/      dev-db (embedded PostgreSQL launcher)
```
