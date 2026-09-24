import { type ApiError, newIdempotencyKey } from '@madart/api-client';
import type { Locale } from '@madart/domain';
import type { CatalogView, CreateOrderResponse, DeviceProfile, PaymentView, PromotionView } from '@madart/types';
import { Button, ConnectionBadge, OfflineBanner, Spinner, useConnectionState, useResource, useSession, useToast } from '@madart/ui';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { cartReducer, cartTotal, type CartLine } from './cart';
import { t } from './i18n';
import { CatalogScreen } from './screens/CatalogScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { PairingScreen } from './screens/PairingScreen';
import { ResultScreen } from './screens/ResultScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';

type Screen =
  | { name: 'welcome' }
  // openProductId: a promotion tapped on the idle screen opens that product straight away
  | { name: 'catalog'; openProductId?: string }
  | { name: 'checkout' }
  | { name: 'result'; result: CreateOrderResponse; payment: PaymentView | null };

const IDLE_MS = 90_000;
const RESULT_MS = 25_000;

export function App() {
  const { api, rt, token, setToken } = useSession();
  const toast = useToast();
  const connection = useConnectionState(rt);
  const [locale, setLocale] = useState<Locale>('ka');
  const [screen, setScreen] = useState<Screen>({ name: 'welcome' });
  const [cart, dispatch] = useReducer(cartReducer, [] as CartLine[]);
  const [paying, setPaying] = useState(false);
  const idemRef = useRef<string | null>(null);

  const device = useResource<DeviceProfile>(() => api.auth.device(), [token], { enabled: !!token });
  const catalog = useResource<CatalogView>(() => api.catalog.get(device.data!.branchId, 'KIOSK', locale), [device.data?.branchId, locale], {
    enabled: !!device.data,
    pollMs: 120_000,
  });
  // News/ad banner on the idle screen (Admin → Promotions); not part of the original spec.
  const promotions = useResource<PromotionView[]>(() => api.promotions.active(device.data!.branchId, 'KIOSK', locale), [device.data?.branchId, locale], {
    enabled: !!device.data,
    pollMs: 120_000,
  });

  const reset = useCallback(() => {
    dispatch({ type: 'clear' });
    idemRef.current = null;
    setScreen({ name: 'welcome' });
  }, []);

  // idle → back to welcome (spec §46: simple flow, no stale carts)
  useEffect(() => {
    if (screen.name === 'welcome') return;
    const ms = screen.name === 'result' ? RESULT_MS : IDLE_MS;
    let timer = setTimeout(reset, ms);
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, ms);
    };
    window.addEventListener('pointerdown', bump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', bump);
    };
  }, [screen.name, reset]);

  const placeOrder = async (method: 'CARD' | 'CASH') => {
    if (!device.data || cart.length === 0) return;
    setPaying(true);
    idemRef.current ??= newIdempotencyKey('kiosk');
    try {
      const res = await api.orders.create({
        branchId: device.data.branchId,
        source: 'KIOSK',
        paymentMethod: method,
        pickupType: 'ASAP',
        idempotencyKey: `${idemRef.current}:${method}`,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, modifierIds: l.modifierIds })),
      });
      setScreen({ name: 'result', result: res, payment: res.payment });
    } catch (e) {
      const err = e as ApiError;
      toast.error(t(locale, 'paymentFailed'), err.message);
    } finally {
      setPaying(false);
    }
  };

  if (!token) return <PairingScreen onToken={setToken} locale={locale} />;
  if (device.error?.isUnauthorized) return <PairingScreen onToken={setToken} locale={locale} error={device.error.message} />;
  if (!device.data || (!catalog.data && screen.name !== 'welcome')) {
    return (
      <Center>
        <Spinner className="h-12 w-12 text-brand-dark" />
      </Center>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <OfflineBanner state={connection} />
      {screen.name !== 'welcome' && (
        <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-brand px-3 py-1 text-lg font-extrabold tracking-wide text-brand-ink">MADART</span>
            <span className="text-sm text-ink-muted">{device.data.branchName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(['ka', 'en', 'ru'] as Locale[]).map((l) => (
                <button key={l} onClick={() => setLocale(l)} className={`rounded-lg px-3 py-1 text-sm font-semibold uppercase ${locale === l ? 'bg-ink text-white' : 'bg-canvas text-ink-muted'}`}>
                  {l}
                </button>
              ))}
            </div>
            <ConnectionBadge state={connection} compact />
          </div>
        </header>
      )}

      <main className="min-h-0 flex-1">
        {screen.name === 'welcome' && (
          <WelcomeScreen
            locale={locale}
            onLocale={setLocale}
            onStart={() => setScreen({ name: 'catalog' })}
            onPromotion={(p) => setScreen({ name: 'catalog', openProductId: p.linkProductId ?? undefined })}
            branchName={device.data.branchName}
            promotions={promotions.data ?? []}
          />
        )}
        {screen.name === 'catalog' && catalog.data && (
          <CatalogScreen
            locale={locale}
            catalog={catalog.data}
            cart={cart}
            dispatch={dispatch}
            onCheckout={() => setScreen({ name: 'checkout' })}
            onCancel={reset}
            promotions={promotions.data ?? []}
            openProductId={screen.openProductId}
          />
        )}
        {screen.name === 'checkout' && catalog.data && (
          <CheckoutScreen locale={locale} cart={cart} total={cartTotal(cart)} paying={paying} onBack={() => setScreen({ name: 'catalog' })} onPay={placeOrder} />
        )}
        {screen.name === 'result' && (
          <ResultScreen
            locale={locale}
            result={screen.result}
            api={api}
            rt={rt}
            branchName={device.data.branchName}
            onRetryCard={async () => {
              // new attempt = new idempotency key for the payment only
              const p = await api.payments.initiate(screen.result.order.id, { method: 'CARD', idempotencyKey: newIdempotencyKey('kiosk-retry') });
              setScreen({ ...screen, payment: p });
            }}
            onDone={reset}
          />
        )}
      </main>

      {screen.name !== 'welcome' && screen.name !== 'result' && (
        <footer className="flex items-center justify-between border-t border-line bg-surface px-6 py-2 text-xs text-ink-muted">
          <span>{device.data.name}</span>
          <Button variant="ghost" size="sm" onClick={reset}>
            {t(locale, 'newOrder')}
          </Button>
        </footer>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh items-center justify-center bg-canvas">{children}</div>;
}
