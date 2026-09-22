import { MockReceiptPrinterAdapter, type ReceiptDocument, type ReceiptPrinterAdapter } from '@madart/hardware-adapters';
import type { OrderView } from '@madart/types';

/**
 * Kiosk receipt printing (spec §33, ASSUMPTION A-21). The kiosk prints a
 * non-fiscal order slip with the number and QR right after the order is placed.
 * A real printer SDK is bridged through the Electron preload in Phase 9; the
 * mock logs the document to the console.
 */
export const printer: ReceiptPrinterAdapter = new MockReceiptPrinterAdapter((line) => console.info(line));

export function orderSlipFor(order: OrderView, branchName: string, qrPayload: string, paid: boolean): ReceiptDocument {
  return {
    kind: 'NON_FISCAL',
    publicNumber: order.publicNumber,
    branchName,
    lines: order.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    paymentMethod: order.paymentMethod,
    qrPayload,
    footer: paid ? ['გადახდილია · თვალი ადევნეთ ეკრანს', 'MADART'] : ['გთხოვთ გადაიხადოთ სალაროში', 'MADART'],
    issuedAt: new Date(),
  };
}
