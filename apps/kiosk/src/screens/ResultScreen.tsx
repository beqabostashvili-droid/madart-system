import type { ApiClient, RealtimeClient } from '@madart/api-client';
import type { Locale } from '@madart/domain';
import type { CreateOrderResponse, PaymentView } from '@madart/types';
import { roomNames } from '@madart/types';
import { Button, printReceiptNow, ReceiptPaper, Spinner, useRealtimeEvents } from '@madart/ui';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { orderSlipFor, printer } from '../receipt';

export function ResultScreen({
  locale,
  result,
  api,
  rt,
  branchName,
  onRetryCard,
  onDone,
}: {
  locale: Locale;
  result: CreateOrderResponse;
  api: ApiClient;
  rt: RealtimeClient | null;
  branchName: string;
  onRetryCard: () => Promise<void>;
  onDone: () => void;
}) {
  const [payment, setPayment] = useState<PaymentView | null>(result.payment);
  const [qr, setQr] = useState<string>('');
  const [retrying, setRetrying] = useState(false);
  const order = result.order;
  const isCash = order.paymentMethod === 'CASH' && !payment;

  useEffect(() => {
    QRCode.toDataURL(result.qrPayload, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(''));
  }, [result.qrPayload]);

  // realtime first, polling as the safety net (spec §32)
  useEffect(() => {
    rt?.subscribe([roomNames.order(order.id)]);
  }, [rt, order.id]);
  useRealtimeEvents(rt, (e) => {
    if (e.orderId !== order.id) return;
    if (payment) api.payments.get(payment.id).then(setPayment).catch(() => undefined);
  }, ['PAYMENT_COMPLETED', 'PAYMENT_FAILED']);
  useEffect(() => {
    if (!payment || (payment.status !== 'PENDING' && payment.status !== 'INITIATED')) return;
    const id = setInterval(() => api.payments.get(payment.id).then(setPayment).catch(() => undefined), 2000);
    return () => clearInterval(id);
  }, [payment?.id, payment?.status, api, payment]);

  const pending = payment && (payment.status === 'PENDING' || payment.status === 'INITIATED');
  const failed = payment && (payment.status === 'FAILED' || payment.status === 'CANCELLED');
  const paid = payment?.status === 'SUCCEEDED';

  // Print the order slip once: after a successful card payment, or immediately for cash orders (A-21).
  const printed = useRef(false);
  useEffect(() => {
    if (printed.current) return;
    if (paid || isCash) {
      printed.current = true;
      void printer.print(orderSlipFor(order, branchName, result.qrPayload, !!paid));
    }
  }, [paid, isCash, order, branchName, result.qrPayload]);

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      {pending && (
        <>
          <Spinner className="h-16 w-16 text-brand-dark" />
          <div className="mt-6 text-3xl font-bold">{t(locale, 'waitingTerminal')}</div>
          <div className="mt-2 text-ink-muted">{t(locale, 'cardHint')}</div>
        </>
      )}

      {failed && (
        <>
          <div className="text-7xl">⚠️</div>
          <div className="mt-4 text-3xl font-bold text-danger">{t(locale, 'paymentFailed')}</div>
          <div className="mt-1 text-ink-muted">{payment?.failureCode}</div>
          <div className="mt-8 flex gap-3">
            <Button
              size="lg"
              loading={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  await onRetryCard();
                } finally {
                  setRetrying(false);
                }
              }}
            >
              {t(locale, 'retry')}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setPayment(null)}>
              {t(locale, 'payCashInstead')}
            </Button>
          </div>
        </>
      )}

      {(paid || isCash || (!payment && order.paymentMethod !== 'CASH')) && (
        <div className="grid w-full max-w-5xl items-center gap-10 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col items-center">
            <div className="text-xl font-semibold text-ink-muted">{t(locale, 'yourOrder')}</div>
            <div className="my-4 rounded-3xl bg-ink px-12 py-6 text-8xl font-extrabold tracking-wider text-brand animate-pop">{order.publicNumber}</div>
            {qr && <img src={qr} alt="QR" className="rounded-xl bg-white p-2 shadow-card" />}
            <div className="mt-6 text-2xl font-bold">{paid ? t(locale, 'paidThanks') : t(locale, 'payAtCashier')}</div>
            <div className="mt-2 max-w-md text-ink-muted">{t(locale, 'followDisplay')}</div>
            <div className="mt-8 flex gap-3">
              <Button size="lg" variant="outline" onClick={printReceiptNow}>
                🖨 {t(locale, 'printReceipt')}
              </Button>
              <Button size="lg" onClick={onDone}>
                {t(locale, 'newOrder')}
              </Button>
            </div>
          </div>
          {/* the same slip the receipt printer gets (A-21) */}
          <div className="receipt-print flex justify-center animate-pop">
            <ReceiptPaper doc={orderSlipFor(order, branchName, result.qrPayload, !!paid)} />
          </div>
        </div>
      )}
    </div>
  );
}
