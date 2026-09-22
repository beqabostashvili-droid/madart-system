# Order Lifecycle

Order status and payment status are **independent** columns. The Order Engine
(`apps/api/src/orders/order-engine.service.ts`) is the only writer of both, and
every transition is validated by the pure state machine in
`packages/domain/src/order/order-state-machine.ts`.

## Order status state machine

```
 DRAFT ──submit──► AWAITING_PAYMENT ──payment ok──► PAID ──auto──► CONFIRMED
   │                     │                                            │
   │ cancel              │ cancel / payment failed (stays, retry)      │ auto
   ▼                     ▼                                            ▼
 CANCELLED           CANCELLED                       ┌── no production items ──► READY_FOR_ASSEMBLY
                                                     │
                                                 SCHEDULED ──first START──► IN_PRODUCTION
                                                     │                          │
                                                     │             some READY   ▼
                                                     │            ┌──────► PARTIALLY_READY
                                                     │            │             │ all READY
                                                     └────────────┴─────────────┴──► READY_FOR_ASSEMBLY
                                                                                          │ dispatcher: READY FOR CUSTOMER
                                                                                          ▼
                                                                                  READY_FOR_PICKUP
                                                                                          │ dispatcher: HANDED OVER
                                                                                          ▼
                                                                                      COMPLETED

 Any status except COMPLETED/CANCELLED/REFUNDED ──cancel──► CANCELLED
 CANCELLED (paid) ──refund settled──► REFUNDED
```

| From | To | Trigger | Guard |
|------|----|---------|-------|
| DRAFT | AWAITING_PAYMENT | `submit` | ≥1 item, branch open or scheduled pickup valid |
| AWAITING_PAYMENT | PAID | payment `SUCCEEDED` | payment.amount == order.total |
| PAID | CONFIRMED | automatic | – |
| CONFIRMED | SCHEDULED | automatic, tasks created | ≥1 production task |
| CONFIRMED | READY_FOR_ASSEMBLY | automatic | 0 production tasks |
| SCHEDULED | IN_PRODUCTION | first task START | – |
| IN_PRODUCTION | PARTIALLY_READY | a task READY, others not | – |
| SCHEDULED / IN_PRODUCTION / PARTIALLY_READY | READY_FOR_ASSEMBLY | last task READY | all tasks READY or CANCELLED |
| READY_FOR_ASSEMBLY | READY_FOR_PICKUP | dispatcher `readyForCustomer` | permission `dispatch.ready` |
| READY_FOR_PICKUP | COMPLETED | dispatcher `handOver` | permission `dispatch.handover` |
| * (non-terminal) | CANCELLED | `cancel` | see ASSUMPTIONS A-15 |
| CANCELLED | REFUNDED | refund settled | paymentStatus REFUNDED |

Terminal statuses: `COMPLETED`, `CANCELLED`, `REFUNDED`.

## Payment status (on Order)

`UNPAID → PENDING → PAID`; `PENDING → FAILED → PENDING` (retry);
`PAID → PARTIALLY_REFUNDED → REFUNDED`; `PAID → REFUNDED`.
Derived from the order's Payment rows by `derivePaymentStatus()`; see
`PAYMENTS.md`.

## Channel flows

**Kiosk CARD** – create DRAFT → submit (AWAITING_PAYMENT, payment PENDING) →
`initiatePayment` → terminal adapter → callback SUCCEEDED → PAID → CONFIRMED →
SCHEDULED, tasks created, events emitted. Failure → order stays
AWAITING_PAYMENT with paymentStatus FAILED; customer may retry or choose cash.

**Kiosk CASH** – create + submit → AWAITING_PAYMENT, paymentMethod CASH,
`paymentStatus = UNPAID` (spec name: AWAITING_CASH_PAYMENT is the cashier
list filter `status=AWAITING_PAYMENT & method=CASH`). Kiosk shows number + QR.
Cashier finds order → `confirmCashPayment` → Payment SUCCEEDED → PAID → …

**POS** – cashier builds the order; CASH → confirm immediately; CARD → same
terminal flow as kiosk.

**Mobile** – SCHEDULED pickup sets `targetReadyAt` to the slot; ASAP computes
it (A-03). Payment via mock online provider → same PAID path.

## Item & task rollup

After every task transition the engine recomputes order status from its tasks
inside the same transaction:

```
tasks.every(READY|CANCELLED)        → READY_FOR_ASSEMBLY
tasks.some(READY) && some(not READY) → PARTIALLY_READY
tasks.some(IN_PRODUCTION)           → IN_PRODUCTION
else                                → SCHEDULED
```

Only forward moves are applied (a rollup never demotes an order).

## History & audit

Every transition writes `OrderStatusHistory` (and `PaymentStatusHistory`),
emits a realtime event, and sensitive actions also write `AuditLog`. The Admin
order timeline is rendered from these rows.
