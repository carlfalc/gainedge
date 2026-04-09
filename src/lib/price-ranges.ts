/**
 * Hard price range validation for instruments.
 * Used client-side as a safety net. Source of truth is instrument_library table.
 */
export const PRICE_RANGES: Record<string, { min: number; max: number }> = {
  // Commodities
  XAUUSD: { min: 1000, max: 10000 },
  XAGUSD: { min: 10, max: 100 },
  XAUEUR: { min: 1000, max: 10000 },
  WTIUSD: { min: 20, max: 200 },
  BRENTUSD: { min: 20, max: 200 },
  // Indices
  US30: { min: 20000, max: 60000 },
  NAS100: { min: 10000, max: 30000 },
  NDX100: { min: 10000, max: 30000 },
  SPX500: { min: 3000, max: 8000 },
  UK100: { min: 5000, max: 12000 },
  GER40: { min: 10000, max: 25000 },
  JPN225: { min: 20000, max: 50000 },
  AUS200: { min: 5000, max: 10000 },
  // Forex majors
  AUDUSD: { min: 0.40, max: 0.90 },
  NZDUSD: { min: 0.40, max: 0.80 },
  EURUSD: { min: 0.80, max: 1.30 },
  GBPUSD: { min: 1.00, max: 1.60 },
  USDCAD: { min: 1.10, max: 1.50 },
  USDCHF: { min: 0.70, max: 1.10 },
  USDJPY: { min: 100, max: 200 },
  // Forex minors
  EURGBP: { min: 0.70, max: 1.00 },
  EURJPY: { min: 100, max: 200 },
  GBPJPY: { min: 130, max: 220 },
  AUDJPY: { min: 70, max: 120 },
  NZDJPY: { min: 60, max: 110 },
  EURAUD: { min: 1.30, max: 2.00 },
  GBPAUD: { min: 1.60, max: 2.20 },
  EURNZD: { min: 1.50, max: 2.10 },
  GBPNZD: { min: 1.80, max: 2.40 },
  AUDNZD: { min: 1.00, max: 1.20 },
  AUDCAD: { min: 0.80, max: 1.00 },
  CADCHF: { min: 0.60, max: 0.80 },
  CADJPY: { min: 80, max: 130 },
  CHFJPY: { min: 120, max: 190 },
  EURCHF: { min: 0.90, max: 1.20 },
  EURCAD: { min: 1.30, max: 1.60 },
  GBPCAD: { min: 1.50, max: 1.90 },
  GBPCHF: { min: 1.05, max: 1.40 },
  NZDCAD: { min: 0.75, max: 0.95 },
  NZDCHF: { min: 0.50, max: 0.70 },
};

/** Check if a price is valid for the given symbol */
export function isPriceValid(symbol: string, price: number): boolean {
  const range = PRICE_RANGES[symbol];
  if (range) return price >= range.min && price <= range.max;
  return true; // unknown symbol — allow
}

/** Filter candles by hard price range. Falls back to median-based filter for unknown symbols. */
export function filterByPriceRange<T extends { open: number; high: number; low: number; close: number }>(
  candles: T[],
  symbol: string
): T[] {
  const range = PRICE_RANGES[symbol];
  if (range) {
    return candles.filter(c =>
      c.open >= range.min && c.open <= range.max &&
      c.high >= range.min && c.high <= range.max &&
      c.low >= range.min && c.low <= range.max &&
      c.close >= range.min && c.close <= range.max
    );
  }

  // Unknown symbol: use median-based filter
  if (candles.length < 5) return candles;
  const closes = candles.map(c => c.close).sort((a, b) => a - b);
  const median = closes[Math.floor(closes.length / 2)];
  if (!median || median === 0) return candles;
  return candles.filter(c =>
    c.open < median * 2 && c.open > median * 0.5 &&
    c.high < median * 2 && c.high > median * 0.5 &&
    c.low < median * 2 && c.low > median * 0.5 &&
    c.close < median * 2 && c.close > median * 0.5
  );
}
