import { describe, expect, it, vi } from 'vitest';
import { TerminalUnavailableError } from './interfaces';
import { MockPaymentTerminalAdapter } from './mocks';

const req = (amount: number) => ({
  paymentId: 'p1',
  orderId: 'o1',
  publicNumber: 'A001',
  amount,
  currency: 'GEL',
  callbackUrl: 'http://localhost/cb',
  idempotencyKey: 'idem-12345678',
});

describe('MockPaymentTerminalAdapter', () => {
  it('delivers a success callback asynchronously', async () => {
    const deliver = vi.fn();
    const t = new MockPaymentTerminalAdapter({ delayMs: 5, deliverCallback: deliver });
    const init = await t.initiate(req(1400));
    expect(init.providerReference).toMatch(/^MOCK-/);
    expect(await t.queryStatus(init.providerReference)).toMatchObject({ result: 'PENDING' });
    await new Promise((r) => setTimeout(r, 20));
    expect(deliver).toHaveBeenCalledWith('p1', expect.objectContaining({ result: 'SUCCEEDED' }));
    expect(await t.queryStatus(init.providerReference)).toMatchObject({ result: 'SUCCEEDED' });
  });

  it('fails deterministically for totals ending in 99 (A-10)', async () => {
    const t = new MockPaymentTerminalAdapter({ delayMs: 0 });
    const init = await t.initiate(req(1299));
    expect(init.immediate).toMatchObject({ result: 'FAILED', failureCode: 'DECLINED' });
  });

  it('throws when offline', async () => {
    const t = new MockPaymentTerminalAdapter({ offline: true });
    await expect(t.initiate(req(100))).rejects.toBeInstanceOf(TerminalUnavailableError);
  });
});
