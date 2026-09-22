import {
  TerminalUnavailableError,
  type BarcodeScannerAdapter,
  type CashDrawerAdapter,
  type PaymentTerminalAdapter,
  type QRScannerAdapter,
  type ReceiptDocument,
  type ReceiptPrinterAdapter,
  type ScanHandler,
  type TerminalInitiateResult,
  type TerminalPaymentRequest,
  type TerminalRefundResult,
  type TerminalResult,
  type TerminalStatus,
} from './interfaces';

export interface MockTerminalOptions {
  /** Delay before the result callback is delivered (ms). */
  delayMs?: number;
  /** Called with the result – the API wires this to its own callback endpoint. */
  deliverCallback?: (paymentId: string, result: TerminalResult) => Promise<void> | void;
  /** Deterministic failure rule (ASSUMPTION A-10): totals ending in 99 tetri fail. */
  shouldFail?: (request: TerminalPaymentRequest) => boolean;
  /** Simulate an offline terminal. */
  offline?: boolean;
  now?: () => Date;
}

export const defaultMockFailureRule = (req: TerminalPaymentRequest): boolean => req.amount % 100 === 99;

/**
 * Mock card terminal. Behaves like a real terminal bridge: `initiate` returns a
 * provider reference immediately and the result arrives asynchronously via
 * `deliverCallback`. The API's reconciliation endpoint uses `queryStatus`.
 */
export class MockPaymentTerminalAdapter implements PaymentTerminalAdapter {
  readonly provider = 'MOCK_TERMINAL';
  private readonly results = new Map<string, TerminalResult>();
  private readonly pending = new Set<string>();
  private counter = 0;

  constructor(private readonly options: MockTerminalOptions = {}) {}

  async initiate(request: TerminalPaymentRequest): Promise<TerminalInitiateResult> {
    if (this.options.offline) throw new TerminalUnavailableError();
    const providerReference = `MOCK-${Date.now().toString(36).toUpperCase()}-${(++this.counter).toString().padStart(4, '0')}`;
    this.pending.add(providerReference);

    const fail = (this.options.shouldFail ?? defaultMockFailureRule)(request);
    const result: TerminalResult = fail
      ? { providerReference, result: 'FAILED', failureCode: 'DECLINED', raw: { mock: true, amount: request.amount } }
      : {
          providerReference,
          result: 'SUCCEEDED',
          maskedPan: '**** **** **** 4242',
          authCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
          raw: { mock: true, amount: request.amount },
        };

    const settle = async () => {
      this.pending.delete(providerReference);
      this.results.set(providerReference, result);
      await this.options.deliverCallback?.(request.paymentId, result);
    };
    const delay = this.options.delayMs ?? 1500;
    if (delay <= 0) {
      await settle();
      return { providerReference, immediate: result };
    }
    setTimeout(() => {
      void settle();
    }, delay);
    return { providerReference };
  }

  async queryStatus(providerReference: string): Promise<TerminalStatus> {
    const r = this.results.get(providerReference);
    if (r) return r;
    if (this.pending.has(providerReference)) return { providerReference, result: 'PENDING' };
    // Unknown reference (e.g. after API restart) – a real terminal would look it up; mock says failed.
    return { providerReference, result: 'FAILED', failureCode: 'UNKNOWN_REFERENCE' };
  }

  async cancel(providerReference: string): Promise<void> {
    this.pending.delete(providerReference);
    this.results.set(providerReference, { providerReference, result: 'CANCELLED' });
  }

  async refund(providerReference: string, _amount: number, idempotencyKey: string): Promise<TerminalRefundResult> {
    if (this.options.offline) throw new TerminalUnavailableError();
    return { providerReference: `${providerReference}-R-${idempotencyKey.slice(0, 8)}`, result: 'SUCCEEDED' };
  }

  verifyCallback(_payload: Record<string, unknown>, _signature?: string): boolean {
    return true; // the mock is unsigned; real adapters must verify HMAC/signature here
  }

  async health() {
    return { online: !this.options.offline, detail: 'mock terminal' };
  }
}

export class MockReceiptPrinterAdapter implements ReceiptPrinterAdapter {
  readonly name = 'MOCK_PRINTER';
  readonly printed: ReceiptDocument[] = [];
  constructor(private readonly log: (line: string) => void = () => {}) {}

  async print(doc: ReceiptDocument) {
    this.printed.push(doc);
    this.log(`[printer] ${doc.kind} receipt for ${doc.publicNumber} – ${doc.lines.length} lines, total ${doc.total}`);
    return { ok: true, jobId: `job-${this.printed.length}` };
  }
  async health() {
    return { online: true, detail: 'mock printer' };
  }
}

export class MockCashDrawerAdapter implements CashDrawerAdapter {
  opened = 0;
  async open() {
    this.opened += 1;
  }
  async health() {
    return { online: true };
  }
}

class EmitterScanner implements BarcodeScannerAdapter, QRScannerAdapter {
  private handlers = new Set<ScanHandler>();
  onScan(handler: ScanHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  /** Test helper – simulate a scan. */
  emit(code: string) {
    for (const h of this.handlers) h(code);
  }
}

export class MockBarcodeScannerAdapter extends EmitterScanner {}
export class MockQRScannerAdapter extends EmitterScanner {}
