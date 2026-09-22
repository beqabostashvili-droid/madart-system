/**
 * Hardware Adapter Layer (spec §7, §33). Business logic depends only on these
 * interfaces. Concrete bank / device SDKs are added as new classes later.
 */

// ───────────────────────────── payment terminal ──────────────────────────

export interface TerminalPaymentRequest {
  paymentId: string;
  orderId: string;
  publicNumber: string;
  amount: number; // tetri
  currency: string;
  terminalId?: string;
  /** URL the terminal bridge must call with the result (see docs/PAYMENTS.md). */
  callbackUrl: string;
  /** Opaque key the adapter must echo back so duplicates can be detected. */
  idempotencyKey: string;
}

export interface TerminalInitiateResult {
  providerReference: string;
  /** Some terminals answer synchronously; most answer through the callback. */
  immediate?: TerminalResult;
}

export type TerminalResultCode = 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface TerminalResult {
  providerReference: string;
  result: TerminalResultCode;
  failureCode?: string;
  maskedPan?: string;
  authCode?: string;
  raw?: Record<string, unknown>;
}

export type TerminalStatus = TerminalResult | { providerReference: string; result: 'PENDING' };

export interface TerminalRefundResult {
  providerReference: string;
  result: 'SUCCEEDED' | 'FAILED';
  failureCode?: string;
}

export class TerminalUnavailableError extends Error {
  readonly code = 'TERMINAL_OFFLINE';
  constructor(message = 'Payment terminal is offline') {
    super(message);
    this.name = 'TerminalUnavailableError';
  }
}

export interface PaymentTerminalAdapter {
  readonly provider: string;
  initiate(request: TerminalPaymentRequest): Promise<TerminalInitiateResult>;
  /** Authoritative status for reconciliation after a lost connection. */
  queryStatus(providerReference: string): Promise<TerminalStatus>;
  cancel(providerReference: string): Promise<void>;
  refund(providerReference: string, amount: number, idempotencyKey: string): Promise<TerminalRefundResult>;
  /** Verifies a callback signature when the provider signs them. */
  verifyCallback(payload: Record<string, unknown>, signature?: string): boolean;
  health(): Promise<{ online: boolean; detail?: string }>;
}

// ───────────────────────────── receipts ──────────────────────────────────

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptDocument {
  kind: 'FISCAL' | 'NON_FISCAL';
  publicNumber: string;
  branchName: string;
  lines: ReceiptLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  paymentMethod: string;
  qrPayload?: string;
  footer?: string[];
  issuedAt: Date;
}

export interface ReceiptPrinterAdapter {
  readonly name: string;
  print(doc: ReceiptDocument): Promise<{ ok: boolean; jobId?: string; error?: string }>;
  health(): Promise<{ online: boolean; detail?: string }>;
}

// ───────────────────────────── cash drawer ───────────────────────────────

export interface CashDrawerAdapter {
  open(): Promise<void>;
  health(): Promise<{ online: boolean }>;
}

// ───────────────────────────── scanners ──────────────────────────────────

export type ScanHandler = (code: string) => void;

export interface BarcodeScannerAdapter {
  onScan(handler: ScanHandler): () => void;
}

export interface QRScannerAdapter {
  onScan(handler: ScanHandler): () => void;
}
