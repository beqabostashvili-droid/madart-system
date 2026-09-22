import type { ReceiptDocument, ReceiptPrinterAdapter } from '@madart/hardware-adapters';
import QRCode from 'qrcode';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Button, cx } from './components';
import { formatGel } from './format';
import { Modal } from './overlays';

/**
 * Thermal-receipt style slip (80 mm paper). Used on the kiosk (order slip with
 * number + QR) and on the POS (receipt after payment). Printing goes through
 * the browser/Electron print dialog with an 80 mm @page rule (styles.css);
 * a real ESC/POS printer is added as another ReceiptPrinterAdapter (Phase 9).
 */
export function ReceiptPaper({ doc, className, compact }: { doc: ReceiptDocument; className?: string; compact?: boolean }) {
  const [qr, setQr] = useState<string>('');
  useEffect(() => {
    if (!doc.qrPayload) return setQr('');
    QRCode.toDataURL(doc.qrPayload, { margin: 0, width: 160 }).then(setQr).catch(() => setQr(''));
  }, [doc.qrPayload]);
  const when = new Intl.DateTimeFormat('ka-GE', { timeZone: 'Asia/Tbilisi', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(doc.issuedAt);

  return (
    <div className={cx('receipt-paper', compact && 'receipt-paper-compact', className)}>
      <div className="receipt-edge receipt-edge-top" />
      <div className="receipt-body">
        <div className="receipt-brand">MADART</div>
        <div className="receipt-muted">{doc.branchName}</div>
        <div className="receipt-muted">{when}</div>
        <div className="receipt-kind">{doc.kind === 'FISCAL' ? 'ფისკალური ჩეკი' : 'შეკვეთის ქვითარი (არაფისკალური)'}</div>
        <div className="receipt-number">{doc.publicNumber}</div>
        <div className="receipt-rule" />
        <table className="receipt-lines">
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i}>
                <td className="receipt-qty">{l.quantity}×</td>
                <td className="receipt-name">{l.name}</td>
                <td className="receipt-amount">{formatGel(l.lineTotal, { symbol: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="receipt-rule" />
        {doc.discountTotal > 0 && (
          <div className="receipt-row">
            <span>ფასდაკლება</span>
            <span>-{formatGel(doc.discountTotal, { symbol: false })}</span>
          </div>
        )}
        <div className="receipt-row receipt-total">
          <span>სულ</span>
          <span>{formatGel(doc.total)}</span>
        </div>
        <div className="receipt-row receipt-muted">
          <span>გადახდა</span>
          <span>{doc.paymentMethod === 'CASH' ? 'ნაღდი' : doc.paymentMethod === 'CARD' ? 'ბარათი' : doc.paymentMethod === 'ONLINE' ? 'ონლაინ' : doc.paymentMethod}</span>
        </div>
        {qr && (
          <div className="receipt-qr">
            <img src={qr} alt="QR" />
          </div>
        )}
        {doc.footer?.map((f, i) => (
          <div key={i} className="receipt-footer">
            {f}
          </div>
        ))}
      </div>
      <div className="receipt-edge receipt-edge-bottom" />
    </div>
  );
}

/** Opens the print dialog; `styles.css` prints only the element marked `.receipt-print`. */
export function printReceiptNow() {
  if (typeof window !== 'undefined') window.print();
}

// ───────────────────────────── screen printer adapter + provider ──────────

interface ReceiptsApi {
  /** Show the slip on screen (modal) and hand it to the hardware adapter. */
  show: (doc: ReceiptDocument, options?: { autoPrint?: boolean }) => void;
  /** Adapter that shows the slip – satisfies ReceiptPrinterAdapter so apps can pass it around. */
  printer: ReceiptPrinterAdapter;
  last: ReceiptDocument | null;
}

const ReceiptsContext = createContext<ReceiptsApi | null>(null);

/**
 * Screen printer: every `print()` shows the receipt in a modal with a Print
 * button (browser / Electron print dialog). `hardware` is an optional real
 * printer that receives the same document.
 */
export function ReceiptProvider({ children, hardware, title = 'ჩეკი' }: { children: ReactNode; hardware?: ReceiptPrinterAdapter; title?: string }) {
  const [doc, setDoc] = useState<ReceiptDocument | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);

  const show = useCallback(
    (d: ReceiptDocument, options?: { autoPrint?: boolean }) => {
      setDoc(d);
      setAutoPrint(options?.autoPrint ?? false);
      void hardware?.print(d);
    },
    [hardware],
  );

  useEffect(() => {
    if (!doc || !autoPrint) return;
    const t = setTimeout(printReceiptNow, 400);
    return () => clearTimeout(t);
  }, [doc, autoPrint]);

  const api = useMemo<ReceiptsApi>(
    () => ({
      show,
      last: doc,
      printer: {
        name: 'SCREEN',
        print: async (d) => {
          show(d);
          return { ok: true, jobId: `screen-${Date.now()}` };
        },
        health: async () => ({ online: true, detail: 'on-screen receipt' }),
      },
    }),
    [show, doc],
  );

  return (
    <ReceiptsContext.Provider value={api}>
      {children}
      <Modal open={!!doc} onClose={() => setDoc(null)} title={title} size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDoc(null)}>
              დახურვა
            </Button>
            <Button onClick={printReceiptNow}>🖨 ბეჭდვა</Button>
          </>
        }
      >
        {doc && (
          <div className="flex justify-center">
            <div className="receipt-print">
              <ReceiptPaper doc={doc} />
            </div>
          </div>
        )}
      </Modal>
    </ReceiptsContext.Provider>
  );
}

export function useReceipts(): ReceiptsApi {
  const ctx = useContext(ReceiptsContext);
  if (!ctx) throw new Error('useReceipts must be used inside <ReceiptProvider>');
  return ctx;
}
