import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { GlobalExceptionFilter } from '../src/common/errors/http-exception.filter';

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
  clock: Clock;
  baseUrl: string;
  adminToken: string;
  branchId: string;
  stations: Record<string, string>;
  close: () => Promise<void>;
}

export async function bootTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/*path'] });
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const http = request(app.getHttpServer());
  const clock = app.get(Clock);

  const login = await http.post('/api/v1/auth/login').send({ email: 'admin@madart.local', password: 'admin123' }).expect(201);
  const adminToken = login.body.accessToken as string;
  const branches = await http.get('/api/v1/admin/branches').set(auth(adminToken)).expect(200);
  const branchId = branches.body[0].id as string;
  const stationRes = await http.get(`/api/v1/stations?branchId=${branchId}`).set(auth(adminToken)).expect(200);
  const stations: Record<string, string> = Object.fromEntries(stationRes.body.map((s: { code: string; id: string }) => [s.code, s.id]));

  return {
    app,
    http,
    clock,
    baseUrl,
    adminToken,
    branchId,
    stations,
    close: async () => {
      clock.reset();
      await app.close();
    },
  };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function loginAs(ctx: TestContext, email: string, password: string): Promise<string> {
  const res = await ctx.http.post('/api/v1/auth/login').send({ email, password }).expect(201);
  return res.body.accessToken;
}

export async function createDevice(ctx: TestContext, type: 'KIOSK' | 'POS' | 'PRODUCTION' | 'CUSTOMER_DISPLAY', name: string, stationId?: string): Promise<string> {
  const res = await ctx.http
    .post('/api/v1/admin/devices')
    .set(auth(ctx.adminToken))
    .send({ type, name: `${name}-${Date.now()}`, branchId: ctx.branchId, stationId: stationId ?? null })
    .expect(201);
  return res.body.token as string;
}

export async function createProduct(
  ctx: TestContext,
  opts: { sku: string; name: string; price: number; categoryCode: string; stationCode: string | null; minutes: number; buffer?: number },
): Promise<string> {
  const cats = await ctx.http.get('/api/v1/admin/categories').set(auth(ctx.adminToken)).expect(200);
  const category = cats.body.find((c: { code: string }) => c.code === opts.categoryCode) ?? cats.body[0];
  const res = await ctx.http
    .post('/api/v1/admin/products')
    .set(auth(ctx.adminToken))
    .send({
      sku: `${opts.sku}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
      categoryId: category.id,
      basePrice: opts.price,
      translations: [{ locale: 'ka', name: opts.name }],
      productionConfig: {
        productionRequired: opts.stationCode !== null,
        stationId: opts.stationCode ? ctx.stations[opts.stationCode] : null,
        productionTimeMinutes: opts.minutes,
        preparationBufferMinutes: opts.buffer ?? 0,
        capacityUnits: 1,
        priority: 0,
      },
    })
    .expect(201);
  return res.body.id as string;
}

export function connectSocket(ctx: TestContext, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${ctx.baseUrl}/rt`, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.once('ready', () => resolve(socket));
    socket.once('error', (e) => reject(new Error(JSON.stringify(e))));
    socket.once('connect_error', reject);
  });
}

export function waitFor<T>(check: () => T | undefined, timeoutMs = 5000, label = 'condition'): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const v = check();
      if (v !== undefined) return resolve(v);
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout waiting for ${label}`));
      setTimeout(tick, 25);
    };
    tick();
  });
}

export const todayAt = (hhmm: string): Date => {
  const d = new Date();
  const [h, m] = hhmm.split(':').map(Number);
  d.setUTCHours(h!, m!, 0, 0);
  return d;
};

export const idem = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
