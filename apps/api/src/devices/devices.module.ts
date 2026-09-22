import type { Device } from '@madart/database';
import { Permission } from '@madart/domain';
import { type CreateDeviceBody, createDeviceBody, type DeviceView, type DeviceWithTokenView, type UpdateDeviceBody, updateDeviceBody } from '@madart/types';
import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { type Actor, scopedBranchId } from '../auth/actor';
import { AuthService } from '../auth/auth.service';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import { zod } from '../common/validation/zod.pipe';

const ONLINE_WINDOW_MS = 2 * 60_000;

export function toDeviceView(d: Device): DeviceView {
  return {
    id: d.id,
    type: d.type,
    name: d.name,
    branchId: d.branchId,
    stationId: d.stationId,
    active: d.active,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    online: !!d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
    settings: (d.settings as Record<string, unknown>) ?? {},
    createdAt: d.createdAt.toISOString(),
  };
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(branchId: string | null): Promise<DeviceView[]> {
    const rows = await this.prisma.client.device.findMany({ where: branchId ? { branchId } : {}, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    return rows.map(toDeviceView);
  }

  async create(body: CreateDeviceBody, actor: Actor): Promise<DeviceWithTokenView> {
    const device = await this.prisma.client.device.create({
      data: { type: body.type, name: body.name, branchId: body.branchId, stationId: body.stationId ?? null, settings: body.settings as object, tokenHash: `pending-${Date.now()}` },
    });
    const token = await this.auth.issueDeviceToken(device.id);
    await this.audit.record(actor, { action: 'DEVICE_REGISTERED', entityType: 'Device', entityId: device.id, branchId: device.branchId });
    const fresh = await this.prisma.client.device.findUniqueOrThrow({ where: { id: device.id } });
    return { ...toDeviceView(fresh), token };
  }

  async update(id: string, body: UpdateDeviceBody, actor: Actor): Promise<DeviceView> {
    const existing = await this.prisma.client.device.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Device', id);
    const d = await this.prisma.client.device.update({
      where: { id },
      data: { ...body, settings: body.settings as object | undefined },
    });
    await this.audit.record(actor, { action: 'DEVICE_UPDATED', entityType: 'Device', entityId: id, branchId: d.branchId, metadata: body as Record<string, unknown> });
    return toDeviceView(d);
  }

  async rotateToken(id: string, actor: Actor): Promise<DeviceWithTokenView> {
    const existing = await this.prisma.client.device.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Device', id);
    const token = await this.auth.issueDeviceToken(id);
    await this.audit.record(actor, { action: 'DEVICE_TOKEN_ROTATED', entityType: 'Device', entityId: id, branchId: existing.branchId });
    const fresh = await this.prisma.client.device.findUniqueOrThrow({ where: { id } });
    return { ...toDeviceView(fresh), token };
  }
}

@Controller('admin/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions(Permission.DEVICES_READ)
  list(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string) {
    return this.devices.list(scopedBranchId(actor, branchId ?? null));
  }

  @Post()
  @RequirePermissions(Permission.DEVICES_WRITE)
  create(@Body(zod(createDeviceBody)) body: CreateDeviceBody, @CurrentActor() actor: Actor) {
    return this.devices.create(body, actor);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DEVICES_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updateDeviceBody)) body: UpdateDeviceBody, @CurrentActor() actor: Actor) {
    return this.devices.update(id, body, actor);
  }

  @Post(':id/rotate-token')
  @RequirePermissions(Permission.DEVICES_WRITE)
  rotate(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.devices.rotateToken(id, actor);
  }
}

@Module({ controllers: [DevicesController], providers: [DevicesService], exports: [DevicesService] })
export class DevicesModule {}
