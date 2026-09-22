/**
 * Spec §40 / §45 – the first end-to-end demo, automated.
 *
 *   Customer orders for 18:00: 2× Khachapuri (30), 1× Lobiani (10), 3× Eclair (2)
 *   → planned starts 17:30 / 17:50 / 17:58
 *   → all tasks READY → READY_FOR_ASSEMBLY
 *   → dispatcher READY FOR CUSTOMER → READY_FOR_PICKUP, number on the display
 *   → HANDED OVER → COMPLETED, number disappears
 *
 * Requires the dev database to be migrated and seeded (pnpm db:migrate && pnpm db:seed).
 */
import type { AnyRealtimeEnvelope, DisplayBoardView } from '@madart/types';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, bootTestApp, connectSocket, createDevice, createProduct, idem, loginAs, type TestContext, todayAt, waitFor } from '../helpers';

describe('critical flow: kiosk card order → production → dispatcher → display → completed', () => {
  let ctx: TestContext;
  let kioskToken: string;
  let hotToken: string;
  let pastryToken: string;
  let displayToken: string;
  let dispatcherToken: string;
  let khachapuri: string;
  let lobiani: string;
  let eclair: string;
  let displaySocket: Socket;
  const displayEvents: AnyRealtimeEnvelope[] = [];
  const hotEvents: AnyRealtimeEnvelope[] = [];
  let hotSocket: Socket;

  let orderId: string;
  let publicNumber: string;

  beforeAll(async () => {
    ctx = await bootTestApp();
    ctx.clock.freeze(todayAt('15:00'));
    [kioskToken, hotToken, pastryToken, displayToken] = await Promise.all([
      createDevice(ctx, 'KIOSK', 'Test-Kiosk'),
      createDevice(ctx, 'PRODUCTION', 'Test-Hot', ctx.stations.HOT_KITCHEN),
      createDevice(ctx, 'PRODUCTION', 'Test-Pastry', ctx.stations.PASTRY),
      createDevice(ctx, 'CUSTOMER_DISPLAY', 'Test-Display'),
    ]);
    dispatcherToken = await loginAs(ctx, 'dispatcher@madart.local', 'dispatch123');
    [khachapuri, lobiani, eclair] = await Promise.all([
      createProduct(ctx, { sku: 'T-KH', name: 'ხაჭაპური', price: 1400, categoryCode: 'KHACHAPURI', stationCode: 'HOT_KITCHEN', minutes: 30 }),
      createProduct(ctx, { sku: 'T-LB', name: 'ლობიანი', price: 900, categoryCode: 'LOBIANI', stationCode: 'HOT_KITCHEN', minutes: 10 }),
      createProduct(ctx, { sku: 'T-EC', name: 'ეკლერი', price: 650, categoryCode: 'ECLAIRS', stationCode: 'PASTRY', minutes: 2 }),
    ]);
    displaySocket = await connectSocket(ctx, displayToken);
    displaySocket.on('event', (e: AnyRealtimeEnvelope) => displayEvents.push(e));
    hotSocket = await connectSocket(ctx, hotToken);
    hotSocket.on('event', (e: AnyRealtimeEnvelope) => hotEvents.push(e));
  });

  afterAll(async () => {
    displaySocket?.disconnect();
    hotSocket?.disconnect();
    await ctx?.close();
  });

  it('creates a scheduled kiosk order, pays by (mock) card and schedules production backwards from 18:00', async () => {
    const res = await ctx.http
      .post('/api/v1/orders')
      .set(auth(kioskToken))
      .send({
        branchId: ctx.branchId,
        source: 'KIOSK',
        paymentMethod: 'CARD',
        pickupType: 'SCHEDULED',
        pickupAt: todayAt('18:00').toISOString(),
        idempotencyKey: idem('crit'),
        items: [
          { productId: khachapuri, quantity: 2 },
          { productId: lobiani, quantity: 1 },
          { productId: eclair, quantity: 3 },
        ],
      })
      .expect(201);

    orderId = res.body.order.id;
    publicNumber = res.body.order.publicNumber;
    expect(publicNumber).toMatch(/^A\d{3,}$/);
    expect(res.body.payment.status).toBe('SUCCEEDED'); // MOCK_TERMINAL_DELAY_MS=0 → immediate
    expect(res.body.qrPayload).toContain(publicNumber);

    const order = (await ctx.http.get(`/api/v1/orders/${orderId}`).set(auth(ctx.adminToken)).expect(200)).body;
    expect(order.status).toBe('SCHEDULED');
    expect(order.paymentStatus).toBe('PAID');
    expect(order.total).toBe(2 * 1400 + 900 + 3 * 650);
    expect(order.tasks).toHaveLength(3);

    const byName = Object.fromEntries(order.tasks.map((t: { productName: string; plannedStartAt: string; plannedReadyAt: string; stationCode: string }) => [t.productName, t]));
    expect(byName['ხაჭაპური'].plannedStartAt).toBe(todayAt('17:30').toISOString());
    expect(byName['ლობიანი'].plannedStartAt).toBe(todayAt('17:50').toISOString());
    expect(byName['ეკლერი'].plannedStartAt).toBe(todayAt('17:58').toISOString());
    expect(byName['ხაჭაპური'].plannedReadyAt).toBe(todayAt('18:00').toISOString());
    expect(byName['ხაჭაპური'].stationCode).toBe('HOT_KITCHEN');
    expect(byName['ეკლერი'].stationCode).toBe('PASTRY');

    // history was written by the engine, not the UI
    const statuses = order.history.map((h: { toStatus: string }) => h.toStatus);
    expect(statuses).toEqual(['DRAFT', 'AWAITING_PAYMENT', 'PAID', 'CONFIRMED', 'SCHEDULED']);

    // hot kitchen screen received its two tasks in realtime, never the pastry one
    await waitFor(() => (hotEvents.filter((e) => e.type === 'PRODUCTION_TASK_CREATED').length >= 2 ? true : undefined), 3000, 'task events');
    const created = hotEvents.filter((e) => e.type === 'PRODUCTION_TASK_CREATED');
    expect(created.every((e) => e.stationId === ctx.stations.HOT_KITCHEN)).toBe(true);

    // customer display already shows the number as "preparing"
    const board = (await ctx.http.get('/api/v1/display/board').set(auth(displayToken)).expect(200)).body as DisplayBoardView;
    expect(board.preparing.map((p) => p.publicNumber)).toContain(publicNumber);
  });

  it('is idempotent on order creation', async () => {
    const key = idem('dup');
    const body = { branchId: ctx.branchId, source: 'KIOSK', paymentMethod: 'CASH', idempotencyKey: key, items: [{ productId: lobiani, quantity: 1 }] };
    const a = await ctx.http.post('/api/v1/orders').set(auth(kioskToken)).send(body).expect(201);
    const b = await ctx.http.post('/api/v1/orders').set(auth(kioskToken)).send(body).expect(201);
    expect(b.body.order.id).toBe(a.body.order.id);
    expect(b.body.order.publicNumber).toBe(a.body.order.publicNumber);
  });

  it('keeps far-future tasks in Upcoming, then moves them to the board when their start approaches', async () => {
    const early = (await ctx.http.get('/api/v1/production/board').set(auth(hotToken)).expect(200)).body;
    expect(early.tasks.map((t: { orderId: string }) => t.orderId)).not.toContain(orderId);
    expect(early.upcoming.filter((t: { orderId: string }) => t.orderId === orderId)).toHaveLength(2);

    ctx.clock.freeze(todayAt('17:26'));
    const later = (await ctx.http.get('/api/v1/production/board').set(auth(hotToken)).expect(200)).body;
    const mine = later.tasks.filter((t: { orderId: string }) => t.orderId === orderId);
    expect(mine).toHaveLength(2);
    const kh = mine.find((t: { productName: string }) => t.productName === 'ხაჭაპური');
    expect(kh.displayStatus).toBe('STARTING_SOON');
  });

  it('START / READY are backend-authoritative and roll the order up', async () => {
    ctx.clock.freeze(todayAt('17:30'));
    const board = (await ctx.http.get('/api/v1/production/board').set(auth(hotToken)).expect(200)).body;
    const kh = board.tasks.find((t: { orderId: string; productName: string }) => t.orderId === orderId && t.productName === 'ხაჭაპური');
    const lb = board.tasks.find((t: { orderId: string; productName: string }) => t.orderId === orderId && t.productName === 'ლობიანი');
    expect(kh.displayStatus).toBe('START_NOW');

    const started = await ctx.http.post(`/api/v1/production/tasks/${kh.id}/start`).set(auth(hotToken)).expect(201);
    expect(started.body.status).toBe('IN_PRODUCTION');
    expect(started.body.actualStartedAt).toBe(todayAt('17:30').toISOString());

    // second START (two employees pressing at once) is rejected, not applied twice
    const dup = await ctx.http.post(`/api/v1/production/tasks/${kh.id}/start`).set(auth(hotToken)).expect(409);
    expect(dup.body.code).toBe('CONFLICT');
    expect(dup.body.current.status).toBe('IN_PRODUCTION');

    // pastry screen cannot touch a hot-kitchen task
    await ctx.http.post(`/api/v1/production/tasks/${lb.id}/start`).set(auth(pastryToken)).expect(409);

    let order = (await ctx.http.get(`/api/v1/orders/${orderId}`).set(auth(ctx.adminToken))).body;
    expect(order.status).toBe('IN_PRODUCTION');

    ctx.clock.freeze(todayAt('17:50'));
    await ctx.http.post(`/api/v1/production/tasks/${lb.id}/start`).set(auth(hotToken)).expect(201);
    ctx.clock.freeze(todayAt('17:58'));
    const pastryBoard = (await ctx.http.get('/api/v1/production/board').set(auth(pastryToken)).expect(200)).body;
    const ec = pastryBoard.tasks.find((t: { orderId: string }) => t.orderId === orderId);
    expect(ec.stationCode).toBe('PASTRY');
    await ctx.http.post(`/api/v1/production/tasks/${ec.id}/start`).set(auth(pastryToken)).expect(201);

    ctx.clock.freeze(todayAt('17:59'));
    await ctx.http.post(`/api/v1/production/tasks/${lb.id}/ready`).set(auth(hotToken)).expect(201);
    order = (await ctx.http.get(`/api/v1/orders/${orderId}`).set(auth(ctx.adminToken))).body;
    expect(order.status).toBe('PARTIALLY_READY');

    ctx.clock.freeze(todayAt('18:00'));
    await ctx.http.post(`/api/v1/production/tasks/${ec.id}/ready`).set(auth(pastryToken)).expect(201);
    await ctx.http.post(`/api/v1/production/tasks/${kh.id}/ready`).set(auth(hotToken)).expect(201);
    // READY on an already-ready task → conflict
    await ctx.http.post(`/api/v1/production/tasks/${kh.id}/ready`).set(auth(hotToken)).expect(409);

    order = (await ctx.http.get(`/api/v1/orders/${orderId}`).set(auth(ctx.adminToken))).body;
    expect(order.status).toBe('READY_FOR_ASSEMBLY');
    expect(order.tasks.every((t: { status: string }) => t.status === 'READY')).toBe(true);
    expect(order.tasks.every((t: { actualStartedAt: string | null; actualReadyAt: string | null }) => t.actualStartedAt && t.actualReadyAt)).toBe(true);
  });

  it('dispatcher sees the assembled order, hands it to the customer and the display follows in realtime', async () => {
    const board = (await ctx.http.get(`/api/v1/dispatch/board?branchId=${ctx.branchId}`).set(auth(dispatcherToken)).expect(200)).body;
    const mine = board.readyForAssembly.find((o: { id: string }) => o.id === orderId);
    expect(mine).toBeDefined();
    expect(mine.groupsReady).toBe(mine.groupsTotal);
    expect(mine.groupsTotal).toBe(2); // HOT_KITCHEN + PASTRY

    displayEvents.length = 0;
    ctx.clock.freeze(todayAt('18:02'));
    const ready = await ctx.http.post(`/api/v1/dispatch/orders/${orderId}/ready-for-customer`).set(auth(dispatcherToken)).expect(201);
    expect(ready.body.status).toBe('READY_FOR_PICKUP');

    const readyBoard = await waitFor(() => {
      const ev = displayEvents.filter((e) => e.type === 'DISPLAY_BOARD').at(-1);
      const b = ev?.payload as DisplayBoardView | undefined;
      return b && b.ready.some((r) => r.publicNumber === publicNumber) ? b : undefined;
    }, 5000, 'DISPLAY_BOARD with number in READY');
    expect(readyBoard.preparing.map((p) => p.publicNumber)).not.toContain(publicNumber);

    // dispatcher cannot hand over twice
    ctx.clock.freeze(todayAt('18:05'));
    const done = await ctx.http.post(`/api/v1/dispatch/orders/${orderId}/handed-over`).set(auth(dispatcherToken)).expect(201);
    expect(done.body.status).toBe('COMPLETED');
    await ctx.http.post(`/api/v1/dispatch/orders/${orderId}/handed-over`).set(auth(dispatcherToken)).expect(409);

    await waitFor(() => {
      const ev = displayEvents.filter((e) => e.type === 'DISPLAY_BOARD').at(-1);
      const b = ev?.payload as DisplayBoardView | undefined;
      return b && !b.ready.some((r) => r.publicNumber === publicNumber) && !b.preparing.some((r) => r.publicNumber === publicNumber) ? true : undefined;
    }, 5000, 'number removed from display');

    const timeline = (await ctx.http.get(`/api/v1/admin/orders/${orderId}/timeline`).set(auth(ctx.adminToken)).expect(200)).body as { label: string }[];
    const labels = timeline.map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(['Order DRAFT', 'Payment SUCCEEDED', 'Order SCHEDULED', 'ხაჭაპური started', 'ლობიანი ready', 'Order READY_FOR_PICKUP', 'Order COMPLETED']));
  });
});

describe('payments: cash, failure, duplicates', () => {
  let ctx: TestContext;
  let kioskToken: string;
  let cashierToken: string;
  let lobiani: string;
  let giftbox: string;

  beforeAll(async () => {
    ctx = await bootTestApp();
    kioskToken = await createDevice(ctx, 'KIOSK', 'Pay-Kiosk');
    cashierToken = await loginAs(ctx, 'cashier@madart.local', 'cashier123');
    lobiani = await createProduct(ctx, { sku: 'P-LB', name: 'ლობიანი', price: 900, categoryCode: 'LOBIANI', stationCode: 'HOT_KITCHEN', minutes: 10 });
    giftbox = await createProduct(ctx, { sku: 'P-GB', name: 'სასაჩუქრე ყუთი', price: 1299, categoryCode: 'OTHER', stationCode: 'PACKAGING', minutes: 5 });
  });

  afterAll(async () => ctx?.close());

  it('kiosk cash order waits at the cashier and enters production only after MARK AS PAID', async () => {
    const created = (
      await ctx.http
        .post('/api/v1/orders')
        .set(auth(kioskToken))
        .send({ branchId: ctx.branchId, source: 'KIOSK', paymentMethod: 'CASH', idempotencyKey: idem('cash'), items: [{ productId: lobiani, quantity: 1 }] })
        .expect(201)
    ).body;
    expect(created.order.status).toBe('AWAITING_PAYMENT');
    expect(created.order.paymentStatus).toBe('UNPAID');
    expect(created.payment).toBeNull();
    expect(created.order.tasks).toHaveLength(0);

    // cashier finds it in the awaiting-cash list and by number
    const list = (await ctx.http.get(`/api/v1/orders?branchId=${ctx.branchId}&awaitingCash=true`).set(auth(cashierToken)).expect(200)).body;
    expect(list.items.map((o: { id: string }) => o.id)).toContain(created.order.id);
    const byNumber = (await ctx.http.get(`/api/v1/orders/by-number/${created.order.publicNumber.toLowerCase()}?branchId=${ctx.branchId}`).set(auth(cashierToken)).expect(200)).body;
    expect(byNumber.id).toBe(created.order.id);

    // kiosk devices may not confirm cash
    await ctx.http.post(`/api/v1/orders/${created.order.id}/payments/cash-confirm`).set(auth(kioskToken)).send({ amountReceived: 1000, idempotencyKey: idem('x') }).expect(403);

    const key = idem('cashconfirm');
    const paid = (await ctx.http.post(`/api/v1/orders/${created.order.id}/payments/cash-confirm`).set(auth(cashierToken)).send({ amountReceived: 1000, idempotencyKey: key }).expect(201)).body;
    expect(paid.status).toBe('SUCCEEDED');
    expect(paid.method).toBe('CASH');

    // same idempotency key → same payment, no second charge
    const again = (await ctx.http.post(`/api/v1/orders/${created.order.id}/payments/cash-confirm`).set(auth(cashierToken)).send({ amountReceived: 1000, idempotencyKey: key }).expect(201)).body;
    expect(again.id).toBe(paid.id);
    // different key on an already paid order → conflict
    await ctx.http.post(`/api/v1/orders/${created.order.id}/payments/cash-confirm`).set(auth(cashierToken)).send({ amountReceived: 1000, idempotencyKey: idem('other') }).expect(409);

    const order = (await ctx.http.get(`/api/v1/orders/${created.order.id}`).set(auth(cashierToken)).expect(200)).body;
    expect(order.status).toBe('SCHEDULED');
    expect(order.paymentStatus).toBe('PAID');
    expect(order.tasks).toHaveLength(1);
  });

  it('a declined card payment leaves the order awaiting payment with no production tasks', async () => {
    const created = (
      await ctx.http
        .post('/api/v1/orders')
        .set(auth(kioskToken))
        .send({ branchId: ctx.branchId, source: 'KIOSK', paymentMethod: 'CARD', idempotencyKey: idem('fail'), items: [{ productId: giftbox, quantity: 1 }] })
        .expect(201)
    ).body;
    expect(created.payment.status).toBe('FAILED');
    expect(created.payment.failureCode).toBe('DECLINED');
    const order = (await ctx.http.get(`/api/v1/orders/${created.order.id}`).set(auth(ctx.adminToken))).body;
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.paymentStatus).toBe('FAILED');
    expect(order.tasks).toHaveLength(0);

    // customer switches to cash → cashier confirms → production
    await ctx.http.post(`/api/v1/orders/${created.order.id}/payments/cash-confirm`).set(auth(cashierToken)).send({ amountReceived: 1299, idempotencyKey: idem('rescue') }).expect(201);
    const after = (await ctx.http.get(`/api/v1/orders/${created.order.id}`).set(auth(ctx.adminToken))).body;
    expect(after.status).toBe('SCHEDULED');
    expect(after.paymentMethod).toBe('CASH');
  });

  it('a duplicate provider callback is absorbed', async () => {
    const created = (
      await ctx.http
        .post('/api/v1/orders')
        .set(auth(kioskToken))
        .send({ branchId: ctx.branchId, source: 'KIOSK', paymentMethod: 'CARD', idempotencyKey: idem('dupcb'), items: [{ productId: lobiani, quantity: 2 }] })
        .expect(201)
    ).body;
    const payment = created.payment;
    expect(payment.status).toBe('SUCCEEDED');

    const replay = await ctx.http.post(`/api/v1/payments/${payment.id}/callback`).send({ providerReference: payment.providerReference, result: 'SUCCEEDED' }).expect(200);
    expect(replay.body.status).toBe('SUCCEEDED');
    // a contradicting late FAILED callback cannot flip a settled payment
    const contradict = await ctx.http.post(`/api/v1/payments/${payment.id}/callback`).send({ providerReference: payment.providerReference, result: 'FAILED', failureCode: 'LATE' }).expect(200);
    expect(contradict.body.status).toBe('SUCCEEDED');

    const order = (await ctx.http.get(`/api/v1/orders/${created.order.id}`).set(auth(ctx.adminToken))).body;
    expect(order.status).toBe('SCHEDULED');
    expect(order.history.filter((h: { toStatus: string }) => h.toStatus === 'PAID')).toHaveLength(1);
    expect(order.tasks).toHaveLength(1);
  });

  it('cancelling a paid order requires the refund permission and cancels its tasks', async () => {
    const created = (
      await ctx.http
        .post('/api/v1/orders')
        .set(auth(kioskToken))
        .send({ branchId: ctx.branchId, source: 'KIOSK', paymentMethod: 'CARD', idempotencyKey: idem('cancel'), items: [{ productId: lobiani, quantity: 1 }] })
        .expect(201)
    ).body;
    await ctx.http.post(`/api/v1/orders/${created.order.id}/cancel`).set(auth(cashierToken)).send({ reason: 'customer left' }).expect(403);
    const cancelled = (await ctx.http.post(`/api/v1/orders/${created.order.id}/cancel`).set(auth(ctx.adminToken)).send({ reason: 'customer left' }).expect(201)).body;
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.tasks.every((t: { status: string }) => t.status === 'CANCELLED')).toBe(true);

    const refunded = (await ctx.http.post(`/api/v1/payments/${created.payment.id}/refunds`).set(auth(ctx.adminToken)).send({ amount: 900, reason: 'cancelled', idempotencyKey: idem('rf') }).expect(201)).body;
    expect(refunded.status).toBe('REFUNDED');
    const order = (await ctx.http.get(`/api/v1/orders/${created.order.id}`).set(auth(ctx.adminToken))).body;
    expect(order.status).toBe('REFUNDED');
    expect(order.paymentStatus).toBe('REFUNDED');

    const audit = (await ctx.http.get(`/api/v1/admin/audit-logs?orderId=${created.order.id}`).set(auth(ctx.adminToken)).expect(200)).body;
    expect(audit.items.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['CANCEL', 'REFUND']));
  });
});
