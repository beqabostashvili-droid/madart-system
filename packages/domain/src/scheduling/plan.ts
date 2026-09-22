/**
 * Production Scheduling Engine – pure functions (docs/PRODUCTION_SCHEDULING.md).
 */
import { ProductionDisplayStatus, ProductionTaskStatus } from '../enums';

export const MINUTE = 60_000;

export interface PlannableItem {
  /** Order item id (or any correlation id). */
  itemId: string;
  productionRequired: boolean;
  stationId: string | null;
  productionTimeMinutes: number;
  preparationBufferMinutes: number;
  capacityUnits: number;
  quantity: number;
  priority: number;
}

export interface PlannedTask {
  itemId: string;
  stationId: string;
  durationMinutes: number;
  capacityUnits: number;
  quantity: number;
  priority: number;
  plannedStartAt: Date;
  plannedReadyAt: Date;
  /** true when the target could not be honoured and the task was pushed to `now`. */
  late: boolean;
}

export interface ProductionPlan {
  targetReadyAt: Date;
  /** Adjusted target when at least one task is late; equals targetReadyAt otherwise. */
  effectiveReadyAt: Date;
  tasks: PlannedTask[];
}

function ceilToMinute(d: Date): Date {
  return new Date(Math.ceil(d.getTime() / MINUTE) * MINUTE);
}

/** ASSUMPTION A-03 – the critical path of the order, rounded up to the minute. */
export function computeAsapTargetReadyAt(items: readonly PlannableItem[], now: Date): Date {
  const longest = items
    .filter((i) => i.productionRequired)
    .reduce((max, i) => Math.max(max, i.productionTimeMinutes + i.preparationBufferMinutes), 0);
  return ceilToMinute(new Date(now.getTime() + longest * MINUTE));
}

/**
 * Backward scheduling: every task is planned to be ready at
 * `targetReadyAt − buffer` and to start `duration` before that (A-01, A-02).
 * Tasks whose start would already be in the past are pushed to `now`.
 */
export function buildProductionPlan(
  items: readonly PlannableItem[],
  targetReadyAt: Date,
  now: Date,
): ProductionPlan {
  const tasks: PlannedTask[] = [];
  let effective = targetReadyAt.getTime();

  for (const item of items) {
    if (!item.productionRequired) continue;
    if (!item.stationId) {
      throw new Error(`Item ${item.itemId} requires production but has no station`);
    }
    const duration = Math.max(0, item.productionTimeMinutes);
    let ready = targetReadyAt.getTime() - item.preparationBufferMinutes * MINUTE;
    let start = ready - duration * MINUTE;
    let late = false;
    if (start < now.getTime()) {
      start = now.getTime();
      ready = start + duration * MINUTE;
      late = true;
      effective = Math.max(effective, ready + item.preparationBufferMinutes * MINUTE);
    }
    tasks.push({
      itemId: item.itemId,
      stationId: item.stationId,
      durationMinutes: duration,
      capacityUnits: item.capacityUnits * item.quantity,
      quantity: item.quantity,
      priority: item.priority,
      plannedStartAt: new Date(start),
      plannedReadyAt: new Date(ready),
      late,
    });
  }

  return { targetReadyAt, effectiveReadyAt: new Date(effective), tasks };
}

// ---------------------------------------------------------------------------
// Derived display status (ASSUMPTION A-04)
// ---------------------------------------------------------------------------

export interface DisplayStatusThresholds {
  startingSoonMinutes: number;
  lateGraceMinutes: number;
}

export const DEFAULT_THRESHOLDS: DisplayStatusThresholds = { startingSoonMinutes: 5, lateGraceMinutes: 2 };

export interface TaskTiming {
  status: ProductionTaskStatus;
  plannedStartAt: Date | string;
  plannedReadyAt: Date | string;
}

export function deriveProductionDisplayStatus(
  task: TaskTiming,
  now: Date,
  thresholds: DisplayStatusThresholds = DEFAULT_THRESHOLDS,
): ProductionDisplayStatus {
  const t = now.getTime();
  const start = new Date(task.plannedStartAt).getTime();
  const ready = new Date(task.plannedReadyAt).getTime();

  switch (task.status) {
    case ProductionTaskStatus.READY:
      return ProductionDisplayStatus.READY;
    case ProductionTaskStatus.CANCELLED:
      return ProductionDisplayStatus.CANCELLED;
    case ProductionTaskStatus.IN_PRODUCTION:
      return t > ready ? ProductionDisplayStatus.LATE : ProductionDisplayStatus.IN_PRODUCTION;
    case ProductionTaskStatus.SCHEDULED:
      if (t > start + thresholds.lateGraceMinutes * MINUTE) return ProductionDisplayStatus.LATE;
      if (t >= start) return ProductionDisplayStatus.START_NOW;
      if (t >= start - thresholds.startingSoonMinutes * MINUTE) return ProductionDisplayStatus.STARTING_SOON;
      return ProductionDisplayStatus.SCHEDULED;
  }
}

// ---------------------------------------------------------------------------
// Board ordering (spec §50)
// ---------------------------------------------------------------------------

export interface BoardTask extends TaskTiming {
  targetReadyAt: Date | string;
  priority: number;
  createdAt: Date | string;
}

export function compareTasksForBoard(a: BoardTask, b: BoardTask, now: Date, thresholds = DEFAULT_THRESHOLDS): number {
  const da = deriveProductionDisplayStatus(a, now, thresholds);
  const db = deriveProductionDisplayStatus(b, now, thresholds);
  const aLate = da === ProductionDisplayStatus.LATE ? 1 : 0;
  const bLate = db === ProductionDisplayStatus.LATE ? 1 : 0;
  if (aLate !== bLate) return bLate - aLate; // late first
  const sa = new Date(a.plannedStartAt).getTime();
  const sb = new Date(b.plannedStartAt).getTime();
  if (sa !== sb) return sa - sb;
  const ta = new Date(a.targetReadyAt).getTime();
  const tb = new Date(b.targetReadyAt).getTime();
  if (ta !== tb) return ta - tb;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/** ASSUMPTION A-13 – tasks far in the future live in the Upcoming view. */
export function isOnMainBoard(task: TaskTiming, now: Date, boardHorizonMinutes = 60): boolean {
  if (task.status !== ProductionTaskStatus.SCHEDULED) return true;
  return new Date(task.plannedStartAt).getTime() - now.getTime() <= boardHorizonMinutes * MINUTE;
}

// ---------------------------------------------------------------------------
// Pickup slots & capacity (ASSUMPTION A-14)
// ---------------------------------------------------------------------------

export interface CapacityRule {
  stationId: string | null; // null = whole branch
  windowMinutes: number;
  maxCapacityUnits: number;
}

export interface ScheduledLoad {
  stationId: string;
  plannedStartAt: Date | string;
  plannedReadyAt: Date | string;
  capacityUnits: number;
}

export interface PickupSlotView {
  startsAt: Date;
  available: boolean;
  reason?: 'CAPACITY' | 'CLOSED' | 'TOO_SOON';
}

export interface SlotComputationInput {
  now: Date;
  /** Branch closing time for the day (UTC instant). */
  closesAt: Date;
  opensAt: Date;
  slotMinutes: number;
  minLeadMinutes: number;
  rules: readonly CapacityRule[];
  existingLoad: readonly ScheduledLoad[];
  /** The order being planned. */
  items: readonly PlannableItem[];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function loadInWindow(load: readonly ScheduledLoad[], stationId: string | null, wStart: number, wEnd: number): number {
  return load
    .filter((l) => (stationId === null || l.stationId === stationId))
    .filter((l) => overlaps(new Date(l.plannedStartAt).getTime(), new Date(l.plannedReadyAt).getTime(), wStart, wEnd))
    .reduce((s, l) => s + l.capacityUnits, 0);
}

export function isSlotFeasible(
  slotStart: Date,
  input: Pick<SlotComputationInput, 'now' | 'rules' | 'existingLoad' | 'items'>,
): { ok: boolean; reason?: 'CAPACITY' } {
  if (input.rules.length === 0) return { ok: true };
  const plan = buildProductionPlan(input.items, slotStart, input.now);
  for (const rule of input.rules) {
    const relevant = plan.tasks.filter((t) => rule.stationId === null || t.stationId === rule.stationId);
    for (const t of relevant) {
      // window anchored on the task start, sized by the rule
      const wStart = t.plannedStartAt.getTime();
      const wEnd = wStart + rule.windowMinutes * MINUTE;
      const existing = loadInWindow(input.existingLoad, rule.stationId, wStart, wEnd);
      const own = relevant
        .filter((x) => overlaps(x.plannedStartAt.getTime(), x.plannedReadyAt.getTime(), wStart, wEnd))
        .reduce((s, x) => s + x.capacityUnits, 0);
      if (existing + own > rule.maxCapacityUnits) return { ok: false, reason: 'CAPACITY' };
    }
  }
  return { ok: true };
}

export function computePickupSlots(input: SlotComputationInput): PickupSlotView[] {
  const slots: PickupSlotView[] = [];
  const step = input.slotMinutes * MINUTE;
  const earliest = Math.max(
    input.opensAt.getTime(),
    ceilToMinute(new Date(input.now.getTime() + input.minLeadMinutes * MINUTE)).getTime(),
  );
  // align to the slot grid relative to opening time
  const offset = (earliest - input.opensAt.getTime()) % step;
  let cursor = offset === 0 ? earliest : earliest + (step - offset);

  while (cursor <= input.closesAt.getTime()) {
    const startsAt = new Date(cursor);
    const feasible = isSlotFeasible(startsAt, input);
    slots.push(feasible.ok ? { startsAt, available: true } : { startsAt, available: false, reason: feasible.reason });
    cursor += step;
  }
  return slots;
}
