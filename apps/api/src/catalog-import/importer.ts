/**
 * Catalog importer abstraction (spec §21–23). Importers only *fetch* an
 * external catalog; matching, preview and persistence are done by
 * CatalogImportService. madart.ge is never a runtime dependency.
 */
export interface ExternalCategory {
  externalId: string;
  code: string; // stable, uppercase
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
  sortOrder: number;
}

export interface ExternalProduct {
  externalId: string;
  categoryExternalId: string;
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
  descriptionKa?: string | null;
  price: number; // tetri
  imageUrl: string | null;
  externalUrl: string | null;
  active: boolean;
}

export interface ExternalCatalog {
  source: string;
  fetchedAt: string;
  categories: ExternalCategory[];
  products: ExternalProduct[];
  warnings: string[];
}

export interface CatalogImporter {
  readonly source: string;
  fetchCatalog(): Promise<ExternalCatalog>;
}

/** Stable content hash used to detect changed catalog fields on re-import. */
export function catalogHash(p: ExternalProduct): string {
  const s = JSON.stringify([p.nameKa, p.nameEn ?? '', p.nameRu ?? '', p.descriptionKa ?? '', p.price, p.imageUrl ?? '', p.categoryExternalId, p.active]);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text.length ? text : null;
}
