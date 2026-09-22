import { CatalogImportAction, CatalogImportStatus, Permission } from '@madart/domain';
import { type ImportItemPreview, type ImportPreviewBody, importPreviewBody, type ImportPreviewView, type ImportResultView } from '@madart/types';
import { Body, Controller, Get, Injectable, Logger, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Actor } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { NotFoundError, StateConflictError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import { zod } from '../common/validation/zod.pipe';
import { type CatalogImporter, catalogHash, type ExternalCatalog, type ExternalProduct } from './importer';
import { JsonSnapshotImporter } from './json-snapshot.importer';
import { MadartGeImporter } from './madart-ge.importer';

interface StoredItem {
  product: ExternalProduct;
  categoryCode: string;
  changedFields: string[];
}

/**
 * Preview → Import with de-duplication on (externalSource, externalId).
 * Only *catalog* fields are written; ProductProductionConfig is untouched
 * (spec §23). New products get a "needs configuration" production config
 * (productionRequired=false) so they can be sold immediately as non-production
 * items until an operator sets station/time.
 */
@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);
  private readonly importers: Record<string, CatalogImporter> = {
    MADART_GE: new MadartGeImporter(),
    JSON_SNAPSHOT: new JsonSnapshotImporter(),
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  registerImporter(key: string, importer: CatalogImporter) {
    this.importers[key] = importer;
  }

  async preview(body: ImportPreviewBody, actor: Actor): Promise<ImportPreviewView> {
    const importer = this.importers[body.source];
    if (!importer) throw new NotFoundError('Importer', body.source);
    const catalog = await importer.fetchCatalog();
    const source = importer.source;

    const existingProducts = await this.prisma.client.product.findMany({ where: { externalSource: source }, include: { translations: true, category: true } });
    const existingByExt = new Map(existingProducts.map((p) => [p.externalId!, p]));
    const existingCategories = await this.prisma.client.category.findMany();
    const categoryCodes = new Set(existingCategories.map((c) => c.code));
    const catByExt = new Map(catalog.categories.map((c) => [c.externalId, c]));

    const items: ImportItemPreview[] = [];
    const stored: StoredItem[] = [];
    let created = 0,
      updated = 0,
      unchanged = 0;
    for (const p of catalog.products) {
      const cat = catByExt.get(p.categoryExternalId);
      const categoryCode = cat?.code ?? 'OTHER';
      const existing = existingByExt.get(p.externalId);
      let action: CatalogImportAction;
      const changed: string[] = [];
      if (!existing) {
        action = CatalogImportAction.NEW;
        created++;
      } else {
        const ka = existing.translations.find((t) => t.locale === 'ka');
        if (ka?.name !== p.nameKa) changed.push('name');
        if ((ka?.description ?? null) !== (p.descriptionKa ?? null)) changed.push('description');
        if (existing.basePrice !== p.price) changed.push('price');
        if ((existing.imageUrl ?? null) !== (p.imageUrl ?? null)) changed.push('image');
        if (existing.category.code !== categoryCode) changed.push('category');
        if (existing.catalogHash !== catalogHash(p) && changed.length === 0) changed.push('metadata');
        action = changed.length ? CatalogImportAction.UPDATE : CatalogImportAction.UNCHANGED;
        if (changed.length) updated++;
        else unchanged++;
      }
      items.push({ externalId: p.externalId, action, name: p.nameKa, categoryCode, price: p.price, imageUrl: p.imageUrl, existingProductId: existing?.id ?? null, changedFields: changed });
      stored.push({ product: p, categoryCode, changedFields: changed });
    }

    const categories = catalog.categories.map((c) => ({ code: c.code, name: c.nameKa, isNew: !categoryCodes.has(c.code) }));
    const summary = {
      productsFound: catalog.products.length,
      categoriesFound: catalog.categories.length,
      newProducts: created,
      existingProducts: updated + unchanged,
      updatedProducts: updated,
      unchangedProducts: unchanged,
      newCategories: categories.filter((c) => c.isNew).length,
    };

    const row = await this.prisma.client.catalogImport.create({
      data: {
        source,
        status: CatalogImportStatus.PREVIEW,
        summary: { ...summary, categories: catalog.categories, fetchedAt: catalog.fetchedAt } as object,
        warnings: catalog.warnings as object,
        startedByUserId: actor.kind === 'user' ? actor.id : null,
        items: {
          create: stored.map((s, i) => ({
            externalId: s.product.externalId,
            action: items[i]!.action,
            payload: { product: s.product, categoryCode: s.categoryCode, changedFields: s.changedFields } as object,
            productId: items[i]!.existingProductId,
          })),
        },
      },
    });

    return { importId: row.id, source, status: CatalogImportStatus.PREVIEW, summary, items, categories, warnings: catalog.warnings, createdAt: row.createdAt.toISOString() };
  }

  async commit(importId: string, actor: Actor): Promise<ImportResultView> {
    const imp = await this.prisma.client.catalogImport.findUnique({ where: { id: importId }, include: { items: true } });
    if (!imp) throw new NotFoundError('CatalogImport', importId);
    if (imp.status !== CatalogImportStatus.PREVIEW) throw new StateConflictError(`Import already ${imp.status}`);
    const summary = imp.summary as unknown as { categories: ExternalCatalog['categories'] };

    let created = 0,
      updated = 0,
      unchanged = 0,
      categoriesCreated = 0;
    try {
      await this.prisma.tx(async (tx) => {
        // stations of the default (first active) branch – used for category-based production defaults
        const branch = await tx.branch.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } });
        const stations = branch ? await tx.productionStation.findMany({ where: { branchId: branch.id, active: true } }) : [];
        const stationByCode = new Map(stations.map((s) => [s.code, s.id]));
        const categoryIdByCode = new Map<string, string>();
        for (const c of summary.categories ?? []) {
          const existing = await tx.category.findUnique({ where: { code: c.code } });
          if (existing) {
            categoryIdByCode.set(c.code, existing.id);
            continue;
          }
          const row = await tx.category.create({ data: { code: c.code, nameKa: c.nameKa, nameEn: c.nameEn ?? null, nameRu: c.nameRu ?? null, sortOrder: c.sortOrder, externalSource: imp.source, externalId: c.externalId } });
          categoryIdByCode.set(c.code, row.id);
          categoriesCreated++;
        }
        let other = await tx.category.findUnique({ where: { code: 'OTHER' } });
        if (!other) other = await tx.category.create({ data: { code: 'OTHER', nameKa: 'სხვა', nameEn: 'Other', nameRu: 'Другое', sortOrder: 99 } });

        for (const item of imp.items) {
          const { product: p, categoryCode } = item.payload as unknown as { product: ExternalProduct; categoryCode: string };
          const categoryId = categoryIdByCode.get(categoryCode) ?? other.id;
          const hash = catalogHash(p);
          if (item.action === CatalogImportAction.NEW) {
            const row = await tx.product.create({
              data: {
                sku: `${imp.source}-${p.externalId}`,
                categoryId,
                basePrice: p.price,
                imageUrl: p.imageUrl,
                active: p.active,
                externalSource: imp.source,
                externalId: p.externalId,
                externalUrl: p.externalUrl,
                catalogHash: hash,
                translations: {
                  create: [
                    { locale: 'ka', name: p.nameKa, description: p.descriptionKa ?? null },
                    ...(p.nameEn ? [{ locale: 'en', name: p.nameEn, description: null }] : []),
                    ...(p.nameRu ? [{ locale: 'ru', name: p.nameRu, description: null }] : []),
                  ],
                },
                // Internal data: created once from category defaults (A-22), never overwritten by later imports.
                productionConfig: { create: defaultProductionConfig(categoryCode, stationByCode) },
              },
            });
            await tx.catalogImportItem.update({ where: { id: item.id }, data: { productId: row.id } });
            created++;
          } else if (item.action === CatalogImportAction.UPDATE && item.productId) {
            await tx.product.update({ where: { id: item.productId }, data: { categoryId, basePrice: p.price, imageUrl: p.imageUrl, externalUrl: p.externalUrl, catalogHash: hash } });
            await tx.productTranslation.upsert({
              where: { productId_locale: { productId: item.productId, locale: 'ka' } },
              update: { name: p.nameKa, description: p.descriptionKa ?? null },
              create: { productId: item.productId, locale: 'ka', name: p.nameKa, description: p.descriptionKa ?? null },
            });
            updated++;
          } else {
            unchanged++;
          }
        }
        await tx.catalogImport.update({ where: { id: importId }, data: { status: CatalogImportStatus.IMPORTED, importedAt: new Date() } });
        await this.audit.record(actor, { action: 'CATALOG_IMPORT', entityType: 'CatalogImport', entityId: importId, metadata: { source: imp.source, created, updated, unchanged, categoriesCreated } }, tx);
      });
    } catch (err) {
      await this.prisma.client.catalogImport.update({ where: { id: importId }, data: { status: CatalogImportStatus.FAILED } });
      this.logger.error(JSON.stringify({ msg: 'catalog import failed', importId, error: (err as Error).message }));
      throw err;
    }
    return { importId, status: CatalogImportStatus.IMPORTED, created, updated, unchanged, categoriesCreated, importedAt: new Date().toISOString() };
  }

  async list() {
    const rows = await this.prisma.client.catalogImport.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map((r) => ({ id: r.id, source: r.source, status: r.status, summary: r.summary, warnings: r.warnings, createdAt: r.createdAt.toISOString(), importedAt: r.importedAt?.toISOString() ?? null }));
  }
}

/**
 * ASSUMPTION A-22 – imported products get a production config derived from
 * their category so they flow through the kitchen immediately; operators
 * refine times per product in Admin. Unknown categories → no production.
 */
export const CATEGORY_PRODUCTION_DEFAULTS: Record<string, { station: string; minutes: number; buffer?: number; capacityUnits?: number }> = {
  KHACHAPURI: { station: 'HOT_KITCHEN', minutes: 30 },
  LOBIANI: { station: 'HOT_KITCHEN', minutes: 10 },
  BAKERY: { station: 'HOT_KITCHEN', minutes: 15 }, // ცხობა
  CAKES: { station: 'CAKE', minutes: 20, buffer: 5, capacityUnits: 4 },
  PASTRIES: { station: 'PASTRY', minutes: 3 },
  ECLAIRS: { station: 'PASTRY', minutes: 2 },
  CHOUX: { station: 'PASTRY', minutes: 2 },
  BOXES: { station: 'PACKAGING', minutes: 8, capacityUnits: 2 }, // ბოქსები
};

export function defaultProductionConfig(categoryCode: string, stationByCode: Map<string, string>) {
  const d = CATEGORY_PRODUCTION_DEFAULTS[categoryCode];
  const stationId = d ? stationByCode.get(d.station) : undefined;
  if (!d || !stationId) return { productionRequired: false, productionTimeMinutes: 0 };
  return { productionRequired: true, stationId, productionTimeMinutes: d.minutes, preparationBufferMinutes: d.buffer ?? 0, capacityUnits: d.capacityUnits ?? 1 };
}

@Controller('admin/catalog-imports')
export class CatalogImportController {
  constructor(private readonly imports: CatalogImportService) {}

  @Get()
  @RequirePermissions(Permission.CATALOG_IMPORT)
  list() {
    return this.imports.list();
  }

  @Post('preview')
  @RequirePermissions(Permission.CATALOG_IMPORT)
  preview(@Body(zod(importPreviewBody)) body: ImportPreviewBody, @CurrentActor() actor: Actor) {
    return this.imports.preview(body, actor);
  }

  @Post(':id/commit')
  @RequirePermissions(Permission.CATALOG_IMPORT)
  commit(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.imports.commit(id, actor);
  }
}

@Module({ controllers: [CatalogImportController], providers: [CatalogImportService], exports: [CatalogImportService] })
export class CatalogImportModule {}
