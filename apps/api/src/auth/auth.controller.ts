import { type LoginBody, loginBody } from '@madart/types';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { zod } from '../common/validation/zod.pipe';
import type { Actor } from './actor';
import { AuthService } from './auth.service';
import { CurrentActor, Public } from './decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body(zod(loginBody)) body: LoginBody) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  async me(@CurrentActor() actor: Actor) {
    if (actor.kind === 'device') return { kind: 'device', device: await this.auth.deviceProfile(actor) };
    return { kind: 'user', user: await this.auth.profileFor(actor.id) };
  }

  @Get('device')
  device(@CurrentActor() actor: Actor) {
    return this.auth.deviceProfile(actor);
  }
}
