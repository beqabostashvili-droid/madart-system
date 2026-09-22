import type { Branch } from '@madart/database';
import type { BranchView, CreateBranchBody, OpeningHours, UpdateBranchBody } from '@madart/types';
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../common/errors/http-exception.filter';
import { PrismaService } from '../common/prisma/prisma.service';

export function toBranchView(b: Branch): BranchView {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address,
    timeZone: b.timeZone,
    orderNumberPrefix: b.orderNumberPrefix,
    openingHours: (b.openingHours as unknown as OpeningHours) ?? {},
    pickupMinLeadMinutes: b.pickupMinLeadMinutes,
    pickupSlotMinutes: b.pickupSlotMinutes,
    active: b.active,
  };
}

/** Resolves today's opening window of a branch as UTC instants. */
export function openingWindow(branch: Branch, day: Date): { opensAt: Date; closesAt: Date; closed: boolean } {
  const hours = (branch.openingHours as unknown as OpeningHours) ?? {};
  const weekday = dayIndex(branch.timeZone, day);
  const entry = hours[String(weekday)] ?? { open: '00:00', close: '23:59' };
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: branch.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(day);
  return {
    opensAt: zonedTime(dateKey, entry.open, branch.timeZone),
    closesAt: zonedTime(dateKey, entry.close, branch.timeZone),
    closed: entry.closed === true,
  };
}

function dayIndex(timeZone: string, day: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(day);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Converts "YYYY-MM-DD" + "HH:mm" in a time zone to a UTC Date (no library). */
export function zonedTime(dateKey: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - at.getTime();
}

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<BranchView[]> {
    const rows = await this.prisma.client.branch.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    return rows.map(toBranchView);
  }

  async listAll(): Promise<BranchView[]> {
    const rows = await this.prisma.client.branch.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toBranchView);
  }

  async getOrThrow(id: string): Promise<Branch> {
    const b = await this.prisma.client.branch.findUnique({ where: { id } });
    if (!b) throw new NotFoundError('Branch', id);
    return b;
  }

  async create(body: CreateBranchBody): Promise<BranchView> {
    const b = await this.prisma.client.branch.create({ data: { ...body, openingHours: body.openingHours as object } });
    return toBranchView(b);
  }

  async update(id: string, body: UpdateBranchBody): Promise<BranchView> {
    await this.getOrThrow(id);
    const b = await this.prisma.client.branch.update({
      where: { id },
      data: { ...body, openingHours: body.openingHours as object | undefined },
    });
    return toBranchView(b);
  }
}
