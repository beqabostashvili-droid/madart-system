import type { ActorType } from '@madart/domain';
import { z } from 'zod';
import { isoDate, uuid } from './common';

export interface AuditLogView {
  id: string;
  at: string;
  actorType: ActorType;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  branchId: string | null;
  orderId: string | null;
  metadata: Record<string, unknown> | null;
}

export const auditQuery = z.object({
  branchId: uuid.optional(),
  orderId: uuid.optional(),
  action: z.string().optional(),
  actorId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AuditQuery = z.infer<typeof auditQuery>;
