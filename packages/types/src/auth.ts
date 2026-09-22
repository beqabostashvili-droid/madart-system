import type { DeviceType, Permission, RoleCode } from '@madart/domain';
import { z } from 'zod';

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBody>;

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  branchId: string | null;
  roles: RoleCode[];
  permissions: Permission[];
}

export interface LoginResponse {
  accessToken: string;
  expiresAt: string;
  user: UserProfile;
}

export interface DeviceProfile {
  id: string;
  name: string;
  type: DeviceType;
  branchId: string;
  branchName: string;
  stationId: string | null;
  stationCode: string | null;
  permissions: Permission[];
  settings: Record<string, unknown>;
}

/** Decoded JWT claims (both kinds). */
export type AuthClaims =
  | { kind: 'user'; sub: string; branchId: string | null; roles: RoleCode[]; permissions: Permission[] }
  | { kind: 'device'; sub: string; deviceType: DeviceType; branchId: string; stationId: string | null; permissions: Permission[] };
