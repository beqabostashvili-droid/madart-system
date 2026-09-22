import { DEFAULT_LOCALE, type Locale } from './enums';

export interface Translated {
  locale: Locale | string;
  name: string;
  description?: string | null;
}

/** Picks a translation, falling back to the default locale (ASSUMPTION A-18). */
export function pickTranslation<T extends Translated>(translations: readonly T[], locale: Locale): T | undefined {
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === DEFAULT_LOCALE) ??
    translations[0]
  );
}

export function localizedField(
  record: { nameKa: string; nameEn?: string | null; nameRu?: string | null },
  locale: Locale,
): string {
  if (locale === 'en' && record.nameEn) return record.nameEn;
  if (locale === 'ru' && record.nameRu) return record.nameRu;
  return record.nameKa;
}
