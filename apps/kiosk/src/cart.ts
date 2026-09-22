import type { CatalogProductView } from '@madart/types';

export interface CartLine {
  key: string;
  product: CatalogProductView;
  quantity: number;
  modifierIds: string[];
  unitPrice: number;
}

export type CartAction =
  | { type: 'add'; product: CatalogProductView; quantity?: number; modifierIds?: string[] }
  | { type: 'setQty'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  | { type: 'clear' };

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const modifierIds = [...(action.modifierIds ?? [])].sort();
      const key = `${action.product.id}:${modifierIds.join(',')}`;
      const delta = action.product.modifierGroups.flatMap((g) => g.modifiers).filter((m) => modifierIds.includes(m.id)).reduce((s, m) => s + m.priceDelta, 0);
      const existing = lines.find((l) => l.key === key);
      if (existing) return lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + (action.quantity ?? 1) } : l));
      return [...lines, { key, product: action.product, quantity: action.quantity ?? 1, modifierIds, unitPrice: action.product.price + delta }];
    }
    case 'setQty':
      return action.quantity <= 0 ? lines.filter((l) => l.key !== action.key) : lines.map((l) => (l.key === action.key ? { ...l, quantity: action.quantity } : l));
    case 'remove':
      return lines.filter((l) => l.key !== action.key);
    case 'clear':
      return [];
  }
}

export const cartTotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
