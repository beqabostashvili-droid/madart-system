import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type CatalogImporter, type ExternalCatalog, stripHtml } from './importer';

/** Shape of packages/database/seed/madart-catalog.json (public catalog snapshot). */
interface SnapshotCategory {
  id: number;
  name: string;
  subcategories?: { id: number; name: string }[];
}
interface SnapshotProduct {
  id: number;
  category_id: number;
  sub_id?: number | null;
  name: string;
  price: number; // GEL
  image?: string | null;
  text?: string | null;
  active?: string | number | boolean;
  sub_name?: string | null;
}
interface Snapshot {
  categories: SnapshotCategory[];
  products: SnapshotProduct[];
  source: string;
  fetched_at: string;
}

const CATEGORY_CODES: Record<string, string> = {
  ტორტები: 'CAKES',
  ნამცხვრები: 'PASTRIES',
  ეკლერები: 'ECLAIRS',
  შუ: 'CHOUX',
  ხაჭაპური: 'KHACHAPURI',
  ლობიანი: 'LOBIANI',
  სასმელები: 'DRINKS',
  ცხობა: 'BAKERY',
  ბოქსები: 'BOXES',
  აქსესუარები: 'ACCESSORIES',
};

export function categoryCodeFor(name: string, id: number | string): string {
  const known = CATEGORY_CODES[name.trim()];
  if (known) return known;
  const ascii = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return ascii.length >= 3 ? ascii : `EXT_${id}`;
}

export const MADART_IMAGE = (file: string) => `https://madart.ge/thumb.php?img=product/${file}&x=800&y=600&render=crop`;

export function snapshotToCatalog(data: Snapshot, source = 'MADART_GE'): ExternalCatalog {
  return {
    source,
    fetchedAt: data.fetched_at,
    warnings: [],
    categories: data.categories.map((c, i) => ({
      externalId: String(c.id),
      code: categoryCodeFor(c.name, c.id),
      nameKa: c.name.trim(),
      sortOrder: i + 1,
    })),
    products: data.products.map((p) => ({
      externalId: String(p.id),
      categoryExternalId: String(p.category_id),
      nameKa: p.name.trim(),
      descriptionKa: stripHtml(p.text),
      price: Math.round(Number(p.price) * 100),
      imageUrl: p.image ? MADART_IMAGE(p.image) : null,
      externalUrl: `https://madart.ge/#product-${p.id}`,
      active: p.active === undefined ? true : String(p.active) === '1' || p.active === true,
    })),
  };
}

/**
 * Loads the structured snapshot shipped in the repo (ASSUMPTION A-17). Used
 * when the live site cannot be parsed and as the development seed source.
 */
export class JsonSnapshotImporter implements CatalogImporter {
  readonly source = 'MADART_GE';
  constructor(private readonly file = resolveSnapshotPath()) {}

  async fetchCatalog(): Promise<ExternalCatalog> {
    const data = JSON.parse(readFileSync(this.file, 'utf8')) as Snapshot;
    const catalog = snapshotToCatalog(data, this.source);
    catalog.warnings.push(`Loaded from local snapshot (${path.basename(this.file)}, fetched ${data.fetched_at}).`);
    return catalog;
  }
}

export function resolveSnapshotPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'packages/database/seed/madart-catalog.json'),
    path.resolve(process.cwd(), '../../packages/database/seed/madart-catalog.json'),
    path.resolve(__dirname, '../../../../packages/database/seed/madart-catalog.json'),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* next */
    }
  }
  return candidates[0]!;
}
