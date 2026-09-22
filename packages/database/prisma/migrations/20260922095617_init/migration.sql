-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'PAID', 'CONFIRMED', 'SCHEDULED', 'IN_PRODUCTION', 'PARTIALLY_READY', 'READY_FOR_ASSEMBLY', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'CASH', 'ONLINE');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('KIOSK', 'POS', 'MOBILE', 'WOLT', 'GLOVO', 'BOLT_FOOD', 'DELIVERY', 'API');

-- CreateEnum
CREATE TYPE "PickupType" AS ENUM ('ASAP', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'READY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionTaskStatus" AS ENUM ('SCHEDULED', 'IN_PRODUCTION', 'READY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('KIOSK', 'POS', 'PRODUCTION', 'CUSTOMER_DISPLAY');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'DEVICE', 'SYSTEM', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "CatalogImportStatus" AS ENUM ('PREVIEW', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "CatalogImportAction" AS ENUM ('NEW', 'UPDATE', 'UNCHANGED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pin" TEXT,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "branchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" UUID NOT NULL,
    "type" "DeviceType" NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" UUID NOT NULL,
    "stationId" UUID,
    "tokenHash" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Tbilisi',
    "orderNumberPrefix" TEXT NOT NULL DEFAULT 'A',
    "openingHours" JSONB NOT NULL DEFAULT '{}',
    "pickupMinLeadMinutes" INTEGER NOT NULL DEFAULT 30,
    "pickupSlotMinutes" INTEGER NOT NULL DEFAULT 15,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStation" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacityRule" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "stationId" UUID,
    "windowMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxCapacityUnits" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CapacityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupSlot" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "maxOrders" INTEGER,

    CONSTRAINT "PickupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameKa" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameRu" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "externalSource" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "availableKiosk" BOOLEAN NOT NULL DEFAULT true,
    "availablePos" BOOLEAN NOT NULL DEFAULT true,
    "availableMobile" BOOLEAN NOT NULL DEFAULT true,
    "externalSource" TEXT,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "catalogHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTranslation" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductProductionConfig" (
    "productId" UUID NOT NULL,
    "productionRequired" BOOLEAN NOT NULL DEFAULT true,
    "stationId" UUID,
    "productionTimeMinutes" INTEGER NOT NULL DEFAULT 10,
    "preparationBufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "capacityUnits" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductProductionConfig_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "ProductBranch" (
    "productId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "priceOverride" INTEGER,
    "availableKiosk" BOOLEAN,
    "availablePos" BOOLEAN,
    "availableMobile" BOOLEAN,
    "stationOverrideId" UUID,

    CONSTRAINT "ProductBranch_pkey" PRIMARY KEY ("productId","branchId")
);

-- CreateTable
CREATE TABLE "ProductModifierGroup" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "nameKa" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameRu" TEXT,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModifier" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "nameKa" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameRu" TEXT,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecommendation" (
    "productId" UUID NOT NULL,
    "recommendedProductId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductRecommendation_pkey" PRIMARY KEY ("productId","recommendedProductId")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "publicNumber" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "pickupType" "PickupType" NOT NULL DEFAULT 'ASAP',
    "targetReadyAt" TIMESTAMP(3) NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GEL',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "note" TEXT,
    "deviceId" UUID,
    "createdByUserId" UUID,
    "idempotencyKey" TEXT,
    "qrToken" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "readyForPickupAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,
    "productionRequired" BOOLEAN NOT NULL,
    "stationIdSnapshot" UUID,
    "productionTimeSnapshot" INTEGER NOT NULL DEFAULT 0,
    "bufferSnapshot" INTEGER NOT NULL DEFAULT 0,
    "capacityUnitsSnapshot" INTEGER NOT NULL DEFAULT 1,
    "prioritySnapshot" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemModifier" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "modifierId" UUID,
    "nameSnapshot" TEXT NOT NULL,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderNumberSequence" (
    "branchId" UUID NOT NULL,
    "dateKey" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("branchId","dateKey")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" INTEGER NOT NULL,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "terminalId" TEXT,
    "confirmedByUserId" UUID,
    "failureCode" TEXT,
    "maskedPan" TEXT,
    "authCode" TEXT,
    "rawProviderPayload" JSONB,
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentStatusHistory" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "fromStatus" "PaymentRecordStatus",
    "toStatus" "PaymentRecordStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,

    CONSTRAINT "PaymentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionTask" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "stationId" UUID NOT NULL,
    "status" "ProductionTaskStatus" NOT NULL DEFAULT 'SCHEDULED',
    "quantity" INTEGER NOT NULL,
    "capacityUnits" INTEGER NOT NULL DEFAULT 1,
    "durationMinutes" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "plannedStartAt" TIMESTAMP(3) NOT NULL,
    "plannedReadyAt" TIMESTAMP(3) NOT NULL,
    "actualStartedAt" TIMESTAMP(3),
    "actualReadyAt" TIMESTAMP(3),
    "startedByUserId" UUID,
    "startedByDeviceId" UUID,
    "readyByUserId" UUID,
    "readyByDeviceId" UUID,
    "startingSoonNotifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStep" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'TOTAL',
    "durationMinutes" INTEGER NOT NULL,
    "status" "ProductionTaskStatus" NOT NULL DEFAULT 'SCHEDULED',
    "plannedStartAt" TIMESTAMP(3) NOT NULL,
    "plannedReadyAt" TIMESTAMP(3) NOT NULL,
    "actualStartedAt" TIMESTAMP(3),
    "actualReadyAt" TIMESTAMP(3),

    CONSTRAINT "ProductionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "branchId" UUID,
    "orderId" UUID,
    "metadata" JSONB,
    "ip" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "branchId" UUID,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CatalogImport" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "status" "CatalogImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "summary" JSONB NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "startedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImportItem" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "action" "CatalogImportAction" NOT NULL,
    "payload" JSONB NOT NULL,
    "productId" UUID,

    CONSTRAINT "CatalogImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE INDEX "Device_branchId_type_idx" ON "Device"("branchId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStation_branchId_code_key" ON "ProductionStation"("branchId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PickupSlot_branchId_startsAt_key" ON "PickupSlot"("branchId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Category_externalSource_externalId_key" ON "Category"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_active_idx" ON "Product"("categoryId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Product_externalSource_externalId_key" ON "Product"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTranslation_productId_locale_key" ON "ProductTranslation"("productId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_qrToken_key" ON "Order"("qrToken");

-- CreateIndex
CREATE INDEX "Order_branchId_status_idx" ON "Order"("branchId", "status");

-- CreateIndex
CREATE INDEX "Order_branchId_createdAt_idx" ON "Order"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_branchId_paymentStatus_paymentMethod_idx" ON "Order"("branchId", "paymentStatus", "paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "Order_branchId_businessDate_publicNumber_key" ON "Order"("branchId", "businessDate", "publicNumber");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_at_idx" ON "OrderStatusHistory"("orderId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerReference_key" ON "Payment"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductionTask_branchId_stationId_status_plannedStartAt_idx" ON "ProductionTask"("branchId", "stationId", "status", "plannedStartAt");

-- CreateIndex
CREATE INDEX "ProductionTask_orderId_idx" ON "ProductionTask"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStep_taskId_sequence_key" ON "ProductionStep"("taskId", "sequence");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_orderId_idx" ON "AuditLog"("orderId");

-- CreateIndex
CREATE INDEX "AuditLog_branchId_at_idx" ON "AuditLog"("branchId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_branchId_key" ON "SystemSetting"("key", "branchId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "CatalogImportItem_importId_idx" ON "CatalogImportItem"("importId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStation" ADD CONSTRAINT "ProductionStation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityRule" ADD CONSTRAINT "CapacityRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityRule" ADD CONSTRAINT "CapacityRule_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProductionConfig" ADD CONSTRAINT "ProductProductionConfig_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProductionConfig" ADD CONSTRAINT "ProductProductionConfig_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBranch" ADD CONSTRAINT "ProductBranch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBranch" ADD CONSTRAINT "ProductBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBranch" ADD CONSTRAINT "ProductBranch_stationOverrideId_fkey" FOREIGN KEY ("stationOverrideId") REFERENCES "ProductionStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifierGroup" ADD CONSTRAINT "ProductModifierGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModifier" ADD CONSTRAINT "ProductModifier_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_recommendedProductId_fkey" FOREIGN KEY ("recommendedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "ProductModifier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNumberSequence" ADD CONSTRAINT "OrderNumberSequence_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatusHistory" ADD CONSTRAINT "PaymentStatusHistory_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProductionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImport" ADD CONSTRAINT "CatalogImport_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportItem" ADD CONSTRAINT "CatalogImportItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "CatalogImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportItem" ADD CONSTRAINT "CatalogImportItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
