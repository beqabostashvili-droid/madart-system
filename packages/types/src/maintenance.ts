import { z } from 'zod';
import { uuid } from './common';

/** Admin → System Settings → "clear test orders". Body guards against accidental calls. */
export const purgeOrdersBody = z.object({ confirm: z.literal('DELETE') });
export type PurgeOrdersBody = z.infer<typeof purgeOrdersBody>;

export interface PurgeOrdersResult {
  orders: number;
  payments: number;
  productionTasks: number;
}

/** Admin → Orders: hard-delete selected orders (test data), unlike cancel which keeps the record. */
export const deleteOrdersBody = z.object({ ids: z.array(uuid).min(1).max(500) });
export type DeleteOrdersBody = z.infer<typeof deleteOrdersBody>;

export interface DeleteOrdersResult {
  deleted: number;
}
