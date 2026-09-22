import type { OrderSource } from '../enums';

export interface ProductChannelFlags {
  active: boolean;
  availableKiosk: boolean;
  availablePos: boolean;
  availableMobile: boolean;
  basePrice: number;
}

export interface ProductBranchOverride {
  available: boolean;
  priceOverride: number | null;
  availableKiosk: boolean | null;
  availablePos: boolean | null;
  availableMobile: boolean | null;
}

/** ASSUMPTION A-12 – branch overrides win when present, otherwise product flags. */
export function resolveProductForBranch(product: ProductChannelFlags, branch: ProductBranchOverride | null | undefined) {
  const price = branch?.priceOverride ?? product.basePrice;
  const available = product.active && (branch ? branch.available : true);
  return {
    price,
    available,
    availableKiosk: available && (branch?.availableKiosk ?? product.availableKiosk),
    availablePos: available && (branch?.availablePos ?? product.availablePos),
    availableMobile: available && (branch?.availableMobile ?? product.availableMobile),
  };
}

export function isAvailableForSource(
  resolved: ReturnType<typeof resolveProductForBranch>,
  source: OrderSource,
): boolean {
  switch (source) {
    case 'KIOSK':
      return resolved.availableKiosk;
    case 'POS':
      return resolved.availablePos;
    case 'MOBILE':
      return resolved.availableMobile;
    default:
      return resolved.available;
  }
}
