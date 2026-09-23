import { Permission } from '@madart/domain';
import {
  type CreatePromotionBody,
  createPromotionBody,
  type PromotionsQuery,
  promotionsQuery,
  type UpdatePromotionBody,
  updatePromotionBody,
} from '@madart/types';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { type Actor, assertBranchAccess } from '../auth/actor';
import { CurrentActor, Public, RequirePermissions } from '../auth/decorators';
import { zod } from '../common/validation/zod.pipe';
import { PromotionsService } from './promotions.service';

@Controller()
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /** Kiosk/mobile banner strip. Public; devices are still branch-checked. */
  @Public()
  @Get('promotions')
  active(@Query(zod(promotionsQuery)) q: PromotionsQuery, @CurrentActor() actor: Actor | undefined) {
    if (actor) assertBranchAccess(actor, q.branchId);
    return this.promotions.active(q.branchId, q.locale);
  }

  @Get('admin/promotions')
  @RequirePermissions(Permission.CATALOG_READ)
  list(@Query('branchId') branchId?: string) {
    return this.promotions.listAdmin(branchId);
  }

  @Post('admin/promotions')
  @RequirePermissions(Permission.CATALOG_WRITE)
  create(@Body(zod(createPromotionBody)) body: CreatePromotionBody) {
    return this.promotions.create(body);
  }

  @Patch('admin/promotions/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updatePromotionBody)) body: UpdatePromotionBody) {
    return this.promotions.update(id, body);
  }

  @Delete('admin/promotions/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotions.remove(id);
  }
}
