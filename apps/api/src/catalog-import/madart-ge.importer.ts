import { Logger } from '@nestjs/common';
import { type CatalogImporter, type ExternalCatalog } from './importer';
import { JsonSnapshotImporter, snapshotToCatalog } from './json-snapshot.importer';

interface AjaxCategory {
  id: string;
  cid: string;
  db_name_ka: string;
  db_name_en?: string | null;
  db_name_ru?: string | null;
  sortable?: string;
}
interface AjaxResponse {
  page?: number;
  product?: Array<{ id: number | string; category_id: number | string; name: string; price: number | string; image?: string; text?: string; active?: string }>;
  category_list?: AjaxCategory[];
  count?: number;
}

/**
 * Live importer for the public madart.ge catalog. The site is a jQuery app
 * that loads products through `POST /?ajax table=getproduct`. Without a
 * browser session the endpoint currently returns an empty product list, so
 * this importer degrades to the JSON snapshot and reports that as a warning
 * instead of building a brittle scraper (spec §21, ASSUMPTION A-17).
 */
export class MadartGeImporter implements CatalogImporter {
  readonly source = 'MADART_GE';
  private readonly logger = new Logger(MadartGeImporter.name);

  constructor(
    private readonly baseUrl = 'https://madart.ge',
    private readonly fallback: CatalogImporter = new JsonSnapshotImporter(),
    private readonly timeoutMs = 8000,
  ) {}

  async fetchCatalog(): Promise<ExternalCatalog> {
    const warnings: string[] = [];
    try {
      const home = await this.fetchText('/');
      const categoryIds = [...new Set([...home.matchAll(/data-id="(\d{2,4})"/g)].map((m) => m[1]!))];
      if (categoryIds.length === 0) throw new Error('no category ids found on home page');

      const products: AjaxResponse['product'] = [];
      const categories = new Map<string, { id: number; name: string }>();
      for (const id of categoryIds) {
        const res = await this.fetchJson(`/?ajax`, `ajaxItem=1&table=getproduct&category_id=${id}&page=1`);
        for (const p of res.product ?? []) products.push(p);
        const name = new RegExp(`data-id="${id}"[^>]*>\\s*([^<]{2,60})<`).exec(home)?.[1]?.trim();
        if (name) categories.set(id, { id: Number(id), name });
      }
      if (products.length === 0) {
        throw new Error('live endpoint returned 0 products (session required)');
      }
      const catalog = snapshotToCatalog(
        {
          categories: [...categories.values()],
          products: products.map((p) => ({ id: Number(p.id), category_id: Number(p.category_id), name: p.name, price: Number(p.price), image: p.image ?? null, text: p.text ?? null, active: p.active ?? '1' })),
          source: this.baseUrl,
          fetched_at: new Date().toISOString(),
        },
        this.source,
      );
      catalog.warnings.push(...warnings);
      return catalog;
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.warn(`live madart.ge import unavailable (${reason}); using snapshot`);
      const snapshot = await this.fallback.fetchCatalog();
      snapshot.warnings.unshift(`Live madart.ge catalog could not be read (${reason}).`);
      return snapshot;
    }
  }

  private async fetchText(pathname: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}${pathname}`, { headers: { 'user-agent': 'Mozilla/5.0 MADART-importer' }, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname}`);
    return res.text();
  }

  private async fetchJson(pathname: string, body: string): Promise<AjaxResponse> {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 MADART-importer', 'x-requested-with': 'XMLHttpRequest' },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname}`);
    return (await res.json()) as AjaxResponse;
  }
}
