import { type Prisma } from '@madart/database';
import { isAvailableForSource, type Locale, localizedField, type OrderSource, pickTranslation, resolveProductForBranch } from '@madart/domain';
import type {
  AdminProductView,
  CatalogProductView,
  CatalogView,
  CategoryView,
  CreateCategoryBody,
  CreateProductBody,
  ProductBranchInput,
  ProductionConfigInput,
  UpdateCategoryBody,
  UpdateProductBody,
} from '@madart/types';
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';

const productInclude = {
  translations: true,
  productionConfig: { include: { station: true } },
  branches: true,
  modifierGroups: { include: { modifiers: { orderBy: { sortOrder: 'asc' as const } } }, orderBy: { sortOrder: 'asc' as const } },
  recommendations: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export function toCategoryView(c: { id: string; code: string; nameKa: string; nameEn: string | null; nameRu: string | null; imageUrl: string | null; sortOrder: number; active: boolean }, locale: Locale): CategoryView {
  return { id: c.id, code: c.code, name: localizedField(c, locale), nameKa: c.nameKa, nameEn: c.nameEn, nameRu: c.nameRu, imageUrl: c.imageUrl, sortOrder: c.sortOrder, active: c.active };
}

export function toAdminProductView(p: ProductRow): AdminProductView {
  const cfg = p.productionConfig;
  return {
    id: p.id,
    sku: p.sku,
    categoryId: p.categoryId,
    basePrice: p.basePrice,
    imageUrl: p.imageUrl,
    active: p.active,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    availableKiosk: p.availableKiosk,
    availablePos: p.availablePos,
    availableMobile: p.availableMobile,
    externalSource: p.externalSource,
    externalId: p.externalId,
    externalUrl: p.externalUrl,
    translations: p.translations.map((t) => ({ locale: t.locale as Locale, name: t.name, description: t.description })),
    productionConfig: {
      productionRequired: cfg?.productionRequired ?? false,
      stationId: cfg?.stationId ?? null,
      stationCode: cfg?.station?.code ?? null,
      productionTimeMinutes: cfg?.productionTimeMinutes ?? 0,
      preparationBufferMinutes: cfg?.preparationBufferMinutes ?? 0,
      capacityUnits: cfg?.capacityUnits ?? 1,
      priority: cfg?.priority ?? 0,
    },
    branchOverrides: p.branches.map((b) => ({
      branchId: b.branchId,
      available: b.available,
      priceOverride: b.priceOverride,
      availableKiosk: b.availableKiosk,
      availablePos: b.availablePos,
      availableMobile: b.availableMobile,
      stationOverrideId: b.stationOverrideId,
    })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────── channel catalog ─────────────────────────

  async channelCatalog(branchId: string, channel: OrderSource, locale: Locale): Promise<CatalogView> {
    const [categories, products] = await Promise.all([
      this.prisma.client.category.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.client.product.findMany({
        where: { archivedAt: null, active: true },
        include: productInclude,
        orderBy: [{ categoryId: 'asc' }, { sku: 'asc' }],
      }),
    ]);

    const views: CatalogProductView[] = [];
    for (const p of products) {
      const override = p.branches.find((b) => b.branchId === branchId) ?? null;
      const resolved = resolveProductForBranch(p, override);
      if (!isAvailableForSource(resolved, channel)) continue;
      const t = pickTranslation(p.translations.map((x) => ({ ...x, locale: x.locale as Locale })), locale);
      views.push({
        id: p.id,
        sku: p.sku,
        categoryId: p.categoryId,
        name: t?.name ?? p.sku,
        description: t?.description ?? null,
        price: resolved.price,
        imageUrl: p.imageUrl,
        available: true,
        productionTimeMinutes: p.productionConfig?.productionRequired ? p.productionConfig.productionTimeMinutes : 0,
        modifierGroups: p.modifierGroups.map((g) => ({
          id: g.id,
          name: localizedField(g, locale),
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          modifiers: g.modifiers.filter((m) => m.active).map((m) => ({ id: m.id, name: localizedField(m, locale), priceDelta: m.priceDelta, active: m.active })),
        })),
        recommendedProductIds: p.recommendations.map((r) => r.recommendedProductId),
      });
    }
    const usedCategories = new Set(views.map((v) => v.categoryId));
    return {
      branchId,
      locale,
      categories: categories.filter((c) => usedCategories.has(c.id)).map((c) => toCategoryView(c, locale)),
      products: views,
    };
  }

  // ───────────────────────────── categories (admin) ──────────────────────

  async listCategories(locale: Locale = 'ka'): Promise<CategoryView[]> {
    const rows = await this.prisma.client.category.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((c) => toCategoryView(c, locale));
  }

  async createCategory(body: CreateCategoryBody): Promise<CategoryView> {
    return toCategoryView(await this.prisma.client.category.create({ data: body }), 'ka');
  }

  async updateCategory(id: string, body: UpdateCategoryBody): Promise<CategoryView> {
    const existing = await this.prisma.client.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Category', id);
    return toCategoryView(await this.prisma.client.category.update({ where: { id }, data: body }), 'ka');
  }

  // ───────────────────────────── products (admin) ────────────────────────

  async listProducts(filter: { search?: string; categoryId?: string; includeArchived?: boolean }): Promise<AdminProductView[]> {
    const rows = await this.prisma.client.product.findMany({
      where: {
        ...(filter.includeArchived ? {} : { archivedAt: null }),
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.search
          ? { OR: [{ sku: { contains: filter.search, mode: 'insensitive' } }, { translations: { some: { name: { contains: filter.search, mode: 'insensitive' } } } }] }
          : {}),
      },
      include: productInclude,
      orderBy: [{ categoryId: 'asc' }, { sku: 'asc' }],
    });
    return rows.map(toAdminProductView);
  }

  async getProduct(id: string): Promise<AdminProductView> {
    const p = await this.prisma.client.product.findUnique({ where: { id }, include: productInclude });
    if (!p) throw new NotFoundError('Product', id);
    return toAdminProductView(p);
  }

  async createProduct(body: CreateProductBody): Promise<AdminProductView> {
    const { translations, productionConfig, ...rest } = body;
    const p = await this.prisma.client.product.create({
      data: {
        ...rest,
        translations: { create: translations.map((t) => ({ locale: t.locale, name: t.name, description: t.description ?? null })) },
        productionConfig: {
          create: productionConfig ?? { productionRequired: false, stationId: null, productionTimeMinutes: 0, preparationBufferMinutes: 0, capacityUnits: 1, priority: 0 },
        },
      },
    });
    return this.getProduct(p.id);
  }

  async updateProduct(id: string, body: UpdateProductBody): Promise<AdminProductView> {
    await this.getProduct(id);
    const { translations, productionConfig, ...rest } = body;
    await this.prisma.tx(async (tx) => {
      await tx.product.update({ where: { id }, data: rest });
      if (translations) {
        for (const t of translations) {
          await tx.productTranslation.upsert({
            where: { productId_locale: { productId: id, locale: t.locale } },
            update: { name: t.name, description: t.description ?? null },
            create: { productId: id, locale: t.locale, name: t.name, description: t.description ?? null },
          });
        }
      }
      if (productionConfig) {
        await tx.productProductionConfig.upsert({ where: { productId: id }, update: productionConfig, create: { productId: id, ...productionConfig } });
      }
    });
    return this.getProduct(id);
  }

  async setProductState(id: string, state: 'enable' | 'disable' | 'archive'): Promise<AdminProductView> {
    await this.getProduct(id);
    const data = state === 'enable' ? { active: true, archivedAt: null } : state === 'disable' ? { active: false } : { active: false, archivedAt: new Date() };
    await this.prisma.client.product.update({ where: { id }, data });
    return this.getProduct(id);
  }

  async setProductionConfig(id: string, cfg: ProductionConfigInput): Promise<AdminProductView> {
    await this.getProduct(id);
    await this.prisma.client.productProductionConfig.upsert({ where: { productId: id }, update: cfg, create: { productId: id, ...cfg } });
    return this.getProduct(id);
  }

  async setBranchOverride(id: string, branchId: string, input: ProductBranchInput): Promise<AdminProductView> {
    await this.getProduct(id);
    await this.prisma.client.productBranch.upsert({
      where: { productId_branchId: { productId: id, branchId } },
      update: input,
      create: { productId: id, branchId, ...input },
    });
    return this.getProduct(id);
  }
}
