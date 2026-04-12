/**
 * Pure helper: compute per-session volume analytics from hourly candles.
 */
import type { FormattedCandle } from "@/services/metaapi-client";
import { SESSIONS, formatLocalHour, type SessionDef } from "@/lib/session-colors";

export const HISTORY_PERIOD_OPTIONS = [7, 14, 30] as const;

export interface HourBias {
  hourUtc: number;
  buyCount: number;
  sellCount: number;
  buyPct: number;
  sellPct: number;
  avgVolume: number;
  /** Weighted average minute within the hour (0-59) for precise timing */
  weightedMinute: number;
}

export interface SessionPattern {
  session: SessionDef;
  peakHourUtc: number | null;
  peakAvgVolume: number;
  lowestHourUtc: number | null;
  lowestAvgVolume: number;
  buyPct: number;
  sellPct: number;
  tip: string;
  dataPoints: number;
  /** Per-hour buy/sell direction bias within this session */
  hourlyBias: HourBias[];
  /** Hour with the highest buy percentage */
  bestBuyHourUtc: number | null;
  bestBuyPct: number;
  bestBuyMinute: number;
  /** Hour with the highest sell percentage */
  bestSellHourUtc: number | null;
  bestSellPct: number;
  bestSellMinute: number;
}

export interface InstrumentAnalytics {
  symbol: string;
  sessions: SessionPattern[];
  overallNote: string;
  totalDays: number;
}

function sessionForHour(h: number): SessionDef | null {
  return SESSIONS.find(s => h >= s.startUtcHour && h < s.endUtcHour) ?? null;
}

/**
 * Format a UTC hour + minute as a local time string (e.g. "11:20 AM").
 */
export function formatLocalHourMinute(utcHour: number, minute: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, Math.round(minute)));
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Build analytics for one instrument from hourly candles.
 */
export function buildInstrumentAnalytics(
  symbol: string,
  candles: FormattedCandle[],
  requestedDays: number
): InstrumentAnalytics {
  // Group candles by session and by UTC hour
  const hourBuckets: Record<string, { volumes: number[]; buys: number; sells: number; minutes: number[] }> = {};

  for (const sess of SESSIONS) {
    for (let h = sess.startUtcHour; h < sess.endUtcHour; h++) {
      hourBuckets[`${sess.key}:${h}`] = { volumes: [], buys: 0, sells: 0, minutes: [] };
    }
  }

  for (const c of candles) {
    const d = new Date(c.time * 1000);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const sess = sessionForHour(h);
    if (!sess) continue;
    const key = `${sess.key}:${h}`;
    if (!hourBuckets[key]) continue;
    hourBuckets[key].volumes.push(c.volume);
    hourBuckets[key].minutes.push(m);
    if (c.close > c.open) hourBuckets[key].buys++;
    else if (c.close < c.open) hourBuckets[key].sells++;
  }

  // Compute unique days from candle timestamps
  const daySet = new Set(candles.map(c => new Date(c.time * 1000).toISOString().slice(0, 10)));
  const totalDays = daySet.size || 1;

  const sessionPatterns: SessionPattern[] = SESSIONS.map(sess => {
    let peakHourUtc: number | null = null;
    let peakAvgVolume = 0;
    let lowestHourUtc: number | null = null;
    let lowestAvgVolume = Infinity;
    let totalBuys = 0;
    let totalSells = 0;
    let dataPoints = 0;

    const hourlyBias: HourBias[] = [];

    for (let h = sess.startUtcHour; h < sess.endUtcHour; h++) {
      const b = hourBuckets[`${sess.key}:${h}`];
      if (!b || b.volumes.length === 0) continue;
      dataPoints += b.volumes.length;
      const avg = b.volumes.reduce((a, v) => a + v, 0) / b.volumes.length;
      totalBuys += b.buys;
      totalSells += b.sells;

      if (avg > peakAvgVolume) {
        peakAvgVolume = Math.round(avg);
        peakHourUtc = h;
      }
      if (avg < lowestAvgVolume) {
        lowestAvgVolume = Math.round(avg);
        lowestHourUtc = h;
      }

      // Per-hour direction bias
      const hTotal = b.buys + b.sells || 1;
      const hBuyPct = Math.round((b.buys / hTotal) * 100);
      const hSellPct = 100 - hBuyPct;

      // Weighted average minute within the hour for precise timing
      const weightedMinute = b.minutes.length > 0
        ? b.minutes.reduce((sum, m, i) => sum + m * (b.volumes[i] || 1), 0) / b.minutes.reduce((sum, _, i) => sum + (b.volumes[i] || 1), 0)
        : 30;

      hourlyBias.push({
        hourUtc: h,
        buyCount: b.buys,
        sellCount: b.sells,
        buyPct: hBuyPct,
        sellPct: hSellPct,
        avgVolume: Math.round(avg),
        weightedMinute: Math.round(weightedMinute),
      });
    }

    if (lowestAvgVolume === Infinity) { lowestAvgVolume = 0; lowestHourUtc = null; }

    const total = totalBuys + totalSells || 1;
    const buyPct = Math.round((totalBuys / total) * 100);
    const sellPct = 100 - buyPct;

    // Find best buy hour (highest buyPct) and best sell hour (highest sellPct)
    let bestBuyHourUtc: number | null = null;
    let bestBuyPct = 0;
    let bestBuyMinute = 0;
    let bestSellHourUtc: number | null = null;
    let bestSellPct = 0;
    let bestSellMinute = 0;

    for (const hb of hourlyBias) {
      if (hb.buyPct > bestBuyPct) {
        bestBuyPct = hb.buyPct;
        bestBuyHourUtc = hb.hourUtc;
        bestBuyMinute = hb.weightedMinute;
      }
      if (hb.sellPct > bestSellPct) {
        bestSellPct = hb.sellPct;
        bestSellHourUtc = hb.hourUtc;
        bestSellMinute = hb.weightedMinute;
      }
    }

    // Generate tip
    let tip = "Insufficient data for pattern detection";
    if (dataPoints > 0) {
      if (buyPct > 60) tip = `Strong BUY bias during ${sess.label} — trend-following setups favored`;
      else if (sellPct > 60) tip = `Strong SELL bias during ${sess.label} — reversal/short setups favored`;
      else if (peakHourUtc !== null) {
        const label = peakHourUtc === sess.startUtcHour ? "open" : "mid-session";
        tip = `Volume spike at session ${label} (${formatLocalHour(peakHourUtc)}) often precedes breakout`;
      }
    }

    return {
      session: sess, peakHourUtc, peakAvgVolume, lowestHourUtc, lowestAvgVolume,
      buyPct, sellPct, tip, dataPoints, hourlyBias,
      bestBuyHourUtc, bestBuyPct, bestBuyMinute,
      bestSellHourUtc, bestSellPct, bestSellMinute,
    };
  });

  // Overall note
  const sessionVols = sessionPatterns.map(sp => ({ label: sp.session.label, vol: sp.peakAvgVolume }));
  const maxSess = sessionVols.reduce((a, b) => a.vol > b.vol ? a : b, sessionVols[0]);
  const minSess = sessionVols.reduce((a, b) => a.vol < b.vol ? a : b, sessionVols[0]);
  const ratio = minSess.vol > 0 ? (maxSess.vol / minSess.vol).toFixed(1) : "N/A";
  const overallNote = `${symbol} is most traded during ${maxSess.label} session with ${ratio}x ${minSess.label} volume.`;

  return { symbol, sessions: sessionPatterns, overallNote, totalDays };
}
