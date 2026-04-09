/**
 * MetaApi client — calls the metaapi-candles edge function proxy.
 * Keeps the MetaApi token secure on the server side.
 */
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTION_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/metaapi-candles`;

async function callEdge(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Edge function error (${res.status})`);
  }
  return data;
}

/** Provision or retrieve MetaApi account */
export async function provisionAccount(): Promise<{ accountId: string; state: string }> {
  const data = await callEdge({ action: "provision" });
  return { accountId: data.accountId, state: data.state || "DEPLOYED" };
}

/** MetaApi timeframe mapping */
const TF_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
};

export interface MetaApiCandle {
  time: string;       // ISO timestamp from MetaApi
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  spread?: number;
  volume?: number;
}

export interface FormattedCandle {
  time: number;  // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Fetch historical candles from MetaApi via edge function */
export async function fetchCandles(
  accountId: string,
  symbol: string,
  timeframe: string,
  limit = 500,
  lookbackDays = 14
): Promise<FormattedCandle[]> {
  const tf = TF_MAP[timeframe] || "15m";
  const startTime = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const data = await callEdge({
    action: "candles",
    accountId,
    symbol,
    timeframe: tf,
    startTime,
    limit,
  });

  if (!Array.isArray(data.candles)) return [];

  const raw: FormattedCandle[] = data.candles.map((c: MetaApiCandle) => ({
    time: Math.floor(new Date(c.time).getTime() / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.tickVolume ?? c.volume ?? 0,
  }));

  if (raw.length < 3) return raw;

  // Calculate average candle range for anomaly filtering
  const ranges = raw.map(c => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;

  // Filter out anomalous candles (range > 5x average) — likely data errors
  const filtered = raw.filter((c, i) => {
    const range = c.high - c.low;
    if (avgRange > 0 && range > avgRange * 5) return false;
    return true;
  });

  // Detect time gaps and remove candles that create giant bars across gaps
  const tfKey = TF_MAP[timeframe] || "15m";
  const expectedGapSec: Record<string, number> = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400,
  };
  const maxGap = (expectedGapSec[tfKey] || 900) * 3; // allow up to 3x expected gap

  const result: FormattedCandle[] = [filtered[0]];
  for (let i = 1; i < filtered.length; i++) {
    const gap = filtered[i].time - filtered[i - 1].time;
    if (gap > maxGap) {
      // Insert a gap marker by resetting open to match close of gap candle
      // This prevents visual giant bars across weekend/data gaps
      result.push({
        ...filtered[i],
        open: filtered[i].close, // collapse the gap candle
      });
    } else {
      result.push(filtered[i]);
    }
  }

  return result;
}

/** Fetch current price tick */
export async function fetchCurrentPrice(
  accountId: string,
  symbol: string
): Promise<{ bid: number; ask: number; time: string } | null> {
  try {
    const data = await callEdge({ action: "price", accountId, symbol });
    return data.price ?? null;
  } catch {
    return null;
  }
}

/** Fetch available symbols */
export async function fetchSymbols(accountId: string): Promise<string[]> {
  try {
    const data = await callEdge({ action: "symbols", accountId });
    return Array.isArray(data.symbols) ? data.symbols : [];
  } catch {
    return [];
  }
}
