import { describe, expect, it } from 'vitest';
import { isAvailableForSource, resolveProductForBranch } from './resolve';

const product = { active: true, availableKiosk: true, availablePos: true, availableMobile: false, basePrice: 1200 };

describe('resolveProductForBranch (A-12)', () => {
  it('uses product values without an override', () => {
    const r = resolveProductForBranch(product, null);
    expect(r).toEqual({ price: 1200, available: true, availableKiosk: true, availablePos: true, availableMobile: false });
  });
  it('branch override wins', () => {
    const r = resolveProductForBranch(product, {
      available: true,
      priceOverride: 1100,
      availableKiosk: false,
      availablePos: null,
      availableMobile: true,
    });
    expect(r.price).toBe(1100);
    expect(r.availableKiosk).toBe(false);
    expect(r.availablePos).toBe(true);
    expect(r.availableMobile).toBe(true);
    expect(isAvailableForSource(r, 'KIOSK')).toBe(false);
    expect(isAvailableForSource(r, 'MOBILE')).toBe(true);
  });
  it('inactive product is unavailable everywhere', () => {
    const r = resolveProductForBranch({ ...product, active: false }, null);
    expect(r.availableKiosk).toBe(false);
    expect(isAvailableForSource(r, 'POS')).toBe(false);
  });
});
