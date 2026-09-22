import { Permission } from '@madart/domain';
import {
  adminProductsQuery,
  type CatalogQuery,
  catalogQuery,
  type CreateCategoryBody,
  createCategoryBody,
  type CreateProductBody,
  createProductBody,
  type ProductBranchInput,
  productBranchInput,
  type ProductionConfigInput,
  productionConfigInput,
  type UpdateCategoryBody,
  updateCategoryBody,
  type UpdateProductBody,
  updateProductBody,
} from '@madart/types';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { type Actor, assertBranchAccess } from '../auth/actor';
import { CurrentActor, Public, RequirePermissions } from '../auth/decorators';
import { zod } from '../common/validation/zod.pipe';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Channel catalog. Public for MOBILE; devices must match their branch. */
  @Public()
  @Get('catalog')
  channelCatalog(@Query(zod(catalogQuery)) q: CatalogQuery, @CurrentActor() actor: Actor | undefined) {
    if (actor) assertBranchAccess(actor, q.branchId);
    return this.catalog.channelCatalog(q.branchId, q.channel, q.locale);
  }

  // ── categories
  @Get('admin/categories')
  @RequirePermissions(Permission.CATALOG_READ)
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post('admin/categories')
  @RequirePermissions(Permission.CATALOG_WRITE)
  createCategory(@Body(zod(createCategoryBody)) body: CreateCategoryBody) {
    return this.catalog.createCategory(body);
  }

  @Patch('admin/categories/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updateCategoryBody)) body: UpdateCategoryBody) {
    return this.catalog.updateCategory(id, body);
  }

  // ── products
  @Get('admin/products')
  @RequirePermissions(Permission.CATALOG_READ)
  listProducts(@Query(zod(adminProductsQuery)) q: z.infer<typeof adminProductsQuery>) {
    return this.catalog.listProducts(q);
  }

  @Get('admin/products/:id')
  @RequirePermissions(Permission.CATALOG_READ)
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getProduct(id);
  }

  @Post('admin/products')
  @RequirePermissions(Permission.CATALOG_WRITE)
  createProduct(@Body(zod(createProductBody)) body: CreateProductBody) {
    return this.catalog.createProduct(body);
  }

  @Patch('admin/products/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateProduct(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updateProductBody)) body: UpdateProductBody) {
    return this.catalog.updateProduct(id, body);
  }

  @Post('admin/products/:id/enable')
  @RequirePermissions(Permission.CATALOG_WRITE)
  enable(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.setProductState(id, 'enable');
  }

  @Post('admin/products/:id/disable')
  @RequirePermissions(Permission.CATALOG_WRITE)
  disable(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.setProductState(id, 'disable');
  }

  @Post('admin/products/:id/archive')
  @RequirePermissions(Permission.CATALOG_WRITE)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.setProductState(id, 'archive');
  }

  @Put('admin/products/:id/production-config')
  @RequirePermissions(Permission.PRODUCTION_CONFIG_WRITE)
  setProductionConfig(@Param('id', ParseUUIDPipe) id: string, @Body(zod(productionConfigInput)) body: ProductionConfigInput) {
    return this.catalog.setProductionConfig(id, body);
  }

  @Put('admin/products/:id/branches/:branchId')
  @RequirePermissions(Permission.CATALOG_WRITE)
  setBranchOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body(zod(productBranchInput)) body: ProductBranchInput,
  ) {
    return this.catalog.setBranchOverride(id, branchId, body);
  }
}
