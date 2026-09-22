/**
 * Public order numbers: `<prefix><zero-padded counter>` e.g. A154.
 * Counter resets per branch per business day (ASSUMPTION A-06).
 */

export interface OrderNumberFormat {
  prefix: string;
  padding: number;
}

export const DEFAULT_ORDER_NUMBER_FORMAT: OrderNumberFormat = { prefix: 'A', padding: 3 };

export function formatOrderNumber(counter: number, format: OrderNumberFormat = DEFAULT_ORDER_NUMBER_FORMAT): string {
  if (!Number.isInteger(counter) || counter < 1) throw new RangeError('counter must be a positive integer');
  return `${format.prefix}${counter.toString().padStart(format.padding, '0')}`;
}

/**
 * Business-day key (YYYY-MM-DD) for a moment in a branch time zone.
 * Uses Intl so no date library is needed.
 */
export function businessDateKey(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Normalises user input like "a154", " A154 " → "A154" for search. */
export function normalizeOrderNumber(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
