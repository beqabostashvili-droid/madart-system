import { Permission } from '@madart/domain';
import { type CreateBranchBody, createBranchBody, type UpdateBranchBody, updateBranchBody } from '@madart/types';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Public, RequirePermissions } from '../auth/decorators';
import { zod } from '../common/validation/zod.pipe';
import { BranchesService } from './branches.service';

@Controller()
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  /** Public: mobile ordering picks a branch before anything else. */
  @Public()
  @Get('branches')
  listActive() {
    return this.branches.listActive();
  }

  @Get('admin/branches')
  @RequirePermissions(Permission.BRANCHES_READ)
  listAll() {
    return this.branches.listAll();
  }

  @Post('admin/branches')
  @RequirePermissions(Permission.BRANCHES_WRITE)
  create(@Body(zod(createBranchBody)) body: CreateBranchBody) {
    return this.branches.create(body);
  }

  @Patch('admin/branches/:id')
  @RequirePermissions(Permission.BRANCHES_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updateBranchBody)) body: UpdateBranchBody) {
    return this.branches.update(id, body);
  }
}
