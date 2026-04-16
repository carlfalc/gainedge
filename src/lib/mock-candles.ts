// Generate realistic mock OHLCV candle data for demo purposes

import type { OHLCData } from "./chart-indicators";

const BASE_PRICES: Record<string, number> = {
  XAUUSD: 4800,
  US30: 48500,
  NAS100: 25800,
  NZDUSD: 0.5950,
  AUDUSD: 0.6350,
  EURUSD: 1.0950,
  GBPUSD: 1.2950,
  USDJPY: 143.50,
  USDCAD: 1.3850,
  USDCHF: 0.8750,
  GBPJPY: 185.80,
  EURJPY: 157.20,
  EURGBP: 0.8460,
  XAGUSD: 33.00,
  BTCUSD: 83000,
  ETHUSD: 1600,
  US500: 5500,
  SPX500: 5500,
};

const VOLATILITY: Record<string, number> = {
  XAUUSD: 12,
  US30: 150,
  NAS100: 100,
  NZDUSD: 0.003,
  AUDUSD: 0.003,
  EURUSD: 0.003,
  GBPUSD: 0.004,
  USDJPY: 0.4,
  USDCAD: 0.003,
  USDCHF: 0.003,
  GBPJPY: 0.6,
  EURJPY: 0.5,
  EURGBP: 0.002,
  XAGUSD: 0.4,
  BTCUSD: 600,
  ETHUSD: 20,
  US500: 30,
  SPX500: 30,
};

// Timeframe in minutes
const TF_MINUTES: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "1H": 60, "4H": 240, "1D": 1440,
};

export function generateMockCandles(
  symbol: string,
  timeframe: string,
  count = 500,
): OHLCData[] {
  const base = BASE_PRICES[symbol] ?? 100;
  const vol = VOLATILITY[symbol] ?? base * 0.003;
  const tfMinutes = TF_MINUTES[timeframe] ?? 15;
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = tfMinutes * 60;
  const startTime = now - count * intervalSeconds;

  let price = base + (Math.random() - 0.5) * vol * 10;
  const candles: OHLCData[] = [];
  // Add a gentle trend
  const trendBias = (Math.random() - 0.45) * 0.001;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalSeconds;
    const range = vol * (0.5 + Math.random());
    const direction = Math.random() + trendBias;
    const open = price;
    let close: number;
    if (direction > 0.5) {
      close = open + Math.random() * range;
    } else {
      close = open - Math.random() * range;
    }
    const high = Math.max(open, close) + Math.random() * range * 0.5;
    const low = Math.min(open, close) - Math.random() * range * 0.5;
    const volume = Math.round(1000 + Math.random() * 9000);

    candles.push({
      time,
      open: +open.toFixed(symbol.includes("JPY") ? 3 : 5),
      high: +high.toFixed(symbol.includes("JPY") ? 3 : 5),
      low: +low.toFixed(symbol.includes("JPY") ? 3 : 5),
      close: +close.toFixed(symbol.includes("JPY") ? 3 : 5),
      volume,
    });
    price = close;
  }
  return candles;
}
