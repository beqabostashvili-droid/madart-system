import { z } from 'zod';

export const uuid = z.string().uuid();
export const isoDate = z.string().datetime({ offset: true });
export const localeSchema = z.enum(['ka', 'en', 'ru']);
export const tetri = z.number().int().nonnegative();
export const idempotencyKey = z.string().min(8).max(128);

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
