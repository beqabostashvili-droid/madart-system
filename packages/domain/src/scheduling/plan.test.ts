import { describe, expect, it } from 'vitest';
import { ProductionDisplayStatus, ProductionTaskStatus } from '../enums';
import {
  buildProductionPlan,
  compareTasksForBoard,
  computeAsapTargetReadyAt,
  computePickupSlots,
  deriveProductionDisplayStatus,
  isOnMainBoard,
  type PlannableItem,
} from './plan';

const at = (hhmm: string) => new Date(`2026-09-22T${hhmm}:00.000Z`);

const khachapuri: PlannableItem = {
  itemId: 'khachapuri',
  productionRequired: true,
  stationId: 'HOT',
  productionTimeMinutes: 30,
  preparationBufferMinutes: 0,
  capacityUnits: 1,
  quantity: 2,
  priority: 0,
};
const lobiani: PlannableItem = { ...khachapuri, itemId: 'lobiani', productionTimeMinutes: 10, quantity: 1 };
const eclair: PlannableItem = { ...khachapuri, itemId: 'eclair', stationId: 'PASTRY', productionTimeMinutes: 2, quantity: 3 };
const water: PlannableItem = { ...khachapuri, itemId: 'water', productionRequired: false, stationId: null, productionTimeMinutes: 0, quantity: 1 };

describe('buildProductionPlan – critical scenario (spec §40)', () => {
  it('plans backwards from 18:00', () => {
    const plan = buildProductionPlan([khachapuri, lobiani, eclair, water], at('18:00'), at('15:00'));
    expect(plan.tasks).toHaveLength(3); // water needs no production
    const byId = Object.fromEntries(plan.tasks.map((t) => [t.itemId, t]));
    expect(byId.khachapuri!.plannedStartAt).toEqual(at('17:30'));
    expect(byId.khachapuri!.plannedReadyAt).toEqual(at('18:00'));
    expect(byId.lobiani!.plannedStartAt).toEqual(at('17:50'));
    expect(byId.eclair!.plannedStartAt).toEqual(at('17:58'));
    expect(plan.tasks.every((t) => !t.late)).toBe(true);
    expect(plan.effectiveReadyAt).toEqual(at('18:00'));
  });

  it('quantity does not multiply duration but does multiply capacity (A-01)', () => {
    const plan = buildProductionPlan([khachapuri], at('18:00'), at('15:00'));
    expect(plan.tasks[0]!.durationMinutes).toBe(30);
    expect(plan.tasks[0]!.capacityUnits).toBe(2);
  });

  it('applies the preparation buffer before the target (A-02)', () => {
    const plan = buildProductionPlan([{ ...lobiani, preparationBufferMinutes: 5 }], at('18:00'), at('15:00'));
    expect(plan.tasks[0]!.plannedReadyAt).toEqual(at('17:55'));
    expect(plan.tasks[0]!.plannedStartAt).toEqual(at('17:45'));
  });

  it('pushes late tasks to now and adjusts the effective ready time', () => {
    const plan = buildProductionPlan([khachapuri, eclair], at('18:00'), at('17:45'));
    const k = plan.tasks.find((t) => t.itemId === 'khachapuri')!;
    expect(k.late).toBe(true);
    expect(k.plannedStartAt).toEqual(at('17:45'));
    expect(k.plannedReadyAt).toEqual(at('18:15'));
    expect(plan.effectiveReadyAt).toEqual(at('18:15'));
    expect(plan.tasks.find((t) => t.itemId === 'eclair')!.late).toBe(false);
  });

  it('throws when a production item has no station', () => {
    expect(() => buildProductionPlan([{ ...khachapuri, stationId: null }], at('18:00'), at('15:00'))).toThrow(/station/);
  });
});

describe('computeAsapTargetReadyAt (A-03)', () => {
  it('uses the longest duration + buffer, rounded up to the minute', () => {
    const now = new Date('2026-09-22T15:00:20.000Z');
    expect(computeAsapTargetReadyAt([khachapuri, lobiani, water], now)).toEqual(at('15:31'));
  });
  it('is now when nothing needs production', () => {
    expect(computeAsapTargetReadyAt([water], at('15:00'))).toEqual(at('15:00'));
  });
});

describe('deriveProductionDisplayStatus (A-04)', () => {
  const task = { status: ProductionTaskStatus.SCHEDULED, plannedStartAt: at('17:30'), plannedReadyAt: at('18:00') };
  it.each([
    ['17:00', ProductionDisplayStatus.SCHEDULED],
    ['17:25', ProductionDisplayStatus.STARTING_SOON],
    ['17:30', ProductionDisplayStatus.START_NOW],
    ['17:32', ProductionDisplayStatus.START_NOW],
    ['17:33', ProductionDisplayStatus.LATE],
  ])('scheduled task at %s → %s', (time, expected) => {
    expect(deriveProductionDisplayStatus(task, at(time))).toBe(expected);
  });
  it('in production becomes LATE after planned ready', () => {
    const t = { ...task, status: ProductionTaskStatus.IN_PRODUCTION };
    expect(deriveProductionDisplayStatus(t, at('17:59'))).toBe(ProductionDisplayStatus.IN_PRODUCTION);
    expect(deriveProductionDisplayStatus(t, at('18:01'))).toBe(ProductionDisplayStatus.LATE);
  });
  it('ready stays ready', () => {
    expect(deriveProductionDisplayStatus({ ...task, status: ProductionTaskStatus.READY }, at('19:00'))).toBe(
      ProductionDisplayStatus.READY,
    );
  });
});

describe('board ordering & horizon', () => {
  const base = { status: ProductionTaskStatus.SCHEDULED, priority: 0, createdAt: at('15:00') };
  it('puts late tasks first, then by planned start', () => {
    const now = at('17:40');
    const late = { ...base, plannedStartAt: at('17:30'), plannedReadyAt: at('18:00'), targetReadyAt: at('18:00') };
    const soon = { ...base, plannedStartAt: at('17:42'), plannedReadyAt: at('17:52'), targetReadyAt: at('17:52') };
    const later = { ...base, plannedStartAt: at('17:50'), plannedReadyAt: at('18:00'), targetReadyAt: at('18:00') };
    const sorted = [later, soon, late].sort((a, b) => compareTasksForBoard(a, b, now));
    expect(sorted).toEqual([late, soon, later]);
  });
  it('hides tasks beyond the horizon (A-13)', () => {
    const t = { ...base, plannedStartAt: at('19:30'), plannedReadyAt: at('20:00') };
    expect(isOnMainBoard(t, at('15:00'))).toBe(false);
    expect(isOnMainBoard(t, at('18:45'))).toBe(true);
    expect(isOnMainBoard({ ...t, status: ProductionTaskStatus.IN_PRODUCTION }, at('15:00'))).toBe(true);
  });
});

describe('computePickupSlots (A-14)', () => {
  const common = {
    now: at('15:07'),
    opensAt: at('09:00'),
    closesAt: at('16:00'),
    slotMinutes: 15,
    minLeadMinutes: 30,
    items: [khachapuri],
  };
  it('offers 15-minute slots after the minimum lead time up to closing', () => {
    const slots = computePickupSlots({ ...common, rules: [], existingLoad: [] });
    expect(slots.map((s) => s.startsAt.toISOString().slice(11, 16))).toEqual(['15:45', '16:00']);
    expect(slots.every((s) => s.available)).toBe(true);
  });
  it('marks a slot unavailable when station capacity is exceeded', () => {
    const slots = computePickupSlots({
      ...common,
      rules: [{ stationId: 'HOT', windowMinutes: 30, maxCapacityUnits: 3 }],
      existingLoad: [{ stationId: 'HOT', plannedStartAt: at('15:15'), plannedReadyAt: at('15:45'), capacityUnits: 2 }],
    });
    // 15:45 slot → khachapuri 15:15–15:45 overlaps existing 2 units + own 2 = 4 > 3
    expect(slots[0]).toMatchObject({ available: false, reason: 'CAPACITY' });
    // 16:00 slot → 15:30–16:00 overlaps the existing task (15:15-15:45) too → also full
    expect(slots[1]).toMatchObject({ available: false, reason: 'CAPACITY' });
  });
});
