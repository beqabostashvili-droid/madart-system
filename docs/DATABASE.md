# Database & Domain Model

PostgreSQL via Prisma. All IDs are UUIDs; money is integer tetri; timestamps
are `timestamptz` (UTC). Schema: `packages/database/prisma/schema.prisma`.

## Entity map

```
Branch 1──* Device            Branch 1──* ProductionStation
Branch 1──* Order             Branch 1──* ProductBranch *──1 Product
Branch 1──* CapacityRule      Branch 1──* PickupSlot
Branch 1──* OrderNumberSequence

Category 1──* Product 1──* ProductTranslation
Product 1──1 ProductProductionConfig ──1 ProductionStation
Product 1──* ProductModifierGroup 1──* ProductModifier

User *──* Role *──* Permission

Order 1──* OrderItem 1──* OrderItemModifier
Order 1──* Payment 1──* PaymentStatusHistory
Order 1──* OrderStatusHistory
Order 1──* ProductionTask 1──* ProductionStep
OrderItem 1──* ProductionTask

CatalogImport 1──* CatalogImportItem
AuditLog, SystemSetting, IdempotencyKey, CustomerDisplay(Device)
```

## Tables

### Identity & access
* **User** – employee. `email`, `passwordHash`, `pin?`, `displayName`, `active`,
  `branchId?` (home branch, null for global admins).
* **Role** – `code` (SUPER_ADMIN, ADMIN, BRANCH_MANAGER, CASHIER,
  PRODUCTION_EMPLOYEE, DISPATCHER), `name`. `UserRole`, `RolePermission`.
* **Permission** – `code` (e.g. `orders.refund`), catalogue defined in
  `packages/domain/src/permissions.ts` and synced by seed.
* **Device** – `type` (KIOSK, POS, PRODUCTION, CUSTOMER_DISPLAY), `name`,
  `branchId`, `stationId?` (PRODUCTION only), `tokenHash`, `lastSeenAt`,
  `active`. `CustomerDisplay` settings (sound, tts, columns) are a JSON column
  on Device; a separate table is unnecessary until settings diverge.

### Organisation
* **Branch** – `code`, `name`, `address`, `timeZone`, `orderNumberPrefix`,
  `openingHours` (JSON per weekday), `pickupMinLeadMinutes`,
  `pickupSlotMinutes`, `active`.
* **ProductionStation** – `branchId`, `code` (HOT_KITCHEN…), `name`, `color`,
  `sortOrder`, `active`.
* **CapacityRule** – `branchId`, `stationId?`, `windowMinutes`,
  `maxCapacityUnits`, `active`.
* **PickupSlot** – materialised slot overrides (`branchId`, `startsAt`,
  `blocked`, `maxOrders?`). Slots are computed on the fly; rows exist only for
  overrides.

### Catalog
* **Category** – `code`, translations `nameKa/En/Ru`, `sortOrder`, `active`,
  `imageUrl?`, `externalSource?`, `externalId?`.
* **Product** – `sku`, `categoryId`, `basePrice` (tetri), `imageUrl`, `active`,
  `archivedAt?`, `availableKiosk/Pos/Mobile`, `externalSource?`, `externalId?`,
  `externalUrl?`, `catalogHash` (change detection on re-import).
* **ProductTranslation** – `productId`, `locale` (ka/en/ru), `name`,
  `description`. Unique (productId, locale).
* **ProductProductionConfig** – 1:1 with Product. `productionRequired`,
  `stationId?`, `productionTimeMinutes`, `preparationBufferMinutes`,
  `capacityUnits`, `priority`. **Never written by the importer.**
* **ProductBranch** – `productId`, `branchId`, `priceOverride?`, `available`,
  `availableKiosk/Pos/Mobile?` (null = inherit), `stationOverrideId?`.
* **ProductModifierGroup / ProductModifier** – optional variants
  (`minSelect`, `maxSelect`, `priceDelta`). MVP UI supports them read-only.

### Orders
* **Order** – `branchId`, `publicNumber` (A154), `source`, `status`,
  `paymentStatus`, `paymentMethod`, `pickupType` (ASAP/SCHEDULED),
  `targetReadyAt`, `subtotal`, `discountTotal`, `total`, `currency`,
  `customerName?`, `customerPhone?`, `note?`, `deviceId?`, `createdByUserId?`,
  `idempotencyKey?` (unique), `version` (optimistic lock), timestamps
  `paidAt`, `confirmedAt`, `readyForPickupAt`, `completedAt`, `cancelledAt`.
  Unique `(branchId, publicNumber, businessDate)`.
* **OrderItem** – `orderId`, `productId`, `nameSnapshot`, `unitPrice`,
  `quantity`, `lineTotal`, `productionRequired`, `stationIdSnapshot?`,
  `productionTimeSnapshot`, `bufferSnapshot`, `status`
  (PENDING/IN_PRODUCTION/READY/CANCELLED), `sortOrder`.
* **OrderItemModifier** – snapshot of chosen modifiers.
* **OrderStatusHistory** – `orderId`, `fromStatus`, `toStatus`, `at`,
  `actorType` (USER/DEVICE/SYSTEM), `actorId?`, `reason?`.
* **OrderNumberSequence** – `(branchId, dateKey)` → `lastValue`.

### Payments
* **Payment** – `orderId`, `method` (CARD/CASH/ONLINE), `provider`
  (MOCK_TERMINAL/CASH/…), `status` (INITIATED, PENDING, SUCCEEDED, FAILED,
  CANCELLED, REFUNDED, PARTIALLY_REFUNDED), `amount`, `refundedAmount`,
  `providerReference?` (unique), `idempotencyKey` (unique), `terminalId?`,
  `confirmedByUserId?`, `failureCode?`, `rawProviderPayload?` (JSON, never
  card data), `authorizedAt/capturedAt/failedAt`.
* **PaymentStatusHistory** – like order history.
* **Refund** – `paymentId`, `amount`, `reason`, `status`, `createdByUserId`.

### Production
* **ProductionTask** – `orderId`, `orderItemId`, `branchId`, `stationId`,
  `status` (SCHEDULED, IN_PRODUCTION, READY, CANCELLED), `quantity`,
  `capacityUnits`, `durationMinutes`, `priority`, `plannedStartAt`,
  `plannedReadyAt`, `actualStartedAt?`, `actualReadyAt?`,
  `startedByUserId?/DeviceId?`, `readyBy…`, `version`.
* **ProductionStep** – `taskId`, `sequence`, `code` (e.g. TOTAL, PREPARATION,
  BAKING), `durationMinutes`, `status`, `plannedStartAt`, `plannedReadyAt`,
  `actualStartedAt?`, `actualReadyAt?`. MVP: one `TOTAL` step per task.

### Platform
* **AuditLog** – `at`, `actorType`, `actorId`, `action`, `entityType`,
  `entityId`, `branchId?`, `orderId?`, `metadata` JSON, `ip?`.
* **SystemSetting** – `key`, `value` JSON, `branchId?` (null = global).
* **IdempotencyKey** – `key`, `scope`, `requestHash`, `responseStatus`,
  `responseBody`, `expiresAt`.
* **CatalogImport** – `source`, `status` (PREVIEW, IMPORTED, FAILED),
  `summary` JSON, `startedByUserId`, `createdAt`, `importedAt?`.
* **CatalogImportItem** – `importId`, `externalId`, `action`
  (NEW/UPDATE/UNCHANGED/SKIPPED), `payload` JSON, `productId?`.

## Indexes worth noting
* `Order(branchId, status)`, `Order(branchId, createdAt)`,
  `Order(paymentStatus)` for cashier "awaiting cash" list.
* `ProductionTask(branchId, stationId, status, plannedStartAt)` for KDS boards.
* `Payment(providerReference)` unique – duplicate callback suppression.
* `IdempotencyKey(key, scope)` unique.

## Concurrency
* Transitions use `updateMany({ where: { id, status: expected }, data })` and
  check `count === 1`; otherwise the operation throws `ConflictError` and the
  caller returns the current state. `version` columns support optimistic UI
  updates.
* Order number allocation is one atomic `INSERT … ON CONFLICT … RETURNING`.
