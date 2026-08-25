/**
 * Shared canonical → broker symbol variants.
 *
 * Single source of the provider alias knowledge that production `metaapi-candles`
 * already relies on. Consumers try the variants IN ORDER and use the first one the
 * broker actually serves. No synthesis, no guessing: an unknown canonical symbol
 * resolves to itself only.
 */
export const SYMBOL_VARIANTS: Record<string, string[]> = {
  NAS100: ["NDX100", "NAS100", "USTEC", "NAS100.i"],
  US30: ["US30", "DJ30", "US30.i"],
  XAUUSD: ["XAUUSD", "GOLD", "XAUUSD.i"],
  XAGUSD: ["XAGUSD", "SILVER", "XAGUSD.i"],
  SPX500: ["SPX500", "SP500", "SPX500.i"],
  UK100: ["UK100", "FTSE100", "UK100.i"],
  GER40: ["GER40", "DAX40", "DE40", "GER40.i"],
  HK50: ["HK50", "HK50.i"],
  JP225: ["JP225", "JPN225", "JP225.i"],
  AUS200: ["AUS200", "AUS200.i"],
  USOUSD: ["XTIUSD", "USOUSD", "XTIUSD.i", "WTI"],
  UKOUSD: ["XBRUSD", "UKOUSD", "XBRUSD.i", "BRENT"],
  XNGUSD: ["XNGUSD", "NGAS", "XNGUSD.i"],
  XCUUSD: ["XCUUSD", "COPPER", "XCUUSD.i"],
  AUDUSD: ["AUDUSD.i", "AUDUSD"],
  NZDUSD: ["NZDUSD.i", "NZDUSD"],
  EURUSD: ["EURUSD.i", "EURUSD"],
  GBPUSD: ["GBPUSD.i", "GBPUSD"],
  USDJPY: ["USDJPY.i", "USDJPY"],
  USDCAD: ["USDCAD.i", "USDCAD"],
  USDCHF: ["USDCHF.i", "USDCHF"],
  GBPJPY: ["GBPJPY.i", "GBPJPY"],
  EURJPY: ["EURJPY.i", "EURJPY"],
  AUDJPY: ["AUDJPY.i", "AUDJPY"],
  NZDJPY: ["NZDJPY.i", "NZDJPY"],
  EURGBP: ["EURGBP.i", "EURGBP"],
  AUDNZD: ["AUDNZD.i", "AUDNZD"],
  CADCHF: ["CADCHF.i", "CADCHF"],
};

export function brokerVariantsFor(symbol: string): string[] {
  return SYMBOL_VARIANTS[symbol] ?? [symbol];
}
