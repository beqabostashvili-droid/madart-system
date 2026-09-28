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
/** One row of `POST /?ajax table=getproduct`. Prices are in tetri, `cat` is the sub-category id. */
interface AjaxProduct {
  id: number | string;
  cat?: number | string | null;
  title_ka?: string | null;
  text_ka?: string | null;
  file?: string | null;
  price: number | string;
  price_old?: number | string | null;
  active?: string | null;
}
interface AjaxResponse {
  page?: number;
  product?: AjaxProduct[];
  category_list?: AjaxCategory[];
  count?: number;
  limit?: number;
}

/**
 * Live importer for the public madart.ge catalog. The site is a jQuery app
 * that loads products through `POST /?ajax table=getproduct&category_id=…`;
 * the first page is requested WITHOUT a `page` parameter (page=1 is already
 * the second page, which is why the endpoint once looked empty). If the site
 * cannot be read the importer degrades to the JSON snapshot and reports that
 * as a warning instead of failing the import (spec §21, ASSUMPTION A-17).
 */
export class MadartGeImporter implements CatalogImporter {
  readonly source = 'MADART_GE';
  private readonly logger = new Logger(MadartGeImporter.name);
  private cookie = '';

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

      const categories: { id: number; name: string; subcategories: { id: number; name: string }[] }[] = [];
      const products: ReturnType<typeof toSnapshotProduct>[] = [];
      for (const id of categoryIds) {
        const name = new RegExp(`data-id="${id}"[^>]*>\\s*([^<]{2,60})<`).exec(home)?.[1]?.trim();
        if (!name) continue;
        const subs = new Map<string, string>();
        let page = 0;
        let expected = Infinity;
        let got = 0;
        while (got < expected && page < 20) {
          const res = await this.fetchJson('/?ajax', `ajaxItem=1&table=getproduct&category_id=${id}${page > 0 ? `&page=${page}` : ''}`);
          for (const c of res.category_list ?? []) subs.set(String(c.id), c.db_name_ka?.trim() ?? '');
          const rows = res.product ?? [];
          for (const p of rows) products.push(toSnapshotProduct(p, Number(id), subs));
          got += rows.length;
          expected = res.count ?? got;
          if (rows.length === 0) break;
          page++;
        }
        categories.push({ id: Number(id), name, subcategories: [...subs].map(([sid, sname]) => ({ id: Number(sid), name: sname })) });
      }
      if (products.length === 0) throw new Error('live endpoint returned 0 products');

      const catalog = snapshotToCatalog({ categories, products, source: this.baseUrl, fetched_at: new Date().toISOString() }, this.source);
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
    // keep the PHP session the home page hands out; the AJAX endpoint behaves like the browser then
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0] ?? '';
    return res.text();
  }

  private async fetchJson(pathname: string, body: string): Promise<AjaxResponse> {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'Mozilla/5.0 MADART-importer',
        'x-requested-with': 'XMLHttpRequest',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${pathname}`);
    return (await res.json()) as AjaxResponse;
  }
}

function toSnapshotProduct(p: AjaxProduct, categoryId: number, subs: Map<string, string>) {
  const subId = p.cat != null && p.cat !== '' ? Number(p.cat) : null;
  return {
    id: Number(p.id),
    category_id: categoryId,
    sub_id: subId,
    sub_name: subId != null ? (subs.get(String(subId)) ?? null) : null,
    name: (p.title_ka ?? '').trim(),
    price: Number(p.price) / 100, // tetri → GEL, as in the snapshot
    image: p.file ?? null,
    text: p.text_ka ?? null,
    active: p.active ?? '1',
  };
}
