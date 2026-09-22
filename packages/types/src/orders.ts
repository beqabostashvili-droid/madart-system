import type {
  ActorType,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentRecordStatus,
  PaymentStatus,
  PickupType,
  ProductionDisplayStatus,
  ProductionTaskStatus,
} from '@madart/domain';
import { z } from 'zod';
import { idempotencyKey, isoDate, tetri, uuid } from './common';

// ---------------------------------------------------------------- schemas

export const orderItemInput = z.object({
  productId: uuid,
  quantity: z.number().int().min(1).max(999),
  modifierIds: z.array(uuid).default([]),
  note: z.string().max(300).optional(),
});
export type OrderItemInput = z.infer<typeof orderItemInput>;

export const createOrderBody = z.object({
  branchId: uuid,
  source: z.enum(['KIOSK', 'POS', 'MOBILE', 'WOLT', 'GLOVO', 'BOLT_FOOD', 'DELIVERY', 'API']),
  items: z.array(orderItemInput).min(1),
  paymentMethod: z.enum(['CARD', 'CASH', 'ONLINE']),
  pickupType: z.enum(['ASAP', 'SCHEDULED']).default('ASAP'),
  pickupAt: isoDate.optional(),
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
  idempotencyKey,
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const cancelOrderBody = z.object({
  reason: z.string().min(1).max(300),
});

export const ordersQuery = z.object({
  branchId: uuid.optional(),
  status: z.string().optional(), // comma separated OrderStatus list
  awaitingCash: z.coerce.boolean().optional(),
  search: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type OrdersQuery = z.infer<typeof ordersQuery>;

export const initiatePaymentBody = z.object({
  method: z.enum(['CARD', 'ONLINE']),
  idempotencyKey,
  terminalId: z.string().optional(),
});
export type InitiatePaymentBody = z.infer<typeof initiatePaymentBody>;

export const confirmCashBody = z.object({
  amountReceived: tetri,
  idempotencyKey,
});
export type ConfirmCashBody = z.infer<typeof confirmCashBody>;

export const paymentCallbackBody = z.object({
  providerReference: z.string().min(1),
  result: z.enum(['SUCCEEDED', 'FAILED', 'CANCELLED']),
  failureCode: z.string().optional(),
  maskedPan: z.string().optional(),
  authCode: z.string().optional(),
  signature: z.string().optional(),
  rawPayload: z.record(z.unknown()).optional(),
});
export type PaymentCallbackBody = z.infer<typeof paymentCallbackBody>;

export const refundBody = z.object({
  amount: tetri.positive(),
  reason: z.string().min(1).max(300),
  idempotencyKey,
});
export type RefundBody = z.infer<typeof refundBody>;

export const pickupSlotsQuoteBody = z.object({
  branchId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(orderItemInput).min(1),
});
export type PickupSlotsQuoteBody = z.infer<typeof pickupSlotsQuoteBody>;

// ---------------------------------------------------------------- views

export interface OrderItemModifierView {
  id: string;
  name: string;
  priceDelta: number;
}

export interface OrderItemView {
  id: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  productionRequired: boolean;
  stationId: string | null;
  status: OrderItemStatus;
  note: string | null;
  modifiers: OrderItemModifierView[];
}

export interface PaymentView {
  id: string;
  orderId: string;
  method: PaymentMethod;
  provider: string;
  status: PaymentRecordStatus;
  amount: number;
  refundedAmount: number;
  providerReference: string | null;
  failureCode: string | null;
  maskedPan: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionTaskView {
  id: string;
  orderId: string;
  orderItemId: string;
  publicNumber: string;
  branchId: string;
  stationId: string;
  stationCode: string;
  productName: string;
  quantity: number;
  status: ProductionTaskStatus;
  displayStatus: ProductionDisplayStatus;
  durationMinutes: number;
  priority: number;
  plannedStartAt: string;
  plannedReadyAt: string;
  targetReadyAt: string;
  actualStartedAt: string | null;
  actualReadyAt: string | null;
  orderSource: OrderSource;
  note: string | null;
  createdAt: string;
  version: number;
}

export interface OrderStatusHistoryView {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  at: string;
  actorType: ActorType;
  actorId: string | null;
  reason: string | null;
}

export interface OrderTimelineEntry {
  at: string;
  kind: 'ORDER' | 'PAYMENT' | 'PRODUCTION' | 'AUDIT';
  label: string;
  detail?: string;
}

export interface OrderSummaryView {
  id: string;
  publicNumber: string;
  branchId: string;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  pickupType: PickupType;
  targetReadyAt: string;
  total: number;
  itemCount: number;
  customerName: string | null;
  createdAt: string;
  updatedAt: string;
  readyForPickupAt: string | null;
  completedAt: string | null;
}

export interface OrderView extends OrderSummaryView {
  subtotal: number;
  discountTotal: number;
  currency: string;
  customerPhone: string | null;
  note: string | null;
  items: OrderItemView[];
  payments: PaymentView[];
  tasks: ProductionTaskView[];
  history: OrderStatusHistoryView[];
  paidAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  version: number;
}

export interface CreateOrderResponse {
  order: OrderView;
  /** Present when the order needs an interactive payment (CARD/ONLINE). */
  payment: PaymentView | null;
  /** Data for the kiosk/mobile QR code (opaque token). */
  qrPayload: string;
}

export interface PickupSlotView {
  startsAt: string;
  available: boolean;
  reason?: 'CAPACITY' | 'CLOSED' | 'TOO_SOON';
}

export interface PickupSlotsResponse {
  branchId: string;
  asapReadyAt: string;
  slots: PickupSlotView[];
}

export type CancelOrderBodyType = z.infer<typeof cancelOrderBody>;
