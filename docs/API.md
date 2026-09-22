# REST API

Base URL: `http://localhost:4000/api/v1`. JSON everywhere. Auth: `Authorization: Bearer <token>`
(employee JWT from `/auth/login`, or a device token issued in Admin). Device
apps may also pass `?token=` on the first load; the UI stores it afterwards.

Errors have one shape:
```json
{ "statusCode": 409, "code": "CONFLICT", "message": "Task is IN_PRODUCTION, expected SCHEDULED", "current": { … } }
```
`code` values: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `INVALID_TRANSITION`, `INTERNAL`. Request/response schemas are the
zod schemas and interfaces in `packages/types`.

Permissions are listed per route; `public` means no token needed; `device`
means any authenticated actor of the branch.

## Auth
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | /auth/login | public | `{email,password}` → `{accessToken, expiresAt, user}` (rate-limited 10/min) |
| GET | /auth/me | any | user or device profile |
| GET | /auth/device | device | branch, station, settings |

## Organisation
| Method | Path | Perm |
|---|---|---|
| GET | /branches | public (active branches) |
| GET/POST | /admin/branches | branches.read / branches.write |
| PATCH | /admin/branches/:id | branches.write |
| GET | /stations?branchId | catalog.read |
| POST | /admin/stations · PATCH /admin/stations/:id | stations.write |
| GET/POST | /admin/devices · PATCH /admin/devices/:id · POST /admin/devices/:id/rotate-token | devices.read / devices.write (create & rotate return `token` once) |
| GET/POST | /admin/users · PATCH /admin/users/:id | users.read / users.write |
| GET | /admin/roles · /admin/permissions · PATCH /admin/roles/:id | users.read / roles.write |
| GET/PUT | /admin/settings | settings.write |

## Catalog
| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | /catalog?branchId&channel=KIOSK\|POS\|MOBILE&locale | public/device | resolved prices & availability per branch and channel |
| GET/POST | /admin/categories · PATCH /admin/categories/:id | catalog.read / catalog.write | |
| GET | /admin/products?search&categoryId&includeArchived | catalog.read | |
| GET/POST | /admin/products(/:id) · PATCH /admin/products/:id | catalog.read / catalog.write | |
| POST | /admin/products/:id/enable · /disable · /archive | catalog.write | |
| PUT | /admin/products/:id/production-config | catalog.production_config_write | internal data, never touched by imports |
| PUT | /admin/products/:id/branches/:branchId | catalog.write | price/availability/station override |
| GET | /admin/catalog-imports | catalog.import | history |
| POST | /admin/catalog-imports/preview `{source: MADART_GE\|JSON_SNAPSHOT}` | catalog.import | returns counts + per-item action (NEW/UPDATE/UNCHANGED) |
| POST | /admin/catalog-imports/:id/commit | catalog.import | applies the preview |

## Orders
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | /orders | public / device | create + submit. `idempotencyKey` required; replay returns the same order. CARD/ONLINE also initiates the payment and returns it. |
| POST | /pickup-slots/quote | public | `{branchId, items}` → slots with availability + `asapReadyAt` |
| GET | /orders/track/:qrToken | public | customer status page |
| GET | /orders?branchId&status&awaitingCash&search&from&to&limit&offset | orders.read | cashier list uses `awaitingCash=true` |
| GET | /orders/:id · /orders/by-number/:n?branchId · /orders/by-qr/:token | orders.read | |
| POST | /orders/:id/cancel `{reason}` | orders.cancel (+orders.refund if paid) | audit-logged |
| GET | /admin/orders/:id/timeline | orders.read | merged order/payment/production/audit history |

## Payments
| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | /orders/:id/payments `{method: CARD\|ONLINE, idempotencyKey}` | payments.initiate_card | Payment PENDING → adapter; result arrives via callback |
| POST | /orders/:id/payments/cash-confirm `{amountReceived, idempotencyKey}` | payments.confirm_cash | MARK AS PAID → order enters production |
| GET | /payments/:id | payments.read | kiosk polls this while waiting for the terminal |
| POST | /payments/:id/callback | public (provider-signed) | idempotent; duplicates return current state |
| POST | /payments/:id/reconcile | payments.read | asks the provider for the authoritative status |
| POST | /payments/:id/refunds `{amount, reason, idempotencyKey}` | orders.refund | |

## Production / Dispatch / Display
| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | /production/board?branchId&stationId | production.read | `tasks` (main board), `upcoming`, `readyRecent`, thresholds, serverTime |
| POST | /production/tasks/:id/start · /ready | production.start / production.ready | 409 with `current` when already moved |
| GET | /dispatch/board?branchId | dispatch.read | preparing / readyForAssembly / readyForPickup with per-station groups |
| POST | /dispatch/orders/:id/ready-for-customer[?force=true] | dispatch.ready (+orders.force_ready) | |
| POST | /dispatch/orders/:id/handed-over | dispatch.handover | |
| GET | /display/board?branchId | device/any | numbers only |

## Reports
| Method | Path | Perm |
|---|---|---|
| GET | /admin/dashboard?branchId | reports.read |
| GET | /admin/audit-logs?branchId&orderId&action&from&to | audit.read |

## Health (no prefix)
`GET /health`, `GET /health/database`, `GET /health/redis` – 200 or 503 with details.

## Realtime
Socket.IO namespace `/rt`, see `REALTIME_EVENTS.md`.
