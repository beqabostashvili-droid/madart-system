import type { DeviceType, RoleCode } from '@madart/domain';
import { z } from 'zod';
import { uuid } from './common';

export interface OpeningHoursDay {
  open: string; // "09:00"
  close: string; // "21:00"
  closed?: boolean;
}
/** keys 0..6 = Sunday..Saturday */
export type OpeningHours = Record<string, OpeningHoursDay>;

export interface BranchView {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timeZone: string;
  orderNumberPrefix: string;
  openingHours: OpeningHours;
  pickupMinLeadMinutes: number;
  pickupSlotMinutes: number;
  active: boolean;
}

export const openingHoursDay = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
  closed: z.boolean().optional(),
});

export const createBranchBody = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  timeZone: z.string().default('Asia/Tbilisi'),
  orderNumberPrefix: z.string().min(1).max(3).default('A'),
  openingHours: z.record(openingHoursDay).default({}),
  pickupMinLeadMinutes: z.number().int().min(0).default(30),
  pickupSlotMinutes: z.number().int().min(5).max(120).default(15),
  active: z.boolean().default(true),
});
export type CreateBranchBody = z.infer<typeof createBranchBody>;
export const updateBranchBody = createBranchBody.partial();
export type UpdateBranchBody = z.infer<typeof updateBranchBody>;

export interface StationView {
  id: string;
  branchId: string;
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
}

export const createStationBody = z.object({
  branchId: uuid,
  code: z.string().min(1).max(40).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#64748b'),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type CreateStationBody = z.infer<typeof createStationBody>;
export const updateStationBody = createStationBody.omit({ branchId: true }).partial();
export type UpdateStationBody = z.infer<typeof updateStationBody>;

export interface DeviceView {
  id: string;
  type: DeviceType;
  name: string;
  branchId: string;
  stationId: string | null;
  active: boolean;
  lastSeenAt: string | null;
  online: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
}

export const createDeviceBody = z.object({
  type: z.enum(['KIOSK', 'POS', 'PRODUCTION', 'CUSTOMER_DISPLAY']),
  name: z.string().min(1),
  branchId: uuid,
  stationId: uuid.nullable().optional(),
  settings: z.record(z.unknown()).default({}),
});
export type CreateDeviceBody = z.infer<typeof createDeviceBody>;
export const updateDeviceBody = createDeviceBody.partial().extend({ active: z.boolean().optional() });
export type UpdateDeviceBody = z.infer<typeof updateDeviceBody>;

export interface DeviceWithTokenView extends DeviceView {
  /** Only returned on create / rotate. */
  token: string;
}

export interface UserView {
  id: string;
  email: string;
  displayName: string;
  branchId: string | null;
  roles: RoleCode[];
  active: boolean;
  createdAt: string;
}

export const createUserBody = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  password: z.string().min(6),
  pin: z.string().regex(/^\d{4,6}$/).nullable().optional(),
  branchId: uuid.nullable().optional(),
  roles: z.array(z.enum(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'PRODUCTION_EMPLOYEE', 'DISPATCHER'])).min(1),
  active: z.boolean().default(true),
});
export type CreateUserBody = z.infer<typeof createUserBody>;
export const updateUserBody = createUserBody.partial();
export type UpdateUserBody = z.infer<typeof updateUserBody>;

export interface RoleView {
  id: string;
  code: RoleCode;
  name: string;
  permissions: string[];
}

export const updateRoleBody = z.object({
  name: z.string().min(1).optional(),
  permissions: z.array(z.string()).optional(),
});

export interface SystemSettingView {
  key: string;
  value: unknown;
  branchId: string | null;
}

export const upsertSettingBody = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  branchId: uuid.nullable().optional(),
});
