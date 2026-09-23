import type { Locale } from '@madart/domain';
import type { PromotionView } from '@madart/types';
import { PromoCarousel } from '@madart/ui';
import { LANGUAGES, t } from '../i18n';

export function WelcomeScreen({
  locale,
  onLocale,
  onStart,
  branchName,
  promotions,
}: {
  locale: Locale;
  onLocale: (l: Locale) => void;
  onStart: () => void;
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
        {promotions.length > 0 && <PromoCarousel promotions={promotions} className="h-[28vh] max-h-72 min-h-36 w-full max-w-[680px] rounded-3xl shadow-2xl" />}
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
