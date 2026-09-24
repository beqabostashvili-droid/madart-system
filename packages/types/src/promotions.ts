import { z } from 'zod';
import { isoDate, uuid } from './common';

/** Which shelf a promotion shows on: GENERAL only rotates on the kiosk idle
 * screen; NEW_PRODUCT/DISCOUNT also get their own spotlight card on the
 * catalog screen. */
export const promotionKinds = ['GENERAL', 'NEW_PRODUCT', 'DISCOUNT'] as const;
export type PromotionKind = (typeof promotionKinds)[number];

/** Kiosk / mobile promo & news banner. Added for in-store advertising and
 * announcements (not in the original spec); shown as a rotating strip. */
export interface PromotionView {
  id: string;
  branchId: string | null;
  kind: PromotionKind;
  badgeText: string | null;
  title: string; // localized
  subtitle: string | null; // localized
  imageUrl: string;
  linkProductId: string | null;
  active: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AdminPromotionView {
  id: string;
  branchId: string | null;
  kind: PromotionKind;
  badgeText: string | null;
  titleKa: string;
  titleEn: string | null;
  titleRu: string | null;
  subtitleKa: string | null;
  subtitleEn: string | null;
  subtitleRu: string | null;
  imageUrl: string;
  linkProductId: string | null;
  active: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createPromotionBody = z.object({
  branchId: uuid.nullable().optional(),
  kind: z.enum(promotionKinds).default('GENERAL'),
  badgeText: z.string().max(24).nullable().optional(),
  titleKa: z.string().min(1).max(120),
  titleEn: z.string().max(120).nullable().optional(),
  titleRu: z.string().max(120).nullable().optional(),
  subtitleKa: z.string().max(200).nullable().optional(),
  subtitleEn: z.string().max(200).nullable().optional(),
  subtitleRu: z.string().max(200).nullable().optional(),
  imageUrl: z.string().url(),
  linkProductId: uuid.nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  startsAt: isoDate.nullable().optional(),
  endsAt: isoDate.nullable().optional(),
});
export type CreatePromotionBody = z.infer<typeof createPromotionBody>;
export const updatePromotionBody = createPromotionBody.partial();
export type UpdatePromotionBody = z.infer<typeof updatePromotionBody>;

export const promotionsQuery = z.object({
  branchId: uuid,
  channel: z.enum(['KIOSK', 'MOBILE']).default('KIOSK'),
  locale: z.enum(['ka', 'en', 'ru']).default('ka'),
});
export type PromotionsQuery = z.infer<typeof promotionsQuery>;
