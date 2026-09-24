import type { Locale } from '@madart/domain';
import type { PromotionView } from '@madart/types';
import { PromoCarousel } from '@madart/ui';
import { LANGUAGES, t } from '../i18n';

export function WelcomeScreen({
  locale,
  onLocale,
  onStart,
  onPromotion,
  branchName,
  promotions,
}: {
  locale: Locale;
  onLocale: (l: Locale) => void;
  onStart: () => void;
  /** A promotion linked to a product was tapped: open the catalog on that product. */
  onPromotion: (promotion: PromotionView) => void;
  branchName: string;
  promotions: PromotionView[];
}) {
  return (
    <div className="flex h-full flex-col bg-brand text-brand-ink" onClick={onStart}>
      {/* flex-1 + min-h-0 keeps this region from ever pushing into the language row below,
          regardless of viewport height (portrait kiosk vs a shorter browser window). */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 py-6 text-center">
        <div>
          <div className="text-7xl font-extrabold tracking-tight">MADART</div>
          <div className="mt-2 text-xl opacity-80">{branchName}</div>
        </div>
        {promotions.length > 0 && (
          <PromoCarousel
            promotions={promotions}
            onSelect={onPromotion}
            labels={{ NEW_PRODUCT: t(locale, 'promoNew'), DISCOUNT: t(locale, 'promoDiscount'), tap: t(locale, 'promoTap') }}
            className="h-[42vh] max-h-[620px] min-h-44 w-full max-w-[900px] rounded-[2rem] shadow-2xl"
          />
        )}
        <div className="animate-pulse text-3xl font-semibold">{t(locale, 'welcome')}</div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-4 pb-10 pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold uppercase tracking-widest opacity-70">{t(locale, 'chooseLanguage')}</div>
        <div className="flex gap-3">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                onLocale(l.code);
                onStart();
              }}
              className={`flex h-20 w-44 flex-col items-center justify-center rounded-2xl text-lg font-bold shadow-card transition ${locale === l.code ? 'bg-ink text-white' : 'bg-white text-ink'}`}
            >
              <span className="text-2xl">{l.flag}</span>
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
