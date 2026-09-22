import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '../../common/errors/http-exception.filter';
import type { Actor } from '../actor';
import { AuthService } from '../auth.service';
import { IS_PUBLIC } from '../decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; query: Record<string, string>; actor?: Actor }>();
    const header = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.query?.token;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedError('Missing bearer token');
    }
    try {
      req.actor = await this.auth.verifyToken(token);
    } catch (err) {
      if (isPublic) return true;
      throw err;
    }
    return true;
  }
}
