import { z } from 'zod';
import { localeSchema, tetri, uuid } from './common';

// ---------------------------------------------------------------- views

export interface CategoryView {
  id: string;
  code: string;
  name: string; // localized
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
}

export interface ProductTranslationView {
  locale: 'ka' | 'en' | 'ru';
  name: string;
  description: string | null;
}

export interface ProductionConfigView {
  productionRequired: boolean;
  stationId: string | null;
  stationCode: string | null;
  productionTimeMinutes: number;
  preparationBufferMinutes: number;
  capacityUnits: number;
  priority: number;
}

export interface ModifierView {
  id: string;
  name: string;
  priceDelta: number;
  active: boolean;
}

export interface ModifierGroupView {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: ModifierView[];
}

/** Product as seen by a sales channel for a given branch (prices resolved). */
export interface CatalogProductView {
  id: string;
  sku: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
  productionTimeMinutes: number;
  modifierGroups: ModifierGroupView[];
  recommendedProductIds: string[];
}

export interface CatalogView {
  branchId: string;
  locale: 'ka' | 'en' | 'ru';
  categories: CategoryView[];
  products: CatalogProductView[];
}

/** Full product for Admin. */
export interface AdminProductView {
  id: string;
  sku: string;
  categoryId: string;
  basePrice: number;
  imageUrl: string | null;
  active: boolean;
  archivedAt: string | null;
  availableKiosk: boolean;
  availablePos: boolean;
  availableMobile: boolean;
  externalSource: string | null;
  externalId: string | null;
  externalUrl: string | null;
  translations: ProductTranslationView[];
  productionConfig: ProductionConfigView;
  branchOverrides: ProductBranchView[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductBranchView {
  branchId: string;
  available: boolean;
  priceOverride: number | null;
  availableKiosk: boolean | null;
  availablePos: boolean | null;
  availableMobile: boolean | null;
  stationOverrideId: string | null;
}

// ---------------------------------------------------------------- schemas

export const catalogQuery = z.object({
  branchId: uuid,
  channel: z.enum(['KIOSK', 'POS', 'MOBILE']),
  locale: localeSchema.default('ka'),
});
export type CatalogQuery = z.infer<typeof catalogQuery>;

export const translationInput = z.object({
  locale: localeSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
});

export const createCategoryBody = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/),
  nameKa: z.string().min(1),
  nameEn: z.string().nullable().optional(),
  nameRu: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;
export const updateCategoryBody = createCategoryBody.partial();
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;

export const productionConfigInput = z.object({
  productionRequired: z.boolean(),
  stationId: uuid.nullable(),
  productionTimeMinutes: z.number().int().min(0).max(24 * 60),
  preparationBufferMinutes: z.number().int().min(0).max(240).default(0),
  capacityUnits: z.number().int().min(0).max(1000).default(1),
  priority: z.number().int().min(-100).max(100).default(0),
});
export type ProductionConfigInput = z.infer<typeof productionConfigInput>;

export const createProductBody = z.object({
  sku: z.string().min(1).max(64),
  categoryId: uuid,
  basePrice: tetri,
  imageUrl: z.string().url().nullable().optional(),
  active: z.boolean().default(true),
  availableKiosk: z.boolean().default(true),
  availablePos: z.boolean().default(true),
  availableMobile: z.boolean().default(true),
  translations: z.array(translationInput).min(1),
  productionConfig: productionConfigInput.optional(),
});
export type CreateProductBody = z.infer<typeof createProductBody>;
export const updateProductBody = createProductBody.partial();
export type UpdateProductBody = z.infer<typeof updateProductBody>;

export const productBranchInput = z.object({
  available: z.boolean().default(true),
  priceOverride: tetri.nullable().optional(),
  availableKiosk: z.boolean().nullable().optional(),
  availablePos: z.boolean().nullable().optional(),
  availableMobile: z.boolean().nullable().optional(),
  stationOverrideId: uuid.nullable().optional(),
});
export type ProductBranchInput = z.infer<typeof productBranchInput>;

export const adminProductsQuery = z.object({
  search: z.string().optional(),
  categoryId: uuid.optional(),
  includeArchived: z.coerce.boolean().default(false),
});
