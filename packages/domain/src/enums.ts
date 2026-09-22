/**
 * Domain enumerations. Kept as `as const` objects so they work identically in
 * the API (CommonJS), Next.js, Vite and tests. Prisma enums mirror these values
 * one-to-one (string equality is the contract).
 */

export const OrderStatus = {
  DRAFT: 'DRAFT',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAID: 'PAID',
  CONFIRMED: 'CONFIRMED',
  SCHEDULED: 'SCHEDULED',
  IN_PRODUCTION: 'IN_PRODUCTION',
  PARTIALLY_READY: 'PARTIALLY_READY',
  READY_FOR_ASSEMBLY: 'READY_FOR_ASSEMBLY',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Order-level payment status (derived from Payment rows). */
export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** Status of a single Payment record. */
export const PaymentRecordStatus = {
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentRecordStatus = (typeof PaymentRecordStatus)[keyof typeof PaymentRecordStatus];

export const PaymentMethod = {
  CARD: 'CARD',
  CASH: 'CASH',
  ONLINE: 'ONLINE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const OrderSource = {
  KIOSK: 'KIOSK',
  POS: 'POS',
  MOBILE: 'MOBILE',
  WOLT: 'WOLT',
  GLOVO: 'GLOVO',
  BOLT_FOOD: 'BOLT_FOOD',
  DELIVERY: 'DELIVERY',
  API: 'API',
} as const;
export type OrderSource = (typeof OrderSource)[keyof typeof OrderSource];

export const PickupType = {
  ASAP: 'ASAP',
  SCHEDULED: 'SCHEDULED',
} as const;
export type PickupType = (typeof PickupType)[keyof typeof PickupType];

export const OrderItemStatus = {
  PENDING: 'PENDING',
  IN_PRODUCTION: 'IN_PRODUCTION',
  READY: 'READY',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderItemStatus = (typeof OrderItemStatus)[keyof typeof OrderItemStatus];

/** Persisted production task status (ASSUMPTION A-04). */
export const ProductionTaskStatus = {
  SCHEDULED: 'SCHEDULED',
  IN_PRODUCTION: 'IN_PRODUCTION',
  READY: 'READY',
  CANCELLED: 'CANCELLED',
} as const;
export type ProductionTaskStatus = (typeof ProductionTaskStatus)[keyof typeof ProductionTaskStatus];

/** Display status shown on the KDS – derived from persisted status + clock. */
export const ProductionDisplayStatus = {
  SCHEDULED: 'SCHEDULED',
  STARTING_SOON: 'STARTING_SOON',
  START_NOW: 'START_NOW',
  IN_PRODUCTION: 'IN_PRODUCTION',
  LATE: 'LATE',
  READY: 'READY',
  CANCELLED: 'CANCELLED',
} as const;
export type ProductionDisplayStatus = (typeof ProductionDisplayStatus)[keyof typeof ProductionDisplayStatus];

export const DeviceType = {
  KIOSK: 'KIOSK',
  POS: 'POS',
  PRODUCTION: 'PRODUCTION',
  CUSTOMER_DISPLAY: 'CUSTOMER_DISPLAY',
} as const;
export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

export const Locale = {
  ka: 'ka',
  en: 'en',
  ru: 'ru',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
export const DEFAULT_LOCALE: Locale = 'ka';
export const LOCALES: readonly Locale[] = ['ka', 'en', 'ru'];

export const ActorType = {
  USER: 'USER',
  DEVICE: 'DEVICE',
  SYSTEM: 'SYSTEM',
  CUSTOMER: 'CUSTOMER',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const RoleCode = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  CASHIER: 'CASHIER',
  PRODUCTION_EMPLOYEE: 'PRODUCTION_EMPLOYEE',
  DISPATCHER: 'DISPATCHER',
} as const;
export type RoleCode = (typeof RoleCode)[keyof typeof RoleCode];

export const CatalogImportStatus = {
  PREVIEW: 'PREVIEW',
  IMPORTED: 'IMPORTED',
  FAILED: 'FAILED',
} as const;
export type CatalogImportStatus = (typeof CatalogImportStatus)[keyof typeof CatalogImportStatus];

export const CatalogImportAction = {
  NEW: 'NEW',
  UPDATE: 'UPDATE',
  UNCHANGED: 'UNCHANGED',
  SKIPPED: 'SKIPPED',
} as const;
export type CatalogImportAction = (typeof CatalogImportAction)[keyof typeof CatalogImportAction];

export const CURRENCY = 'GEL';
