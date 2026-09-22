import { type DeviceType, type Permission, RoleCode } from '@madart/domain';
import { ForbiddenError } from '../common/errors/http-exception.filter';

export interface UserActor {
  kind: 'user';
  id: string;
  displayName: string;
  branchId: string | null;
  roles: RoleCode[];
  permissions: Permission[];
}

export interface DeviceActor {
  kind: 'device';
  id: string;
  displayName: string;
  deviceType: DeviceType;
  branchId: string;
  stationId: string | null;
  permissions: Permission[];
}

export type Actor = UserActor | DeviceActor;

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.permissions.includes(permission);
}

export function isGlobalUser(actor: Actor): boolean {
  return (
    actor.kind === 'user' &&
    (actor.branchId === null || actor.roles.includes(RoleCode.SUPER_ADMIN) || actor.roles.includes(RoleCode.ADMIN))
  );
}

/** Devices and branch-bound employees may only touch their own branch. */
export function assertBranchAccess(actor: Actor, branchId: string): void {
  if (isGlobalUser(actor)) return;
  if (actor.branchId !== branchId) throw new ForbiddenError('No access to this branch');
}

/** Returns the branch the actor is implicitly scoped to (null for global users). */
export function scopedBranchId(actor: Actor, requested?: string | null): string | null {
  if (isGlobalUser(actor)) return requested ?? null;
  if (requested && requested !== actor.branchId) throw new ForbiddenError('No access to this branch');
  return actor.branchId;
}
