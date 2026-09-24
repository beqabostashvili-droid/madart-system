import type { PromotionKind, PromotionView } from '@madart/types';
import { type CSSProperties, useEffect, useState } from 'react';
import { cx } from './components';

/** Fallback pill text per kind when the promotion has no badgeText of its own. */
export type PromoLabels = Record<Exclude<PromotionKind, 'GENERAL'>, string> & { tap?: string };

const DEFAULT_LABELS: PromoLabels = { NEW_PRODUCT: 'ახალი', DISCOUNT: '%', tap: 'დააჭირეთ' };

const PILL: Record<PromotionKind, string> = {
  GENERAL: 'bg-brand text-brand-ink',
  NEW_PRODUCT: 'bg-emerald-500 text-white',
  DISCOUNT: 'bg-rose-500 text-white',
};

const SPOTLIGHT_GRADIENT: Record<'NEW_PRODUCT' | 'DISCOUNT', string> = {
  NEW_PRODUCT: 'from-emerald-950/90 via-emerald-900/35',
  DISCOUNT: 'from-rose-950/90 via-rose-900/35',
};

function useRotation(count: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [count]);
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs]);
  return index;
}

const intervalStyle = (ms: number) => ({ '--promo-interval': `${ms}ms` }) as CSSProperties;

function Pill({ promotion, labels, className }: { promotion: PromotionView; labels: PromoLabels; className?: string }) {
  const text = promotion.badgeText || (promotion.kind === 'GENERAL' ? null : labels[promotion.kind]);
  if (!text) return null;
  return <span className={cx('rounded-full px-3.5 py-1.5 text-sm font-extrabold uppercase tracking-wide shadow-lg', PILL[promotion.kind], className)}>{text}</span>;
}

/** Segmented progress bar: one segment per slide, the active one fills over the interval. */
function Progress({ count, index, className }: { count: number; index: number; className?: string }) {
  if (count <= 1) return null;
  return (
    <div className={cx('flex gap-1.5', className)}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/35">
          {i < index && <span className="block h-full w-full bg-white" />}
          {i === index && <span key={index} className="animate-progress block h-full bg-white" />}
        </span>
      ))}
    </div>
  );
}

/**
 * Hero news/ad banner for the kiosk idle screen (reusable on mobile). Not part
 * of the original spec — added for in-store advertising, managed from
 * Admin → Promotions. Slides cross-fade with a slow zoom; a promotion linked to
 * a product is tappable and reports the tap through onSelect. Renders nothing
 * when there are no promotions, so callers don't need to branch on it.
 */
export function PromoCarousel({
  promotions,
  intervalMs = 7000,
  onSelect,
  labels: labelsProp,
  className,
}: {
  promotions: PromotionView[];
  intervalMs?: number;
  onSelect?: (promotion: PromotionView) => void;
  labels?: Partial<PromoLabels>;
  className?: string;
}) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const index = useRotation(promotions.length, intervalMs);
  if (promotions.length === 0) return null;
  const single = promotions.length === 1;

  return (
    <div className={cx('relative overflow-hidden bg-black/10 ring-1 ring-black/10', className)} style={intervalStyle(intervalMs)}>
      {promotions.map((p, i) => {
        const active = i === index;
        const tappable = !!onSelect && !!p.linkProductId;
        return (
          <div
            key={p.id}
            aria-hidden={!active}
            role={tappable ? 'button' : undefined}
            onClick={
              tappable
                ? (e) => {
                    e.stopPropagation();
                    onSelect(p);
                  }
                : undefined
            }
            className={cx('absolute inset-0 transition-opacity duration-1000 ease-in-out', active ? 'opacity-100' : 'pointer-events-none opacity-0', tappable && 'cursor-pointer active:scale-[0.99]')}
          >
            <img src={p.imageUrl} alt={p.title} className={cx('h-full w-full object-cover', active && (single ? 'animate-kenburns-loop' : 'animate-kenburns'))} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
            <div className="absolute left-5 top-5">{active && <Pill promotion={p} labels={labels} className="animate-rise" />}</div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 px-6 pb-7 text-left text-white">
              <div className="min-w-0">
                {active && <div className="animate-rise line-clamp-2 text-3xl font-extrabold leading-tight drop-shadow-lg md:text-4xl">{p.title}</div>}
                {active && p.subtitle && <div className="animate-rise-delay mt-2 line-clamp-2 text-lg font-medium text-white/90 drop-shadow md:text-xl">{p.subtitle}</div>}
              </div>
              {tappable && active && (
                <span className="animate-rise-delay flex shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-base font-extrabold text-brand-ink shadow-xl">
                  {labels.tap} <span aria-hidden>→</span>
                </span>
              )}
            </div>
          </div>
        );
      })}
      <Progress count={promotions.length} index={index} className="absolute inset-x-6 bottom-3" />
    </div>
  );
}

/**
 * A single tappable ad "spotlight" tile for the catalog/menu screen — a
 * smaller, grid-friendly sibling of {@link PromoCarousel}. New-product and
 * discount promotions are rendered through separate instances of this
 * component so the two never blend into one strip. Rotates through its own
 * promotions independently when there is more than one.
 */
export function PromoSpotlight({
  promotions,
  kind,
  intervalMs = 6000,
  onSelect,
  labels: labelsProp,
  className,
}: {
  promotions: PromotionView[];
  kind: 'NEW_PRODUCT' | 'DISCOUNT';
  intervalMs?: number;
  onSelect?: (promotion: PromotionView) => void;
  labels?: Partial<PromoLabels>;
  className?: string;
}) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const index = useRotation(promotions.length, intervalMs);
  const p = promotions[index];
  if (!p) return null;
  const single = promotions.length === 1;
  const linked = !!p.linkProductId;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(p)}
      style={intervalStyle(intervalMs)}
      className={cx('group relative block w-full overflow-hidden rounded-3xl text-left shadow-xl ring-1 ring-black/10 transition active:scale-[0.98]', className)}
    >
      <img key={p.id} src={p.imageUrl} alt="" className={cx('absolute inset-0 h-full w-full object-cover', single ? 'animate-kenburns-loop' : 'animate-kenburns')} />
      <div className={cx('absolute inset-0 bg-gradient-to-t to-black/10', SPOTLIGHT_GRADIENT[kind])} />
      <div key={`${p.id}-pill`} className="absolute left-4 top-4">
        <Pill promotion={p} labels={labels} className="animate-rise" />
      </div>
      {linked && (
        <span aria-hidden className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-white backdrop-blur-sm transition group-active:bg-white/35">
          →
        </span>
      )}
      <div key={`${p.id}-text`} className="relative flex h-full flex-col justify-end p-5 pb-6 text-white">
        <div className="animate-rise line-clamp-2 text-2xl font-extrabold leading-tight drop-shadow-lg">{p.title}</div>
        {p.subtitle && <div className="animate-rise-delay mt-1 line-clamp-1 text-base font-medium text-white/90 drop-shadow">{p.subtitle}</div>}
      </div>
      <Progress count={promotions.length} index={index} className="absolute inset-x-5 bottom-2.5" />
    </button>
  );
}
