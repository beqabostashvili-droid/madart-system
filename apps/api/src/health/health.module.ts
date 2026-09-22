import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { EventBus, RedisEventBus } from '../common/events/event-bus';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';

const startedAt = Date.now();

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBus,
    private readonly payments: PaymentsService,
  ) {}

  @Public()
  @Get()
  async health() {
    const [database, redis, terminal] = await Promise.all([this.dbStatus(), this.redisStatus(), this.payments.terminalHealth().catch(() => ({ online: false }))]);
    const ok = database.ok && (redis.status === 'not_configured' || redis.ok);
    const body = { status: ok ? 'ok' : 'degraded', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), database, redis, paymentTerminal: terminal, time: new Date().toISOString() };
    if (!ok) throw new ServiceUnavailableException(body);
    return body;
  }

  @Public()
  @Get('database')
  async database() {
    const s = await this.dbStatus();
    if (!s.ok) throw new ServiceUnavailableException(s);
    return s;
  }

  @Public()
  @Get('redis')
  async redis() {
    const s = await this.redisStatus();
    if (s.status !== 'not_configured' && !s.ok) throw new ServiceUnavailableException(s);
    return s;
  }

  private async dbStatus() {
    const t = Date.now();
    try {
      await this.prisma.ping();
      return { ok: true, latencyMs: Date.now() - t };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async redisStatus() {
    if (!(this.bus instanceof RedisEventBus)) return { ok: true, status: 'not_configured' as const };
    try {
      return { ok: await this.bus.ping(), status: 'configured' as const };
    } catch (err) {
      return { ok: false, status: 'configured' as const, error: (err as Error).message };
    }
  }
}

@Module({ imports: [PaymentsModule], controllers: [HealthController] })
export class HealthModule {}
