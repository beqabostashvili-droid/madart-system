import { describe, expect, it } from 'vitest';
import { businessDateKey, formatOrderNumber, normalizeOrderNumber } from './order-number';

describe('order numbers', () => {
  it('formats with prefix and padding', () => {
    expect(formatOrderNumber(154)).toBe('A154');
    expect(formatOrderNumber(7)).toBe('A007');
    expect(formatOrderNumber(1234)).toBe('A1234');
    expect(formatOrderNumber(3, { prefix: 'S', padding: 2 })).toBe('S03');
    expect(() => formatOrderNumber(0)).toThrow(RangeError);
  });

  it('business day follows the branch time zone', () => {
    // 23:30 UTC on the 21st is 03:30 on the 22nd in Tbilisi (UTC+4)
    expect(businessDateKey(new Date('2026-09-21T23:30:00Z'), 'Asia/Tbilisi')).toBe('2026-09-22');
    expect(businessDateKey(new Date('2026-09-21T23:30:00Z'), 'UTC')).toBe('2026-09-21');
  });

  it('normalises search input', () => {
    expect(normalizeOrderNumber(' a 154 ')).toBe('A154');
  });
});
