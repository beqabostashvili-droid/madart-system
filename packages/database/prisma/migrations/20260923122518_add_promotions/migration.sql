-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "branchId" UUID,
    "titleKa" TEXT NOT NULL,
    "titleEn" TEXT,
    "titleRu" TEXT,
    "subtitleKa" TEXT,
    "subtitleEn" TEXT,
    "subtitleRu" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkProductId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_branchId_active_sortOrder_idx" ON "Promotion"("branchId", "active", "sortOrder");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
