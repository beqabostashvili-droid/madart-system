# Testing

| Level | Where | Runner | Needs |
|---|---|---|---|
| Unit – domain | `packages/domain/src/**/*.test.ts` | vitest | nothing |
| Unit – adapters | `packages/hardware-adapters/src/*.test.ts` | vitest | nothing |
| Integration / E2E – API | `apps/api/test/e2e/*.e2e.spec.ts` | vitest + supertest + socket.io-client against a real Nest app | migrated + seeded PostgreSQL (`DATABASE_URL`) |

```bash
pnpm test          # unit tests in every package (+ api unit tests)
pnpm test:e2e      # API end-to-end (starts the Nest app in-process, port 0)
```

## Critical scenario (spec §40) – `critical-flow.e2e.spec.ts`

Kiosk card order for 18:00 with 2× Khachapuri (30), 1× Lobiani (10), 3× Eclair (2):
planned starts 17:30 / 17:50 / 17:58 · Upcoming vs board horizon · START/READY
with 409 on double press and cross-station attempts · rollup to
PARTIALLY_READY → READY_FOR_ASSEMBLY · dispatcher READY FOR CUSTOMER → number
appears in the display's READY column through a real Socket.IO event · HANDED
OVER → COMPLETED, number disappears · admin timeline built from history rows.

Also covered: idempotent order creation, kiosk cash order held until cashier
confirmation (with idempotent confirm + 403 for kiosk devices), declined card
(A-10) then rescue by cash, duplicate/contradicting provider callbacks,
cancellation permissions, refunds → REFUNDED, audit log entries.

The tests freeze the API `Clock` (injectable) to move through the day
deterministically; the mock terminal settles synchronously
(`MOCK_TERMINAL_DELAY_MS=0` in `test/setup-env.ts`).

## Conventions
* Domain rules get a unit test in `packages/domain` first.
* Every state transition added to the engine gets an e2e assertion for both the
  happy path and the conflicting double-call.
* UI apps: browser E2E (Playwright) is planned once the flows stabilise; today
  the apps are verified manually against the seeded environment.
