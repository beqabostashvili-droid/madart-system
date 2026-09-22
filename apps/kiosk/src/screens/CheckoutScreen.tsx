import type { Locale } from '@madart/domain';
import { Button, formatGel } from '@madart/ui';
import type { CartLine } from '../cart';
import { t } from '../i18n';

export function CheckoutScreen({
  locale,
  cart,
  total,
  paying,
  onBack,
  onPay,
}: {
  locale: Locale;
  cart: CartLine[];
  total: number;
  paying: boolean;
  onBack: () => void;
  onPay: (method: 'CARD' | 'CASH') => void;
}) {
  const readyIn = Math.max(0, ...cart.map((l) => l.product.productionTimeMinutes));
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col p-6">
      <Button variant="ghost" onClick={onBack} className="self-start" disabled={paying}>
        ← {t(locale, 'back')}
      </Button>
      <div className="mt-4 grid flex-1 gap-6 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 text-xl font-bold">{t(locale, 'cart')}</h2>
          <ul className="divide-y divide-line">
            {cart.map((l) => (
              <li key={l.key} className="flex justify-between py-2">
                <span>
                  <span className="mr-2 inline-block w-8 rounded bg-canvas text-center font-bold">{l.quantity}×</span>
                  {l.product.name}
                </span>
                <span className="tabular font-semibold">{formatGel(l.unitPrice * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-line pt-3 text-2xl font-extrabold">
            <span>{t(locale, 'total')}</span>
            <span className="tabular">{formatGel(total)}</span>
          </div>
          {readyIn > 0 && (
            <div className="mt-2 text-sm text-ink-muted">
              ⏱ {t(locale, 'readyIn')} {readyIn} {t(locale, 'minutes')}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">{t(locale, 'paymentMethod')}</h2>
          <button disabled={paying} onClick={() => onPay('CARD')} className="card flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center transition active:scale-[0.98] disabled:opacity-50">
            <span className="text-6xl">💳</span>
            <span className="text-2xl font-bold">{t(locale, 'card')}</span>
            <span className="text-sm text-ink-muted">{t(locale, 'cardHint')}</span>
          </button>
          <button disabled={paying} onClick={() => onPay('CASH')} className="card flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center transition active:scale-[0.98] disabled:opacity-50">
            <span className="text-6xl">💵</span>
            <span className="text-2xl font-bold">{t(locale, 'cash')}</span>
            <span className="text-sm text-ink-muted">{t(locale, 'cashHint')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
