import { z } from 'zod';

/** Admin → System Settings → "clear test orders". Body guards against accidental calls. */
export const purgeOrdersBody = z.object({ confirm: z.literal('DELETE') });
export type PurgeOrdersBody = z.infer<typeof purgeOrdersBody>;

export interface PurgeOrdersResult {
  orders: number;
  payments: number;
  productionTasks: number;
}
