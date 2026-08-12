/**
 * Genuine broker quote service.
 *
 * The ONLY truthful source for live headline prices in the dashboard. Reads
 * MetaApi current-price through the authenticated `metaapi-candles` edge
 * function (action="prices"). Never reads the legacy `live_market_data` table
 * and never substitutes a completed RON candle close for a live quote.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTION_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/metaapi-candles`;

/** Considered live only while this fresh. Beyond it the tile stops calling it live. */
export const QUOTE_FRESH_MS = 90_000;

export interface BrokerQuote {
  symbol: string;
  broker_symbol: string | null;
  bid: number | null;
  ask: number | null;
  /** Broker-supplied quote instant, when MetaApi provides one. */
  broker_time: string | null;
  /** Server timestamp of the fetch — used only when broker_time is absent. */
  fetched_at: string;
  error: string | null;
  /** Direction derived from successive genuine samples only. */
  direction: "up" | "down" | "flat" | null;
}

function quoteInstant(q: BrokerQuote): number {
  return new Date(q.broker_time ?? q.fetched_at).getTime();
}

export function isQuoteFresh(q: BrokerQuote | undefined): boolean {
  if (!q || q.bid == null) return false;
  return Date.now() - quoteInstant(q) < QUOTE_FRESH_MS;
}

async function fetchQuotes(symbols: string[]): Promise<BrokerQuote[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action: "prices", symbols }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Quote error (${res.status})`);
  return Array.isArray(data.quotes) ? data.quotes : [];
}

/**
 * Poll genuine broker quotes for a bounded set of visible symbols.
 * One timer per mounted view; slows right down while the tab is hidden.
 */
export function useLiveQuotes(symbols: string[], intervalMs = 7000) {
  const [quotes, setQuotes] = useState<Map<string, BrokerQuote>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const symbolsKey = [...new Set(symbols)].sort().join(",");
  const prevRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const list = symbolsKey ? symbolsKey.split(",").slice(0, 25) : [];
    if (list.length === 0) {
      setQuotes(new Map());
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const rows = await fetchQuotes(list);
        if (cancelled) return;
        setError(null);
        setQuotes(() => {
          const next = new Map<string, BrokerQuote>();
          for (const r of rows) {
            const prev = prevRef.current.get(r.symbol);
            let direction: BrokerQuote["direction"] = null;
            if (r.bid != null && prev != null) {
              direction = r.bid > prev ? "up" : r.bid < prev ? "down" : "flat";
            }
            if (r.bid != null) prevRef.current.set(r.symbol, r.bid);
            next.set(r.symbol, { ...r, direction });
          }
          return next;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          const delay = document.hidden ? Math.max(intervalMs * 6, 60_000) : intervalMs;
          timer = setTimeout(tick, delay);
        }
      }
    };

    tick();
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [symbolsKey, intervalMs]);

  return { quotes, error };
}
