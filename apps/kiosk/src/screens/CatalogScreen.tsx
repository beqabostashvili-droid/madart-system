import type { Locale } from '@madart/domain';
import type { CatalogProductView, CatalogView, PromotionView } from '@madart/types';
import { Button, cx, formatGel, Modal, PromoSpotlight, QuantityStepper } from '@madart/ui';
import { type Dispatch, useMemo, useState } from 'react';
import { type CartAction, type CartLine, cartCount, cartTotal } from '../cart';
import { t } from '../i18n';

export function CatalogScreen({
  locale,
  catalog,
  cart,
  dispatch,
  onCheckout,
  onCancel,
  promotions,
}: {
  locale: Locale;
  catalog: CatalogView;
  cart: CartLine[];
  dispatch: Dispatch<CartAction>;
  onCheckout: () => void;
  onCancel: () => void;
  promotions: PromotionView[];
}) {
  const [categoryId, setCategoryId] = useState<string>(catalog.categories[0]?.id ?? '');
  const [detail, setDetail] = useState<CatalogProductView | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const products = useMemo(() => catalog.products.filter((p) => p.categoryId === categoryId), [catalog, categoryId]);
  const byId = useMemo(() => new Map(catalog.products.map((p) => [p.id, p])), [catalog]);

  // catalog spotlight ads (Admin → Promotions, kind NEW_PRODUCT/DISCOUNT): kept
  // as two separate cards so a discount never gets buried under news, per spec.
  const newPromotions = useMemo(() => promotions.filter((p) => p.kind === 'NEW_PRODUCT'), [promotions]);
  const discountPromotions = useMemo(() => promotions.filter((p) => p.kind === 'DISCOUNT'), [promotions]);
  const openPromotion = (p: PromotionView) => {
    const linked = p.linkProductId && byId.get(p.linkProductId);
    if (linked) setDetail(linked);
  };

  // upsell (spec §4): recommendations of cart items not yet in the cart
  const recommendations = useMemo(() => {
    const inCart = new Set(cart.map((l) => l.product.id));
    const ids = new Set<string>();
    for (const l of cart) for (const r of l.product.recommendedProductIds) if (!inCart.has(r)) ids.add(r);
    return [...ids].map((id) => byId.get(id)).filter((p): p is CatalogProductView => !!p).slice(0, 4);
  }, [cart, byId]);

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-line bg-surface p-3 scrollbar-none">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">{t(locale, 'categories')}</div>
        {catalog.categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={cx('mb-1 block w-full rounded-xl px-4 py-4 text-left text-lg font-semibold transition', c.id === categoryId ? 'bg-brand text-brand-ink' : 'hover:bg-canvas')}
          >
            {c.name}
          </button>
        ))}
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto p-4">
        {(newPromotions.length > 0 || discountPromotions.length > 0) && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {newPromotions.length > 0 && <PromoSpotlight promotions={newPromotions} kind="NEW_PRODUCT" onSelect={openPromotion} className="h-36" />}
            {discountPromotions.length > 0 && <PromoSpotlight promotions={discountPromotions} kind="DISCOUNT" onSelect={openPromotion} className="h-36" />}
          </div>
        )}
        {products.length === 0 && <div className="p-8 text-center text-ink-muted">{t(locale, 'noProducts')}</div>}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <ProductTile key={p.id} product={p} locale={locale} onOpen={() => setDetail(p)} onAdd={() => dispatch({ type: 'add', product: p })} />
          ))}
        </div>
      </section>

      {/* cart bar */}
      <div className="fixed inset-x-0 bottom-12 z-20 flex justify-center px-6 pointer-events-none">
        <button
          onClick={() => setCartOpen(true)}
          className={cx('pointer-events-auto flex w-full max-w-3xl items-center justify-between rounded-2xl px-6 py-4 text-xl font-bold shadow-card transition', cart.length ? 'bg-ink text-white' : 'bg-surface text-ink-muted')}
        >
          <span>
            🛒 {t(locale, 'cart')} · {cartCount(cart)}
          </span>
          <span className="tabular">{formatGel(cartTotal(cart))}</span>
        </button>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg">
        {detail && <ProductDetail product={detail} locale={locale} onAdd={(qty, mods) => dispatch({ type: 'add', product: detail, quantity: qty, modifierIds: mods })} onClose={() => setDetail(null)} />}
      </Modal>

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={t(locale, 'cart')} size="lg">
        {cart.length === 0 ? (
          <div className="py-10 text-center text-ink-muted">{t(locale, 'emptyCart')}</div>
        ) : (
          <div className="space-y-3">
            {cart.map((l) => (
              <div key={l.key} className="flex items-center gap-3 rounded-xl border border-line p-3">
                {l.product.imageUrl && <img src={l.product.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.product.name}</div>
                  <div className="text-sm text-ink-muted">{formatGel(l.unitPrice)}</div>
                </div>
                <QuantityStepper value={l.quantity} onChange={(q) => dispatch({ type: 'setQty', key: l.key, quantity: q })} />
                <div className="tabular w-24 text-right font-bold">{formatGel(l.unitPrice * l.quantity)}</div>
              </div>
            ))}
            {recommendations.length > 0 && (
              <div className="rounded-xl bg-canvas p-3">
                <div className="mb-2 text-sm font-semibold text-ink-muted">{t(locale, 'recommended')}</div>
                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {recommendations.map((p) => (
                    <button key={p.id} onClick={() => dispatch({ type: 'add', product: p })} className="flex w-36 shrink-0 flex-col rounded-xl bg-surface p-2 text-left shadow-sm active:scale-95">
                      {p.imageUrl && <img src={p.imageUrl} alt="" className="mb-1 h-20 w-full rounded-lg object-cover" />}
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="text-xs text-ink-muted">+ {formatGel(p.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-line pt-3 text-2xl font-extrabold">
              <span>{t(locale, 'total')}</span>
              <span className="tabular">{formatGel(cartTotal(cart))}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" onClick={() => setCartOpen(false)}>
                {t(locale, 'continueShopping')}
              </Button>
              <Button size="lg" block onClick={onCheckout}>
                {t(locale, 'checkout')} →
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <button onClick={onCancel} className="hidden" aria-hidden />
    </div>
  );
}

function ProductTile({ product, locale, onOpen, onAdd }: { product: CatalogProductView; locale: Locale; onOpen: () => void; onAdd: () => void }) {
  return (
    <div className="card flex flex-col overflow-hidden p-0">
      <button onClick={onOpen} className="text-left">
        <div className="aspect-[4/3] w-full bg-canvas">{product.imageUrl && <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover" />}</div>
        <div className="p-3">
          <div className="line-clamp-2 min-h-12 text-base font-semibold leading-tight">{product.name}</div>
          {product.productionTimeMinutes > 0 && (
            <div className="mt-1 text-xs text-ink-muted">
              ⏱ {product.productionTimeMinutes} {t(locale, 'minutes')}
            </div>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between px-3 pb-3">
        <span className="tabular text-lg font-extrabold">{formatGel(product.price)}</span>
        <Button size="sm" onClick={product.modifierGroups.length ? onOpen : onAdd}>
          + {t(locale, 'add')}
        </Button>
      </div>
    </div>
  );
}

function ProductDetail({ product, locale, onAdd, onClose }: { product: CatalogProductView; locale: Locale; onAdd: (qty: number, modifierIds: string[]) => void; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [mods, setMods] = useState<string[]>([]);
  const delta = product.modifierGroups.flatMap((g) => g.modifiers).filter((m) => mods.includes(m.id)).reduce((s, m) => s + m.priceDelta, 0);
  const valid = product.modifierGroups.every((g) => {
    const n = g.modifiers.filter((m) => mods.includes(m.id)).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-canvas">{product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}</div>
      <div className="flex flex-col">
        <h3 className="text-2xl font-bold">{product.name}</h3>
        {product.description && <p className="mt-2 text-ink-muted">{product.description}</p>}
        {product.modifierGroups.map((g) => (
          <div key={g.id} className="mt-4">
            <div className="mb-1 text-sm font-semibold">{g.name}</div>
            <div className="flex flex-wrap gap-2">
              {g.modifiers.map((m) => {
                const on = mods.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (on) setMods(mods.filter((x) => x !== m.id));
                      else {
                        const others = g.modifiers.map((x) => x.id);
                        const kept = g.maxSelect === 1 ? mods.filter((x) => !others.includes(x)) : mods;
                        setMods([...kept, m.id]);
                      }
                    }}
                    className={cx('rounded-full border px-3 py-1.5 text-sm font-medium', on ? 'border-ink bg-ink text-white' : 'border-line bg-surface')}
                  >
                    {m.name} {m.priceDelta ? `(+${formatGel(m.priceDelta)})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="mt-auto flex items-center justify-between pt-6">
          <QuantityStepper value={qty} onChange={setQty} min={1} size="lg" />
          <div className="tabular text-2xl font-extrabold">{formatGel((product.price + delta) * qty)}</div>
        </div>
        <Button
          size="lg"
          block
          className="mt-4"
          disabled={!valid}
          onClick={() => {
            onAdd(qty, mods);
            onClose();
          }}
        >
          + {t(locale, 'add')}
        </Button>
      </div>
    </div>
  );
}
