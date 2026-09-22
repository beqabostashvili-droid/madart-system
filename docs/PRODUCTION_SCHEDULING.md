# Production Scheduling

Implemented as pure functions in `packages/domain/src/scheduling/` and invoked
by `ProductionPlannerService` when an order becomes PAID.

## Inputs
* `targetReadyAt` – pickup slot (SCHEDULED) or computed for ASAP (A-03).
* Per order item snapshot: `productionRequired`, `stationId`,
  `productionTimeMinutes`, `preparationBufferMinutes`, `capacityUnits`,
  `quantity`, `priority`.

## Algorithm (MVP, backward scheduling)

```
for each item with productionRequired:
  duration        = productionTimeMinutes                       (A-01: per line)
  plannedReadyAt  = targetReadyAt − preparationBufferMinutes     (A-02)
  plannedStartAt  = plannedReadyAt − duration
  if plannedStartAt < now:            // ordered too late for the target
      plannedStartAt = now
      plannedReadyAt = now + duration
      flag late = true
  create ProductionTask(status SCHEDULED) with one ProductionStep(TOTAL)
```

Example, pickup 18:00:

| Item | Duration | Start | Ready |
|------|----------|-------|-------|
| Khachapuri ×2 | 30 | 17:30 | 18:00 |
| Lobiani ×1 | 10 | 17:50 | 18:00 |
| Eclair ×3 | 2 | 17:58 | 18:00 |

If any task had to be pushed (`late`), `order.targetReadyAt` is moved to
`max(plannedReadyAt)` and the order history records `TARGET_ADJUSTED`.

### ASAP orders
`targetReadyAt = now + max_i(duration_i + buffer_i)`, then the same backward
pass: the longest item starts now, shorter ones later so everything is ready
together.

## Derived display status (A-04)

```
READY / CANCELLED                               → as stored
IN_PRODUCTION and now > plannedReadyAt          → LATE
IN_PRODUCTION                                   → IN_PRODUCTION
SCHEDULED and now > plannedStartAt + grace(2)   → LATE
SCHEDULED and now ≥ plannedStartAt              → START_NOW
SCHEDULED and now ≥ plannedStartAt − soon(5)    → STARTING_SOON
SCHEDULED                                       → SCHEDULED
```

## Priority / board ordering (spec §50)

Sort key for a station board:
1. LATE first (most overdue first)
2. then by `plannedStartAt` ascending
3. tie-break: `targetReadyAt`, then order `priority` desc, then created time.

Tasks whose `plannedStartAt − now > boardHorizonMinutes` (default 60) are hidden
from the main board and shown under **Upcoming** (A-13).

## Actions
* `START` → `updateMany(status SCHEDULED → IN_PRODUCTION, actualStartedAt = now)`;
  count 0 ⇒ someone else already started it ⇒ `409` with current task.
* `READY` → `IN_PRODUCTION → READY, actualReadyAt = now`, then order rollup.
* Both write AuditLog and emit `PRODUCTION_STARTED` / `PRODUCTION_ITEM_READY`.

## Time-based events
A scheduler tick (every 30 s) scans SCHEDULED tasks that just crossed
`plannedStartAt − soon` and emits `PRODUCTION_STARTING_SOON` once
(`startingSoonNotifiedAt`). Clients also derive status locally every second so
UI is correct without waiting for the tick.

## Capacity (foundation only in MVP)
`CapacityRule(branchId, stationId?, windowMinutes, maxCapacityUnits)`.
`computePickupSlots()` sums `capacityUnits` of tasks whose
`[plannedStartAt, plannedReadyAt)` intersects each window and marks a slot
unavailable when adding the new order's load would exceed the rule. With no
rules every slot is available. Future work: oven batches, multi-step
constraints, station parallelism.

## Multi-stage future
`ProductionStep` rows already carry planned/actual times. A product config can
later define steps (`PREPARATION 8, BAKING 18, PACKAGING 4`); the planner will
chain steps backwards from `plannedReadyAt` and the KDS will show the active
step. No schema change is needed.

## Metrics captured (spec §35)
`plannedStartAt`, `actualStartedAt`, `plannedReadyAt`, `actualReadyAt` on every
task and step → start delay, production delay, accuracy per product/station.
