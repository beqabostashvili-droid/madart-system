# Payments

## Principles
1. **Unpaid orders never enter production** (default rule, see ORDER_LIFECYCLE).
2. **Idempotent everywhere.** Initiate, confirm, callback and refund all accept
   an idempotency key; provider references are unique.
3. **The client is never the source of truth.** A card payment is PAID only
   when the backend receives and validates the provider result (callback or
   reconciliation poll), never because the kiosk saw a success screen.
4. **No card data.** Only the provider token/reference and masked PAN are kept.

## Payment entity state machine

```
INITIATED ──sent to terminal──► PENDING ──provider success──► SUCCEEDED ──► PARTIALLY_REFUNDED ──► REFUNDED
    │                              │                                     └────────────────────────► REFUNDED
    │ cancel                       │ provider failure / timeout
    ▼                              ▼
 CANCELLED                       FAILED   (a new Payment row is created for a retry)
```

Order `paymentStatus` is derived from the latest non-cancelled Payment:

| Payments | Order.paymentStatus |
|----------|---------------------|
| none | UNPAID |
| latest INITIATED/PENDING | PENDING |
| latest FAILED | FAILED |
| latest SUCCEEDED, refundedAmount = 0 | PAID |
| refundedAmount < amount | PARTIALLY_REFUNDED |
| refundedAmount = amount | REFUNDED |

## Flows

### Card (kiosk / POS)
```
POST /orders/:id/payments { method: CARD, idempotencyKey }
  → Payment INITIATED → adapter.initiate() → PENDING (terminalId, providerReference)
adapter (mock or bank SDK) ──► POST /payments/:id/callback { providerReference, result, signature }
  → tx: updateMany(status=PENDING → SUCCEEDED) ; if count=0 → duplicate → 200 with current state
  → OrderEngine.onPaymentSucceeded(orderId) → PAID/CONFIRMED/SCHEDULED + tasks
GET /payments/:id            – kiosk polls or listens to PAYMENT_COMPLETED / PAYMENT_FAILED events
POST /payments/:id/reconcile – asks the adapter for the authoritative status (used after connection loss)
```

### Cash (kiosk → cashier)
```
kiosk: submit order with paymentMethod CASH   → order AWAITING_PAYMENT, no Payment row yet
POS:   GET /orders?branchId&awaitingCash=true  (search by number / QR)
POS:   POST /orders/:id/payments/cash-confirm { amountReceived, idempotencyKey }
  → Payment(method CASH, provider CASH) SUCCEEDED, confirmedByUserId
  → OrderEngine.onPaymentSucceeded
```
Requires permission `payments.confirm_cash`. Opens the cash drawer through
`CashDrawerAdapter` (mock in MVP).

### Mobile (online)
Same as card with provider `MOCK_ONLINE`; a real provider later implements
`OnlinePaymentProvider` (redirect/webhook), reusing the callback endpoint.

### Refunds
`POST /payments/:id/refunds { amount, reason }` – permission `orders.refund`,
audit-logged. Full refund of a cancelled order moves the order to REFUNDED.

## Adapter layer (`packages/hardware-adapters`)

```ts
interface PaymentTerminalAdapter {
  readonly provider: string;
  initiate(req: TerminalPaymentRequest): Promise<TerminalInitiateResult>;
  queryStatus(providerReference: string): Promise<TerminalStatus>;   // reconciliation
  cancel(providerReference: string): Promise<void>;
  refund(providerReference: string, amount: number): Promise<TerminalRefundResult>;
}
```
`MockPaymentTerminalAdapter` (A-10) resolves asynchronously and posts the
callback like a real terminal bridge would. Adding a Georgian bank terminal =
one new adapter class + config, no engine changes.

## Failure handling
* Terminal offline → `initiate()` throws `TerminalUnavailableError` → Payment
  FAILED with `failureCode = TERMINAL_OFFLINE`; kiosk offers cash.
* Client loses connection after initiate → on reconnect it calls
  `GET /payments/:id`; if still PENDING after `paymentTimeoutSeconds` (setting,
  default 120) the API runs `reconcile` and settles FAILED or SUCCEEDED.
* Duplicate callback → no-op, logged at `info`, returns current state.
