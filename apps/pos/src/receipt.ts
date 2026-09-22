import { MockReceiptPrinterAdapter, type ReceiptDocument, type ReceiptPrinterAdapter, MockCashDrawerAdapter } from '@madart/hardware-adapters';
import type { OrderView } from '@madart/types';

/** Local device adapters (mock in MVP – spec §7, §33). Real SDKs are wired through the Electron preload later. */
export const printer: ReceiptPrinterAdapter = new MockReceiptPrinterAdapter((line) => console.info(line));
export const cashDrawer = new MockCashDrawerAdapter();

export function receiptFor(order: OrderView, branchName: string, kind: ReceiptDocument['kind'] = 'NON_FISCAL'): ReceiptDocument {
  return {
    kind,
    publicNumber: order.publicNumber,
    branchName,
    lines: order.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    paymentMethod: order.paymentMethod,
    footer: ['მადლობა! · MADART'],
    issuedAt: new Date(),
  };
}
