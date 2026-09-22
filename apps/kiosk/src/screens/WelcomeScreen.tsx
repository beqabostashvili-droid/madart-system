import type { Locale } from '@madart/domain';
import { LANGUAGES, t } from '../i18n';

export function WelcomeScreen({ locale, onLocale, onStart, branchName }: { locale: Locale; onLocale: (l: Locale) => void; onStart: () => void; branchName: string }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-brand text-brand-ink" onClick={onStart}>
      <div className="text-7xl font-extrabold tracking-tight">MADART</div>
      <div className="mt-2 text-xl opacity-80">{branchName}</div>
      <div className="mt-16 animate-pulse text-3xl font-semibold">{t(locale, 'welcome')}</div>
      <div className="absolute bottom-16 flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
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
