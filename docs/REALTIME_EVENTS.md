# Realtime Events

Transport: Socket.IO on the API port, namespace `/rt`. Authentication: the
same JWT (employee or device) passed as `auth.token` in the handshake. The
server decides which rooms a socket may join from the token's branch/station.

## Rooms
| Room | Who joins | Receives |
|------|-----------|----------|
| `branch:{branchId}` | admin, dispatcher, POS | every order-level event of the branch |
| `branch:{branchId}:station:{stationId}` | production device for that station | task events of that station only |
| `branch:{branchId}:display` | customer display | `DISPLAY_BOARD` snapshots (numbers only, no personal data) |
| `branch:{branchId}:dispatch` | dispatcher | task + order events with item details |
| `order:{orderId}` | kiosk / mobile client that owns the order | payment + status events of one order |

## Events (server → client)

| Event | Payload | Emitted when |
|-------|---------|--------------|
| `ORDER_CREATED` | `OrderSummary` | order submitted |
| `PAYMENT_COMPLETED` | `{orderId, paymentId, method}` | payment SUCCEEDED |
| `PAYMENT_FAILED` | `{orderId, paymentId, failureCode}` | payment FAILED |
| `ORDER_CONFIRMED` | `OrderSummary` | PAID → CONFIRMED |
| `PRODUCTION_TASK_CREATED` | `ProductionTaskView` | planner created a task (station room) |
| `PRODUCTION_STARTING_SOON` | `{taskId}` | tick crosses threshold |
| `PRODUCTION_STARTED` | `ProductionTaskView` | START |
| `PRODUCTION_ITEM_READY` | `ProductionTaskView` | READY |
| `ORDER_STATUS_CHANGED` | `{orderId, from, to, publicNumber}` | every order transition |
| `ORDER_READY_FOR_ASSEMBLY` | `OrderSummary` | all tasks ready |
| `ORDER_READY_FOR_PICKUP` | `{orderId, publicNumber}` | dispatcher ready |
| `ORDER_COMPLETED` | `{orderId, publicNumber}` | handed over |
| `ORDER_CANCELLED` | `{orderId, publicNumber}` | cancel |
| `DISPLAY_BOARD` | `{preparing: string[], ready: string[]}` | any change affecting the board (display room) |
| `DEVICE_STATUS` | `{deviceId, online}` | device connect/disconnect |

Payload types live in `packages/types/src/realtime.ts`. Every event carries
`{ id, type, at, branchId, payload }` (`RealtimeEnvelope`), so clients can
de-duplicate by `id` after reconnect.

## Client → server
* `subscribe` `{ rooms: string[] }` – server filters against the token.
* `ping` – keepalive; server answers `pong { serverTime }` (used for clock
  offset in derived production statuses).

## Reconnect strategy
Clients show `ONLINE / RECONNECTING / OFFLINE`. On reconnect the client
re-fetches its snapshot (`GET /production/board`, `GET /dispatch/board`,
`GET /display/board`) and then applies live events – events are never the only
source of state.

## Internal event bus
API modules publish `DomainEvent`s to `EventBus` after the DB transaction
commits. `RealtimeGateway` subscribes and fans out to rooms. `InMemoryEventBus`
is default; `RedisEventBus` (pub/sub) is enabled with `REDIS_URL` for multiple
API instances (A-07).
