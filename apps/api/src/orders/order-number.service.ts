import type { TransactionClient } from '@madart/database';
import { Prisma } from '@madart/database';
import { businessDateKey, formatOrderNumber } from '@madart/domain';
import { Injectable } from '@nestjs/common';

/**
 * Allocates the next public order number for a branch/day with one atomic
 * statement, so concurrent orders can never receive the same number (A-06).
 */
@Injectable()
export class OrderNumberService {
  async allocate(
    tx: TransactionClient,
    branch: { id: string; timeZone: string; orderNumberPrefix: string },
    at: Date,
    padding = 3,
  ): Promise<{ publicNumber: string; businessDate: string }> {
    const dateKey = businessDateKey(at, branch.timeZone);
    const rows = await tx.$queryRaw<{ lastValue: number }[]>(Prisma.sql`
      INSERT INTO "OrderNumberSequence" ("branchId", "dateKey", "lastValue")
      VALUES (${branch.id}::uuid, ${dateKey}, 1)
      ON CONFLICT ("branchId", "dateKey")
      DO UPDATE SET "lastValue" = "OrderNumberSequence"."lastValue" + 1
      RETURNING "lastValue"
    `);
    const counter = rows[0]?.lastValue ?? 1;
    return { publicNumber: formatOrderNumber(counter, { prefix: branch.orderNumberPrefix, padding }), businessDate: dateKey };
  }
}
