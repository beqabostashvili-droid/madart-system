import type { TransactionClient } from '@madart/database';
import { Injectable } from '@nestjs/common';
import type { Actor } from '../../auth/actor';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes inside the caller's transaction when `tx` is given. */
  async record(actor: Actor | null, entry: AuditEntry, tx?: TransactionClient) {
    const db = tx ?? this.prisma.client;
    await db.auditLog.create({
      data: {
        actorType: actor?.kind === 'user' ? 'USER' : actor?.kind === 'device' ? 'DEVICE' : 'SYSTEM',
        actorId: actor?.id ?? null,
        actorName: actor?.displayName ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        branchId: entry.branchId ?? actor?.branchId ?? null,
        orderId: entry.orderId ?? null,
        metadata: (entry.metadata ?? undefined) as object | undefined,
      },
    });
  }
}
