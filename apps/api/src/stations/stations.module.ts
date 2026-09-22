import type { ProductionStation } from '@madart/database';
import { Permission } from '@madart/domain';
import { type CreateStationBody, createStationBody, type StationView, type UpdateStationBody, updateStationBody } from '@madart/types';
import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { type Actor, scopedBranchId } from '../auth/actor';
import { CurrentActor, RequirePermissions } from '../auth/decorators';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';
import { zod } from '../common/validation/zod.pipe';

export function toStationView(s: ProductionStation): StationView {
  return { id: s.id, branchId: s.branchId, code: s.code, name: s.name, color: s.color, sortOrder: s.sortOrder, active: s.active };
}

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(branchId: string | null): Promise<StationView[]> {
    const rows = await this.prisma.client.productionStation.findMany({
      where: branchId ? { branchId } : {},
      orderBy: [{ branchId: 'asc' }, { sortOrder: 'asc' }],
    });
    return rows.map(toStationView);
  }

  async create(body: CreateStationBody): Promise<StationView> {
    return toStationView(await this.prisma.client.productionStation.create({ data: body }));
  }

  async update(id: string, body: UpdateStationBody): Promise<StationView> {
    const existing = await this.prisma.client.productionStation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Station', id);
    return toStationView(await this.prisma.client.productionStation.update({ where: { id }, data: body }));
  }
}

@Controller()
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Get('stations')
  @RequirePermissions(Permission.CATALOG_READ)
  list(@CurrentActor() actor: Actor, @Query('branchId') branchId?: string) {
    return this.stations.list(scopedBranchId(actor, branchId ?? null));
  }

  @Post('admin/stations')
  @RequirePermissions(Permission.STATIONS_WRITE)
  create(@Body(zod(createStationBody)) body: CreateStationBody) {
    return this.stations.create(body);
  }

  @Patch('admin/stations/:id')
  @RequirePermissions(Permission.STATIONS_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body(zod(updateStationBody)) body: UpdateStationBody) {
    return this.stations.update(id, body);
  }
}

@Module({ controllers: [StationsController], providers: [StationsService], exports: [StationsService] })
export class StationsModule {}
