/**
 * GAINEDGE_SIGNALS_V1 — read-only data access for the Signals & Opportunities page.
 *
 * Two sources ONLY, never blended:
 *   • Falconer strategy records — `falconer_trades`, always scoped to the signed-in user.
 *   • RON stored decisions — the existing `ron-decision-read` contract via `ron-decisions.ts`.
 *
 * No snapshot read is performed here: `ron_market_snapshots` v7 coverage is not yet
 * sufficient and legacy v6 must never be used as current.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLatestRonDecision, type RonDecisionView } from "@/services/ron-decisions";
import { normaliseTracked, pairKey, type TrackedPair } from "@/lib/ron-decision-explorer";

export interface FalconerRecord {
  id: string;
  symbol: string;
  timeframe: string;
  mode: string;
  direction: string;
  trigger_type: string;
  status: string;
  entry_price: number;
  sl_price: number;
  tp1_price: number;
  tp2_price: number;
  tp3_price: number;
  qty: number | null;
  pnl_usd: number | null;
  commission_usd: number | null;
  swap_usd: number | null;
  opened_at: string;
  closed_at: string | null;
}

const RECORD_COLUMNS =
  "id,symbol,timeframe,mode,direction,trigger_type,status,entry_price,sl_price," +
  "tp1_price,tp2_price,tp3_price,qty,pnl_usd,commission_usd,swap_usd,opened_at,closed_at";

export interface FalconerFeed {
  records: FalconerRecord[];
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  reload: () => void;
}

/**
 * Loads the signed-in user's Falconer records for one stored `mode`.
 * The realtime channel is filtered to `user_id=eq.<uid>` — never the whole table.
 */
export function useFalconerRecords(mode: "live" | "backtest", limit = 200): FalconerFeed {
  const [records, setRecords] = useState<FalconerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const loadedOnce = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSignedIn(false);
        setRecords([]);
        setUserId(null);
        setError(null);
        return;
      }
      setSignedIn(true);
      setUserId(session.user.id);
      const { data, error: qErr } = await supabase
        .from("falconer_trades")
        .select(RECORD_COLUMNS)
        .eq("user_id", session.user.id)
        .eq("mode", mode)
        .order("opened_at", { ascending: false })
        .limit(limit);
      if (qErr) {
        setError(qErr.message || "Could not load Falconer records.");
        return;
      }
      setError(null);
      setRecords((data ?? []) as unknown as FalconerRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Falconer records.");
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [mode, limit]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`signals-falconer-${mode}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "falconer_trades", filter: `user_id=eq.${userId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, mode, load]);

  return { records, loading, error, signedIn, reload: () => { void load(); } };
}

export interface RonOpportunity {
  pair: TrackedPair;
  /** Null when no stored decision exists for this pair — never inferred. */
  view: RonDecisionView | null;
  /** Read-contract hashes, when the endpoint returned them. */
  viewHash?: string;
  specHash?: string;
  error: string | null;
}

export interface RonOpportunityFeed {
  opportunities: RonOpportunity[];
  loading: boolean;
  trackedWarning: string | null;
  reload: () => void;
}

/**
 * Purely technical concurrency ceiling on parallel stored-record reads in one page load.
 * This is NOT a plan/entitlement limit: it exists only to bound simultaneous requests,
 * and is far above any realistic tracked-instrument list.
 */
export const RON_OPPORTUNITY_REQUEST_CONCURRENCY_CEILING = 100;

/**
 * Resolves the user's tracked instrument+timeframe pairs and reads the latest stored
 * RON decision for each. A pair with no stored record stays in the list with
 * `view === null` so the UI can say so honestly.
 *
 * Truthfulness rules: no default/monitored pair is ever substituted. Zero tracked pairs
 * yields an empty list, and a failed tracked read yields a warning with an empty list.
 */
export function useRonOpportunities(): RonOpportunityFeed {
  const [opportunities, setOpportunities] = useState<RonOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackedWarning, setTrackedWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let pairs: TrackedPair[] = [];
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setTrackedWarning("Sign in to read stored RON decisions for your tracked instruments.");
        setOpportunities([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("user_instruments")
        .select("symbol, timeframe")
        .eq("user_id", uid);
      if (error) {
        setTrackedWarning(
          "Could not load your tracked instruments, so no RON opportunities can be shown. "
          + "Nothing is assumed about what you monitor.",
        );
        setOpportunities([]);
        setLoading(false);
        return;
      }
      pairs = normaliseTracked(data ?? []);
      setTrackedWarning(null);
    } catch {
      setTrackedWarning(
        "Could not load your tracked instruments, so no RON opportunities can be shown. "
        + "Nothing is assumed about what you monitor.",
      );
      setOpportunities([]);
      setLoading(false);
      return;
    }

    const selected = pairs.slice(0, RON_OPPORTUNITY_REQUEST_CONCURRENCY_CEILING);

    const results = await Promise.all(selected.map(async (pair): Promise<RonOpportunity> => {
      try {
        const res = await fetchLatestRonDecision({
          instrument: pair.symbol, timeframe: pair.timeframe,
        });
        return {
          pair, view: res?.view ?? null, viewHash: res?.view_hash, specHash: res?.spec_hash, error: null,
        };
      } catch (e) {
        return {
          pair, view: null, error: e instanceof Error ? e.message : "Could not read the stored RON record.",
        };
      }
    }));

    // Deterministic order: records with a stored decision first (newest as_of), then the rest.
    results.sort((a, b) => {
      const at = a.view ? Date.parse(a.view.decision.as_of) : -Infinity;
      const bt = b.view ? Date.parse(b.view.decision.as_of) : -Infinity;
      if (at !== bt) return (Number.isNaN(bt) ? -Infinity : bt) - (Number.isNaN(at) ? -Infinity : at);
      return pairKey(a.pair).localeCompare(pairKey(b.pair));
    });

    setOpportunities(results);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { opportunities, loading, trackedWarning, reload: () => { void load(); } };
}
