import { Permission, type RoleCode } from '@madart/domain';
import {
  type CreateUserBody,
  createUserBody,
  type RoleView,
  type SystemSettingView,
  type UpdateUserBody,
  updateRoleBody,
  updateUserBody,
  upsertSettingBody,
  type UserView,
} from '@madart/types';
import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import { type Actor, scopedBranchId } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { zod } from '../common/validation/zod.pipe';

const userInclude = { roles: { include: { role: true } } } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toView(u: { id: string; email: string; displayName: string; branchId: string | null; active: boolean; createdAt: Date; roles: { role: { code: string } }[] }): UserView {
    return { id: u.id, email: u.email, displayName: u.displayName, branchId: u.branchId, roles: u.roles.map((r) => r.role.code as RoleCode), active: u.active, createdAt: u.createdAt.toISOString() };
  }

  async list(branchId: string | null): Promise<UserView[]> {
    const rows = await this.prisma.client.user.findMany({ where: branchId ? { branchId } : {}, include: userInclude, orderBy: { displayName: 'asc' } });
    return rows.map((u) => this.toView(u));
  }

  async create(body: CreateUserBody, actor: Actor): Promise<UserView> {
    const roles = await this.prisma.client.role.findMany({ where: { code: { in: body.roles } } });
    const user = await this.prisma.client.user.create({
      data: {
        email: body.email.toLowerCase(),
        displayName: body.displayName,
        passwordHash: await bcrypt.hash(body.password, 10),
        pin: body.pin ?? null,
        branchId: body.branchId ?? null,
        active: body.active,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      include: userInclude,
    });
    await this.audit.record(actor, { action: 'USER_CREATED', entityType: 'User', entityId: user.id, metadata: { roles: body.roles } });
    return this.toView(user);
  }

  async update(id: string, body: UpdateUserBody, actor: Actor): Promise<UserView> {
    const existing = await this.prisma.client.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('User', id);
    const { roles, password, ...rest } = body;
    const user = await this.prisma.tx(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { ...rest, email: rest.email?.toLowerCase(), ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      });
      if (roles) {
        const roleRows = await tx.role.findMany({ where: { code: { in: roles } } });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleRows.map((r) => ({ userId: id, roleId: r.id })) });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: userInclude });
    });
    await this.audit.record(actor, { action: 'USER_UPDATED', entityType: 'User', entityId: id, metadata: { fields: Object.keys(body) } });
    return this.toView(user);
  }

  async listRoles(): Promise<RoleView[]> {
    const rows = await this.prisma.client.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { code: 'asc' } });
    return rows.map((r) => ({ id: r.id, code: r.code as RoleCode, name: r.name, permissions: r.permissions.map((p) => p.permission.code) }));
  }

  async updateRole(id: string, body: z.infer<typeof updateRoleBody>, actor: Actor): Promise<RoleView> {
    const role = await this.prisma.client.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError('Role', id);
    await this.prisma.tx(async (tx) => {
      if (body.name) await tx.role.update({ where: { id }, data: { name: body.name } });
      if (body.permissions) {
        const perms = await tx.permission.findMany({ where: { code: { in: body.permissions } } });
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) });
      }
    });
    await this.audit.record(actor, { action: 'ROLE_UPDATED', entityType: 'Role', entityId: id, metadata: { permissions: body.permissions } });
    return (await this.listRoles()).find((r) => r.id === id)!;
  }
}

@Controller('admin')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @RequirePermissions(Permission.USERS_READ)
  list(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string) {
    return this.users.list(scopedBranchId(actor, branchId ?? null));
  }

  @Post('users')
  @RequirePermissions(Permission.USERS_WRITE)
  create(@Body(zod(createUserBody)) body: CreateUserBody, @CurrentActor() actor: Actor) {
    return this.users.create(body, actor);
  }

  @Patch('users/:id')
  @RequirePermissions(Permission.USERS_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updateUserBody)) body: UpdateUserBody, @CurrentActor() actor: Actor) {
    return this.users.update(id, body, actor);
  }

  @Get('roles')
  @RequirePermissions(Permission.USERS_READ)
  roles() {
    return this.users.listRoles();
  }

  @Patch('roles/:id')
  @RequirePermissions(Permission.ROLES_WRITE)
  updateRole(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updateRoleBody)) body: z.infer<typeof updateRoleBody>, @CurrentActor() actor: Actor) {
    return this.users.updateRole(id, body, actor);
  }

  @Get('permissions')
  @RequirePermissions(Permission.USERS_READ)
  permissions() {
    return Object.values(Permission);
  }

  @Get('settings')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  async listSettings(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string): Promise<SystemSettingView[]> {
    const rows = await this.settings.list(scopedBranchId(actor, branchId ?? null));
    return rows.map((r) => ({ key: r.key, value: r.value, branchId: r.branchId }));
  }

  @Put('settings')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  async upsertSetting(@Body(zod(upsertSettingBody)) body: z.infer<typeof upsertSettingBody>, @CurrentActor() actor: Actor): Promise<SystemSettingView> {
    const row = await this.settings.upsert(body.key, body.value, body.branchId ?? null);
    await this.audit.record(actor, { action: 'SETTING_UPDATED', entityType: 'SystemSetting', entityId: row.id, metadata: { key: body.key, value: body.value } });
    return { key: row.key, value: row.value, branchId: row.branchId };
  }
}

@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
