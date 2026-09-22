import type { OrderStatus, PaymentMethod } from '@madart/domain';
import type { DisplayBoardView } from './boards';
import type { OrderSummaryView, ProductionTaskView } from './orders';

export const RealtimeEventType = {
  ORDER_CREATED: 'ORDER_CREATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  PRODUCTION_TASK_CREATED: 'PRODUCTION_TASK_CREATED',
  PRODUCTION_STARTING_SOON: 'PRODUCTION_STARTING_SOON',
  PRODUCTION_STARTED: 'PRODUCTION_STARTED',
  PRODUCTION_ITEM_READY: 'PRODUCTION_ITEM_READY',
  PRODUCTION_TASK_CANCELLED: 'PRODUCTION_TASK_CANCELLED',
  ORDER_READY_FOR_ASSEMBLY: 'ORDER_READY_FOR_ASSEMBLY',
  ORDER_READY_FOR_PICKUP: 'ORDER_READY_FOR_PICKUP',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  DISPLAY_BOARD: 'DISPLAY_BOARD',
  DEVICE_STATUS: 'DEVICE_STATUS',
} as const;
export type RealtimeEventType = (typeof RealtimeEventType)[keyof typeof RealtimeEventType];

export interface RealtimePayloads {
  ORDER_CREATED: OrderSummaryView;
  PAYMENT_COMPLETED: { orderId: string; paymentId: string; method: PaymentMethod; publicNumber: string };
  PAYMENT_FAILED: { orderId: string; paymentId: string; failureCode: string | null; publicNumber: string };
  ORDER_CONFIRMED: OrderSummaryView;
  ORDER_STATUS_CHANGED: { orderId: string; publicNumber: string; from: OrderStatus | null; to: OrderStatus };
  PRODUCTION_TASK_CREATED: ProductionTaskView;
  PRODUCTION_STARTING_SOON: { taskId: string; stationId: string; publicNumber: string };
  PRODUCTION_STARTED: ProductionTaskView;
  PRODUCTION_ITEM_READY: ProductionTaskView;
  PRODUCTION_TASK_CANCELLED: ProductionTaskView;
  ORDER_READY_FOR_ASSEMBLY: OrderSummaryView;
  ORDER_READY_FOR_PICKUP: { orderId: string; publicNumber: string };
  ORDER_COMPLETED: { orderId: string; publicNumber: string };
  ORDER_CANCELLED: { orderId: string; publicNumber: string; reason: string | null };
  DISPLAY_BOARD: DisplayBoardView;
  DEVICE_STATUS: { deviceId: string; online: boolean };
}

export interface RealtimeEnvelope<T extends RealtimeEventType = RealtimeEventType> {
  id: string;
  type: T;
  at: string;
  branchId: string;
  /** Station scope when relevant (production events). */
  stationId?: string | null;
  /** Order scope when relevant. */
  orderId?: string | null;
  payload: RealtimePayloads[T];
}

export type AnyRealtimeEnvelope = { [K in RealtimeEventType]: RealtimeEnvelope<K> }[RealtimeEventType];

export const REALTIME_NAMESPACE = '/rt';

export const roomNames = {
  branch: (branchId: string) => `branch:${branchId}`,
  station: (branchId: string, stationId: string) => `branch:${branchId}:station:${stationId}`,
  display: (branchId: string) => `branch:${branchId}:display`,
  dispatch: (branchId: string) => `branch:${branchId}:dispatch`,
  order: (orderId: string) => `order:${orderId}`,
};

export type ConnectionState = 'ONLINE' | 'RECONNECTING' | 'OFFLINE';
