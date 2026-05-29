import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  type Candle,
  DEFAULT_CONFIG,
  runBacktest,
  type StrategyConfig,
} from "../_shared/falconer-strategy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Req {
  user_id: string;
  symbol: string;
  timeframe?: string;
  period_start: string; // ISO
  period_end: string;   // ISO
  config?: Partial<StrategyConfig>;
  initial_equity?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Req;
    if (!body.user_id || !body.symbol || !body.period_start || !body.period_end) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const timeframe = body.timeframe ?? "15m";
    const cfg = { ...DEFAULT_CONFIG, ...(body.config ?? {}) };
    const equity0 = body.initial_equity ?? 10_000;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Create run row
    const { data: runRow, error: runErr } = await supabase
      .from("falconer_backtest_runs")
      .insert({
        user_id: body.user_id,
        symbol: body.symbol,
        timeframe,
        period_start: body.period_start,
        period_end: body.period_end,
        config: cfg as unknown as Record<string, unknown>,
        status: "running",
      })
      .select()
      .single();
    if (runErr || !runRow) {
      return new Response(JSON.stringify({ error: runErr?.message ?? "run insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load candles (paginate past 1000-row limit)
    const candles: Candle[] = [];
    let cursor = body.period_start;
    while (true) {
      const { data, error } = await supabase
        .from("candle_history")
        .select("timestamp, open, high, low, close, volume")
        .eq("symbol", body.symbol)
        .eq("timeframe", timeframe)
        .gte("timestamp", cursor)
        .lte("timestamp", body.period_end)
        .order("timestamp", { ascending: true })
        .limit(1000);
      if (error) {
        await supabase.from("falconer_backtest_runs").update({
          status: "error", error_message: error.message, completed_at: new Date().toISOString(),
        }).eq("id", runRow.id);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!data || data.length === 0) break;
      for (const row of data) {
        candles.push({
          time: new Date(row.timestamp as string).getTime(),
          open: Number(row.open), high: Number(row.high),
          low: Number(row.low), close: Number(row.close),
          volume: Number(row.volume ?? 0),
        });
      }
      if (data.length < 1000) break;
      cursor = data[data.length - 1].timestamp as string;
      // advance 1ms so we don't re-read the boundary row
      cursor = new Date(new Date(cursor).getTime() + 1).toISOString();
    }

    if (candles.length < 50) {
      await supabase.from("falconer_backtest_runs").update({
        status: "error",
        error_message: `Insufficient candles (${candles.length}). Backfill required.`,
        completed_at: new Date().toISOString(),
      }).eq("id", runRow.id);
      return new Response(JSON.stringify({
        error: "insufficient_data", candle_count: candles.length,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = runBacktest(candles, cfg, equity0);

    // Persist run summary + sample of equity curve (every Nth point to keep payload small)
    const stride = Math.max(1, Math.floor(result.equityCurve.length / 500));
    const sampledCurve = result.equityCurve.filter((_, i) => i % stride === 0);

    await supabase.from("falconer_backtest_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_trades: result.trades.length,
      wins: result.wins,
      losses: result.losses,
      win_rate: result.winRate,
      profit_factor: result.profitFactor,
      net_pnl_usd: result.netPnlUsd,
      net_pnl_pct: result.netPnlPct,
      max_drawdown_pct: result.maxDrawdownPct,
      equity_curve: sampledCurve as unknown as Record<string, unknown>,
    }).eq("id", runRow.id);

    // Persist individual trades (mode = backtest)
    if (result.trades.length > 0) {
      const rows = result.trades.map((t) => ({
        user_id: body.user_id,
        backtest_run_id: runRow.id,
        mode: "backtest",
        execution_path: "signal_only",
        symbol: body.symbol,
        timeframe,
        direction: "long",
        entry_price: t.entry,
        sl_price: t.sl,
        tp1_price: t.tp1,
        tp2_price: t.tp2,
        tp3_price: t.tp3,
        be_level: t.entry,
        qty: 0, qty1: 0, qty2: 0, qty3: 0,
        trigger_type: t.trigger,
        status: t.exitReason,
        pnl_usd: t.pnlUsd,
        opened_at: new Date(t.openedAt).toISOString(),
        closed_at: new Date(t.closedAt).toISOString(),
      }));
      // Chunk inserts to stay under request limits
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        await supabase.from("falconer_trades").insert(rows.slice(i, i + chunk));
      }
    }

    return new Response(JSON.stringify({
      run_id: runRow.id,
      candle_count: candles.length,
      ...result,
      equityCurve: sampledCurve,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});