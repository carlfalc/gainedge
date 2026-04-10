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

  return raw;
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
