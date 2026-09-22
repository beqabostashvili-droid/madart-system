import type { Permission } from '@madart/domain';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/http-exception.filter';
import type { Actor } from '../actor';
import { PERMISSIONS } from '../decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<{ actor?: Actor }>();
    const actor = req.actor;
    if (!actor) throw new UnauthorizedError();
    const missing = required.filter((p) => !actor.permissions.includes(p));
    if (missing.length > 0) throw new ForbiddenError(`Missing permission: ${missing.join(', ')}`);
    return true;
  }
}
