/** Money is always integer tetri (1 GEL = 100 tetri). ASSUMPTION A-11. */

export type Tetri = number;

export function assertTetri(value: number, label = 'amount'): Tetri {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer amount in tetri, got ${value}`);
  }
  return value;
}

export function formatGel(tetri: Tetri, options: { symbol?: boolean } = {}): string {
  const sign = tetri < 0 ? '-' : '';
  const abs = Math.abs(tetri);
  const lari = Math.floor(abs / 100);
  const rest = (abs % 100).toString().padStart(2, '0');
  const text = `${sign}${lari}.${rest}`;
  return options.symbol === false ? text : `${text} ₾`;
}

export function lineTotal(unitPrice: Tetri, quantity: number, modifierDelta: Tetri = 0): Tetri {
  return (unitPrice + modifierDelta) * quantity;
}
