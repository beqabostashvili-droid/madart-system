import type { CatalogImportAction, CatalogImportStatus } from '@madart/domain';
import { z } from 'zod';

export const importPreviewBody = z.object({
  source: z.enum(['MADART_GE', 'JSON_SNAPSHOT']).default('MADART_GE'),
});
export type ImportPreviewBody = z.infer<typeof importPreviewBody>;

export interface ImportItemPreview {
  externalId: string;
  action: CatalogImportAction;
  name: string;
  categoryCode: string;
  price: number;
  imageUrl: string | null;
  existingProductId: string | null;
  changedFields: string[];
}

export interface ImportPreviewView {
  importId: string;
  source: string;
  status: CatalogImportStatus;
  summary: {
    productsFound: number;
    categoriesFound: number;
    newProducts: number;
    existingProducts: number;
    updatedProducts: number;
    unchangedProducts: number;
    newCategories: number;
  };
  items: ImportItemPreview[];
  categories: { code: string; name: string; isNew: boolean }[];
  warnings: string[];
  createdAt: string;
}

export interface ImportResultView {
  importId: string;
  status: CatalogImportStatus;
  created: number;
  updated: number;
  unchanged: number;
  categoriesCreated: number;
  importedAt: string;
}
