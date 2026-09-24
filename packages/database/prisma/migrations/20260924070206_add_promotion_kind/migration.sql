-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('GENERAL', 'NEW_PRODUCT', 'DISCOUNT');

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "kind" "PromotionKind" NOT NULL DEFAULT 'GENERAL';

-- CreateIndex
CREATE INDEX "Promotion_branchId_kind_active_idx" ON "Promotion"("branchId", "kind", "active");
