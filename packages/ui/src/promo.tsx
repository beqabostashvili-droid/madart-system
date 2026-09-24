import type { PromotionView } from '@madart/types';
import { useEffect, useState } from 'react';
import { cx } from './components';

/**
 * Rotating news/ad banner for the kiosk idle screen (and reusable on mobile).
 * Not part of the original spec — added for in-store advertising and
 * announcements, managed from Admin → Promotions. Renders nothing when there
 * are no active promotions, so screens using it don't need to branch on it.
 */
export function PromoCarousel({
  promotions,
  intervalMs = 7000,
  className,
  imageClassName,
}: {
  promotions: PromotionView[];
  intervalMs?: number;
  className?: string;
  imageClassName?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [promotions.length]);

  useEffect(() => {
    if (promotions.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % promotions.length), intervalMs);
    return () => clearInterval(id);
  }, [promotions.length, intervalMs]);

  if (promotions.length === 0) return null;

  return (
    <div className={cx('relative overflow-hidden bg-black/5', className)}>
      {promotions.map((p, i) => (
        <div key={p.id} aria-hidden={i !== index} className={cx('absolute inset-0 transition-opacity duration-700 ease-in-out', i === index ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <img src={p.imageUrl} alt={p.title} className={cx('h-full w-full object-cover', imageClassName)} />
          {(p.title || p.subtitle) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-5 pb-4 pt-10 text-white">
              {p.title && <div className="text-xl font-bold leading-tight">{p.title}</div>}
              {p.subtitle && <div className="text-sm opacity-90">{p.subtitle}</div>}
            </div>
          )}
        </div>
      ))}
      {promotions.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {promotions.map((p, i) => (
            <span key={p.id} className={cx('h-1.5 rounded-full bg-white transition-all', i === index ? 'w-5 opacity-100' : 'w-1.5 opacity-50')} />
          ))}
        </div>
      )}
    </div>
  );
}

const SPOTLIGHT_ACCENT = {
  NEW_PRODUCT: { pill: 'bg-emerald-500 text-white', fallbackBadge: 'ახალი', gradient: 'from-emerald-950/85 via-emerald-950/25' },
  DISCOUNT: { pill: 'bg-rose-500 text-white', fallbackBadge: '%', gradient: 'from-rose-950/85 via-rose-950/25' },
} as const;

/**
 * A single tappable ad "spotlight" tile for the catalog/menu screen — a
 * smaller, grid-friendly sibling of {@link PromoCarousel}. New-product and
 * discount promotions are rendered through separate instances of this
 * component so the two never blend into one strip. Rotates through its own
 * promotions list independently when there's more than one.
 */
export function PromoSpotlight({
  promotions,
  kind,
  intervalMs = 6000,
  onSelect,
  className,
}: {
  promotions: PromotionView[];
  kind: 'NEW_PRODUCT' | 'DISCOUNT';
  intervalMs?: number;
  onSelect?: (promotion: PromotionView) => void;
  className?: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [promotions.length]);

  useEffect(() => {
    if (promotions.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % promotions.length), intervalMs);
    return () => clearInterval(id);
  }, [promotions.length, intervalMs]);

  const p = promotions[index];
  if (!p) return null;
  const accent = SPOTLIGHT_ACCENT[kind];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(p)}
      className={cx('group relative block w-full overflow-hidden rounded-2xl text-left shadow-card transition active:scale-[0.98]', className)}
    >
      <img src={p.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-active:scale-105" />
      <div className={cx('absolute inset-0 bg-gradient-to-t to-transparent', accent.gradient)} />
      <span className={cx('absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide shadow', accent.pill)}>
        {p.badgeText || accent.fallbackBadge}
      </span>
      <div className="relative flex h-full flex-col justify-end p-4 text-white">
        <div className="line-clamp-2 text-lg font-bold leading-tight drop-shadow">{p.title}</div>
        {p.subtitle && <div className="line-clamp-1 text-sm opacity-90 drop-shadow">{p.subtitle}</div>}
      </div>
      {promotions.length > 1 && (
        <div className="absolute bottom-2 right-3 flex gap-1">
          {promotions.map((item, i) => (
            <span key={item.id} className={cx('h-1.5 rounded-full bg-white transition-all', i === index ? 'w-4 opacity-100' : 'w-1.5 opacity-50')} />
          ))}
        </div>
      )}
    </button>
  );
}
