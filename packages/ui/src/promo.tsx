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
