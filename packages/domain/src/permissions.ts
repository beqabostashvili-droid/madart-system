import { RoleCode } from './enums';

/** Granular permission catalogue. Seed syncs this list into the DB. */
export const Permission = {
  // orders
  ORDERS_READ: 'orders.read',
  ORDERS_CREATE: 'orders.create',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_REFUND: 'orders.refund',
  ORDERS_REOPEN: 'orders.reopen',
  ORDERS_PRICE_OVERRIDE: 'orders.price_override',
  ORDERS_DISCOUNT_OVERRIDE: 'orders.discount_override',
  ORDERS_FORCE_READY: 'orders.force_ready',
  // payments
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_CONFIRM_CASH: 'payments.confirm_cash',
  PAYMENTS_INITIATE_CARD: 'payments.initiate_card',
  // production
  PRODUCTION_READ: 'production.read',
  PRODUCTION_START: 'production.start',
  PRODUCTION_READY: 'production.ready',
  PRODUCTION_REASSIGN: 'production.reassign',
  // dispatch
  DISPATCH_READ: 'dispatch.read',
  DISPATCH_READY: 'dispatch.ready',
  DISPATCH_HANDOVER: 'dispatch.handover',
  // catalog
  CATALOG_READ: 'catalog.read',
  CATALOG_WRITE: 'catalog.write',
  CATALOG_IMPORT: 'catalog.import',
  PRODUCTION_CONFIG_WRITE: 'catalog.production_config_write',
  // organisation
  BRANCHES_READ: 'branches.read',
  BRANCHES_WRITE: 'branches.write',
  STATIONS_WRITE: 'stations.write',
  DEVICES_READ: 'devices.read',
  DEVICES_WRITE: 'devices.write',
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',
  ROLES_WRITE: 'roles.write',
  SETTINGS_WRITE: 'settings.write',
  // reporting
  REPORTS_READ: 'reports.read',
  AUDIT_READ: 'audit.read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

const ALL = ALL_PERMISSIONS;

/** Default role → permissions. Editable in Admin (Roles & Permissions). */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  [RoleCode.SUPER_ADMIN]: ALL,
  [RoleCode.ADMIN]: ALL.filter((p) => p !== Permission.ROLES_WRITE),
  [RoleCode.BRANCH_MANAGER]: [
    Permission.ORDERS_READ,
    Permission.ORDERS_CREATE,
    Permission.ORDERS_CANCEL,
    Permission.ORDERS_REFUND,
    Permission.ORDERS_PRICE_OVERRIDE,
    Permission.ORDERS_DISCOUNT_OVERRIDE,
    Permission.ORDERS_FORCE_READY,
    Permission.PAYMENTS_READ,
    Permission.PAYMENTS_CONFIRM_CASH,
    Permission.PAYMENTS_INITIATE_CARD,
    Permission.PRODUCTION_READ,
    Permission.PRODUCTION_START,
    Permission.PRODUCTION_READY,
    Permission.PRODUCTION_REASSIGN,
    Permission.DISPATCH_READ,
    Permission.DISPATCH_READY,
    Permission.DISPATCH_HANDOVER,
    Permission.CATALOG_READ,
    Permission.CATALOG_WRITE,
    Permission.PRODUCTION_CONFIG_WRITE,
    Permission.BRANCHES_READ,
    Permission.STATIONS_WRITE,
    Permission.DEVICES_READ,
    Permission.DEVICES_WRITE,
    Permission.USERS_READ,
    Permission.REPORTS_READ,
    Permission.AUDIT_READ,
  ],
  [RoleCode.CASHIER]: [
    Permission.ORDERS_READ,
    Permission.ORDERS_CREATE,
    Permission.ORDERS_CANCEL,
    Permission.PAYMENTS_READ,
    Permission.PAYMENTS_CONFIRM_CASH,
    Permission.PAYMENTS_INITIATE_CARD,
    Permission.CATALOG_READ,
    Permission.DISPATCH_READ,
  ],
  [RoleCode.PRODUCTION_EMPLOYEE]: [
    Permission.PRODUCTION_READ,
    Permission.PRODUCTION_START,
    Permission.PRODUCTION_READY,
    Permission.CATALOG_READ,
  ],
  [RoleCode.DISPATCHER]: [
    Permission.ORDERS_READ,
    Permission.DISPATCH_READ,
    Permission.DISPATCH_READY,
    Permission.DISPATCH_HANDOVER,
    Permission.PRODUCTION_READ,
    Permission.CATALOG_READ,
  ],
};

/** Permissions a device token grants implicitly, by device type. */
export const DEVICE_PERMISSIONS = {
  KIOSK: [Permission.CATALOG_READ, Permission.ORDERS_CREATE, Permission.ORDERS_READ, Permission.PAYMENTS_INITIATE_CARD, Permission.PAYMENTS_READ],
  POS: [Permission.CATALOG_READ, Permission.ORDERS_READ],
  PRODUCTION: [Permission.PRODUCTION_READ, Permission.PRODUCTION_START, Permission.PRODUCTION_READY, Permission.CATALOG_READ],
  CUSTOMER_DISPLAY: [] as Permission[],
} as const satisfies Record<string, readonly Permission[]>;

/** Actions that must always be written to the audit log. */
export const SENSITIVE_ACTIONS = [
  'REFUND',
  'CANCEL',
  'PRICE_OVERRIDE',
  'DISCOUNT_OVERRIDE',
  'ORDER_REOPEN',
  'FORCE_READY',
] as const;
