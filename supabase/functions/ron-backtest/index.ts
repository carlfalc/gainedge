import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// RON v3 backtest proxy
// Forwards a backtest request to the Render-hosted /backtest endpoint,
// then persists the full result to ron_backtest_runs.
//
// Why proxy? The Render service owns the historical data and the v3 logic
// (DLO + Squeeze + Heikin Ashi + EMA 12/69). Running 70k+ /predict-v3 calls
// from this edge function is not feasible within the 10-min Deno timeout,
// nor stable across the network. The Render service runs the loop in-process.

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RON_ML_URL       = Deno.env.get("RON_ML_URL")     ?? "https://ron-ml.onrender.com";
const RON_ML_API_KEY   = Deno.env.get("RON_ML_API_KEY") ?? "gainedge-ron-2026";

interface BacktestRequest {
  symbol?: string;
  timeframe?: string;
  htf_timeframe?: string;
  start?: string;
  end?: string;
  in_sample_split?: string;
  warmup_bars?: number;
  run_label?: string;
  config?: Record<string, unknown>;
}

const DEFAULT_CONFIG = {
  starting_balance: 10000,
  risk_per_trade_pct: 1.0,
  atr_sl_mult: 1.5,
  atr_tp_mult: 2.5,
  min_tier: "B",
  spread_usd: 0.30,
  max_open_per_symbol: 1,
  max_hold_bars: 96,
  entry_mode: "next_open",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: BacktestRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const symbol        = body.symbol        ?? "XAUUSD";
  const timeframe     = body.timeframe     ?? "15m";
  const htf_timeframe = body.htf_timeframe ?? "1h";
  const now           = new Date();
  const twoYearsAgo   = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  const oneYearAgo    = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const start            = body.start            ?? twoYearsAgo.toISOString();
  const end              = body.end              ?? now.toISOString();
  const in_sample_split  = body.in_sample_split  ?? oneYearAgo.toISOString();
  const warmup_bars      = body.warmup_bars      ?? 400;
  const config           = { ...DEFAULT_CONFIG, ...(body.config ?? {}) };

  // Forward to Render. Long timeout — backtests can take a few minutes.
  const upstreamPayload = {
    symbol, timeframe, htf_timeframe,
    start, end, in_sample_split, warmup_bars, config,
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${RON_ML_URL}/backtest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": RON_ML_API_KEY,
      },
      body: JSON.stringify(upstreamPayload),
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({
      error: "ron-ml unreachable",
      detail: (err as Error).message,
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const upstreamText = await upstream.text();
  if (!upstream.ok) {
    return new Response(JSON.stringify({
      error: "ron-ml /backtest failed",
      status: upstream.status,
      body:   upstreamText.slice(0, 2000),
    }), {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let result: Record<string, unknown>;
  try {
    result = JSON.parse(upstreamText);
  } catch {
    return new Response(JSON.stringify({
      error: "ron-ml returned non-JSON",
      body:  upstreamText.slice(0, 2000),
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Persist run
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: inserted, error: insertErr } = await sb
    .from("ron_backtest_runs")
    .insert({
      run_label:       body.run_label ?? null,
      symbol,
      timeframe,
      htf_timeframe,
      period_start:    start,
      period_end:      end,
      in_sample_split,
      config,
      data_window:     result.data_window     ?? null,
      in_sample:       result.in_sample       ?? null,
      out_of_sample:   result.out_of_sample   ?? null,
      combined:        result.combined        ?? null,
      trades:          result.trades          ?? null,
      equity_curve:    result.equity_curve    ?? null,
      verdict:         result.verdict         ?? null,
      issues:          result.issues          ?? [],
      ron_ml_version:  result.ron_ml_version  ?? null,
    })
    .select("id")
    .single();

  if (insertErr) {
    return new Response(JSON.stringify({
      error: "failed to persist run",
      detail: insertErr.message,
      result, // still return the result so the caller doesn't lose it
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    run_id: inserted?.id,
    verdict: result.verdict ?? null,
    in_sample: result.in_sample ?? null,
    out_of_sample: result.out_of_sample ?? null,
    combined: result.combined ?? null,
    issues: result.issues ?? [],
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});