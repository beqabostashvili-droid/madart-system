import type { Permission } from '@madart/domain';
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Actor } from './actor';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';

/** Route is reachable without a token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** All listed permissions are required (server-side check, not UI). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS, permissions);

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<{ actor: Actor }>();
  return req.actor;
});
