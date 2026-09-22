import type { OrderStatus } from '@madart/domain';
import type { OrderItemView, OrderSummaryView, ProductionTaskView } from './orders';

/** Production / KDS board for one station (or a whole branch). */
export interface ProductionBoardView {
  branchId: string;
  stationId: string | null;
  serverTime: string;
  thresholds: { startingSoonMinutes: number; lateGraceMinutes: number; boardHorizonMinutes: number };
  tasks: ProductionTaskView[];
  upcoming: ProductionTaskView[];
  readyRecent: ProductionTaskView[];
}

export interface DispatchGroupView {
  stationId: string | null;
  stationCode: string | null;
  items: OrderItemView[];
  tasks: ProductionTaskView[];
  ready: boolean;
}

export interface DispatchOrderView extends OrderSummaryView {
  items: OrderItemView[];
  tasks: ProductionTaskView[];
  groups: DispatchGroupView[];
  groupsReady: number;
  groupsTotal: number;
  note: string | null;
}

export interface DispatchBoardView {
  branchId: string;
  serverTime: string;
  preparing: DispatchOrderView[]; // CONFIRMED..PARTIALLY_READY
  readyForAssembly: DispatchOrderView[];
  readyForPickup: DispatchOrderView[];
}

export interface DisplayBoardView {
  branchId: string;
  serverTime: string;
  preparing: DisplayEntry[];
  ready: DisplayEntry[];
}

export interface DisplayEntry {
  orderId: string;
  publicNumber: string;
  status: OrderStatus;
  since: string;
}

export interface DashboardView {
  branchId: string | null;
  date: string;
  salesToday: number;
  ordersToday: number;
  averageOrderValue: number;
  ordersBySource: Record<string, number>;
  salesBySource: Record<string, number>;
  averageProductionMinutes: number | null;
  averageDelayMinutes: number | null;
  lateOrders: number;
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  activeOrders: number;
}
