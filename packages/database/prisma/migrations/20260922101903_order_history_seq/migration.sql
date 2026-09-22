-- DropIndex
DROP INDEX "OrderStatusHistory_orderId_at_idx";

-- AlterTable
ALTER TABLE "OrderStatusHistory" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_seq_idx" ON "OrderStatusHistory"("orderId", "seq");
