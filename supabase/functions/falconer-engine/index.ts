import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  asianSessionHigh,
  atr,
  bb,
  buildPineConnectorBreakeven,
  buildPineConnectorClose,
  buildPineConnectorEntry,
  buildPosition,
  type Candle,
  DEFAULT_CONFIG,
  ema,
  evaluateLongTrigger,
  kc,
  previousDayLow,
  type StrategyConfig,
  toHA,
} from "../_shared/falconer-strategy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Settings {
  user_id: string;
  enabled: boolean;
  execution_path: "metaapi" | "pineconnector" | "signal_only";
  symbols: string[];
  timeframe: string;
  risk_usd: number;
  rr_tp1: number; rr_tp2: number; rr_tp3: number;
  be_r: number; pct1: number; pct2: number;
  min_atr_pct: number; max_atr_pct: number;
  pullback_tol: number;
  pineconnector_license: string | null;
  pineconnector_webhook_url: string | null;
  pineconnector_risk: number;
  pineconnector_symbol_override: Record<string, string> | null;
}

function cfgFromSettings(s: Settings): StrategyConfig {
  return {
    ...DEFAULT_CONFIG,
    riskUsd: s.risk_usd,
    rrTp1: s.rr_tp1, rrTp2: s.rr_tp2, rrTp3: s.rr_tp3,
    beR: s.be_r, pct1: s.pct1, pct2: s.pct2,
    minAtrPct: s.min_atr_pct, maxAtrPct: s.max_atr_pct,
    pullbackTol: s.pullback_tol,
  };
}

async function loadCandles(supabase: ReturnType<typeof createClient>, symbol: string, timeframe: string, limit = 500): Promise<Candle[]> {
  const { data, error } = await supabase
    .from("candle_history")
    .select("timestamp, open, high, low, close, volume")
    .eq("symbol", symbol)
    .eq("timeframe", timeframe)
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.reverse().map((row: any) => ({
    time: new Date(row.timestamp).getTime(),
    open: Number(row.open), high: Number(row.high),
    low: Number(row.low), close: Number(row.close),
    volume: Number(row.volume ?? 0),
  }));
}

// Pull the latest candles from MetaApi (via metaapi-candles) and upsert them into
// candle_history so the strategy always evaluates on fresh bars. Returns rows inserted.
// Skips MOCK fallback data (data.fallback === true) so we never pollute history with synthetic candles.
async function refreshCandles(
  supabase: ReturnType<typeof createClient>,
  symbol: string,
  timeframe: string,
  limit = 500,
): Promise<number> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/metaapi-candles`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "candles", symbol, timeframe, limit }),
    });
    if (!res.ok) {
      console.error(`refreshCandles ${symbol}/${timeframe}: http ${res.status}`);
      return 0;
    }
    const data = await res.json().catch(() => null);
    if (!data?.success || data?.fallback || !Array.isArray(data.candles) || data.candles.length === 0) {
      // fallback === true means metaapi-candles returned mock data — do not persist it
      return 0;
    }
    const rows = data.candles
      .map((c: any) => ({
        symbol,
        timeframe,
        timestamp: c.time ?? c.timestamp ?? c.brokerTime ?? null,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Math.round(Number(c.tickVolume ?? c.volume ?? 0)),
      }))
      .filter((r: any) => r.timestamp && Number.isFinite(r.open) && Number.isFinite(r.close));
    if (rows.length === 0) return 0;
    const { data: inserted, error } = await supabase.rpc("bulk_insert_candles", { candles: rows });
    if (error) {
      console.error(`bulk_insert_candles ${symbol}/${timeframe}: ${error.message}`);
      return 0;
    }
    return Number(inserted ?? 0);
  } catch (e) {
    console.error(`refreshCandles ${symbol}/${timeframe} failed: ${(e as Error).message}`);
    return 0;
  }
}

async function postWebhook(url: string, message: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: message,
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message };
  }
}

async function callMetaApiTrade(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const url = `${SUPABASE_URL}/functions/v1/metaapi-trade`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, body: await res.text() };
}

async function processUserSymbol(
  supabase: ReturnType<typeof createClient>,
  s: Settings,
  symbol: string,
): Promise<{ symbol: string; fired: boolean; reason?: string }> {
  const candles = await loadCandles(supabase, symbol, s.timeframe, 500);
  if (candles.length < 50) return { symbol, fired: false, reason: "insufficient_candles" };

  // Skip if an open live position already exists for this user/symbol
  const { data: openRows } = await supabase
    .from("falconer_trades")
    .select("id")
    .eq("user_id", s.user_id)
    .eq("symbol", symbol)
    .eq("mode", "live")
    .in("status", ["open", "tp1_hit", "tp2_hit", "be_active"])
    .limit(1);
  if (openRows && openRows.length > 0) return { symbol, fired: false, reason: "position_open" };

  const cfg = cfgFromSettings(s);
  const closes = candles.map(c => c.close);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const atrArr = atr(candles, 14);
  const bbB = bb(closes, 20, 2);
  const kcB = kc(candles, 20, 1.5);
  const ha = toHA(candles);
  const i = candles.length - 1;

  const atrPct = (atrArr[i] / candles[i].close) * 100;
  if (atrPct < cfg.minAtrPct || atrPct > cfg.maxAtrPct) {
    return { symbol, fired: false, reason: `atr_pct_${atrPct.toFixed(3)}` };
  }

  const squeezeOn = bbB.upper[i] < kcB.upper[i] && bbB.lower[i] > kcB.lower[i];
  const squeezeOnPrev = bbB.upper[i - 1] < kcB.upper[i - 1] && bbB.lower[i - 1] > kcB.lower[i - 1];

  const trig = evaluateLongTrigger({
    i,
    haGreen: ha[i].close > ha[i].open,
    haGreenPrev: ha[i - 1].close > ha[i - 1].open,
    close: candles[i].close, closePrev: candles[i - 1].close, low: candles[i].low,
    ema9: e9[i], ema21: e21[i], ema9Prev: e9[i - 1], ema21Prev: e21[i - 1],
    atrVal: atrArr[i],
    squeezeOn, squeezeOnPrev,
    asianHigh: asianSessionHigh(candles, i, cfg),
    pdl: previousDayLow(candles, i),
    cfg,
  });
  if (!trig.fired || !trig.type) return { symbol, fired: false, reason: "no_trigger" };

  const rawSL = Math.min(candles[i].low, candles[i - 1].low) - 0.25 * atrArr[i];
  const pos = buildPosition(candles[i].close, rawSL, trig.type, candles[i].time, cfg);

  // Route execution
  let executionPath = s.execution_path;
  let payload: Record<string, unknown> = {};

  if (executionPath === "pineconnector") {
    const license = s.pineconnector_license;
    const webhook = s.pineconnector_webhook_url;
    const brokerSymbol = s.pineconnector_symbol_override?.[symbol] ?? symbol;
    if (!license || !webhook) {
      executionPath = "signal_only";
      payload = { error: "missing_pineconnector_config" };
    } else {
      const message = buildPineConnectorEntry(license, brokerSymbol, pos, s.pineconnector_risk, cfg);
      const result = await postWebhook(webhook, message);
      payload = { pineconnector_message: message, webhook_result: result };
    }
  } else if (executionPath === "metaapi") {
    const r = await callMetaApiTrade(supabase, {
      user_id: s.user_id,
      symbol,
      direction: "buy",
      volume: pos.qty,
      sl: pos.sl,
      tp: pos.tp3, // single TP via metaapi bridge; partials managed by engine via subsequent calls
      comment: `v7TP3_${trig.type}`,
    });
    payload = { metaapi: r };
  }

  // Record trade
  await supabase.from("falconer_trades").insert({
    user_id: s.user_id,
    mode: "live",
    execution_path: executionPath,
    symbol,
    timeframe: s.timeframe,
    direction: "long",
    entry_price: pos.entry,
    sl_price: pos.sl,
    tp1_price: pos.tp1,
    tp2_price: pos.tp2,
    tp3_price: pos.tp3,
    be_level: pos.beLevel,
    qty: pos.qty,
    qty1: pos.qty1, qty2: pos.qty2, qty3: pos.qty3,
    trigger_type: trig.type,
    status: "open",
    opened_at: new Date(pos.openedAt).toISOString(),
    raw_alert_payload: payload as Record<string, unknown>,
  });

  return { symbol, fired: true, reason: trig.type };
}

async function manageOpenPositions(supabase: ReturnType<typeof createClient>) {
  const { data: open } = await supabase
    .from("falconer_trades")
    .select("*")
    .eq("mode", "live")
    .in("status", ["open", "tp1_hit", "tp2_hit", "be_active"]);
  if (!open) return;

  for (const t of open as any[]) {
    const candles = await loadCandles(supabase, t.symbol, t.timeframe, 5);
    if (candles.length === 0) continue;
    const last = candles[candles.length - 1];
    const updates: Record<string, unknown> = {};

    // SL hit (whether the SL is the original or moved to breakeven, it closes via stop)
    if (last.low <= Number(t.sl_price)) {
      updates.status = "closed_sl";
      updates.closed_at = new Date().toISOString();
    } else {
      let status = t.status;
      let beDone = t.be_done;
      let sl = Number(t.sl_price);
      if (last.high >= Number(t.tp1_price) && status === "open") status = "tp1_hit";
      if (last.high >= Number(t.tp2_price) && (status === "open" || status === "tp1_hit")) status = "tp2_hit";
      if (!beDone && last.high >= Number(t.be_level)) {
        beDone = true;
        sl = Number(t.entry_price);
        // Notify PineConnector breakeven
        if (t.execution_path === "pineconnector") {
          const { data: s } = await supabase.from("falconer_settings").select("pineconnector_license, pineconnector_webhook_url, pineconnector_symbol_override").eq("user_id", t.user_id).maybeSingle();
          if (s?.pineconnector_license && s?.pineconnector_webhook_url) {
            const brokerSym = (s.pineconnector_symbol_override as Record<string, string> | null)?.[t.symbol] ?? t.symbol;
            await postWebhook(s.pineconnector_webhook_url, buildPineConnectorBreakeven(s.pineconnector_license, brokerSym));
          }
        }
      }
      if (last.high >= Number(t.tp3_price)) {
        updates.status = "closed_tp3";
        updates.closed_at = new Date().toISOString();
      } else {
        updates.status = beDone ? "be_active" : status;
        updates.be_done = beDone;
        updates.sl_price = sl;
      }
    }

    await supabase.from("falconer_trades").update(updates).eq("id", t.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: allSettings } = await supabase
      .from("falconer_settings")
      .select("*")
      .eq("enabled", true);

    // Refresh candle_history with fresh bars BEFORE managing positions or scanning,
    // so both operate on live data. Collect every (symbol, timeframe) pair we care about:
    // every enabled user's configured symbols + any symbol/timeframe with an open trade.
    const pairs = new Map<string, { symbol: string; timeframe: string }>();
    for (const s of (allSettings ?? []) as Settings[]) {
      for (const sym of s.symbols ?? []) {
        pairs.set(`${sym}|${s.timeframe}`, { symbol: sym, timeframe: s.timeframe });
      }
    }
    const { data: openForRefresh } = await supabase
      .from("falconer_trades")
      .select("symbol, timeframe")
      .eq("mode", "live")
      .in("status", ["open", "tp1_hit", "tp2_hit", "be_active"]);
    for (const t of (openForRefresh ?? []) as any[]) {
      pairs.set(`${t.symbol}|${t.timeframe}`, { symbol: t.symbol, timeframe: t.timeframe });
    }
    const refreshed: { symbol: string; timeframe: string; inserted: number }[] = [];
    for (const { symbol, timeframe } of pairs.values()) {
      const inserted = await refreshCandles(supabase, symbol, timeframe);
      refreshed.push({ symbol, timeframe, inserted });
    }

    await manageOpenPositions(supabase);

    if (!allSettings) {
      return new Response(JSON.stringify({ scanned: 0, refreshed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { user_id: string; symbol: string; fired: boolean; reason?: string }[] = [];
    for (const s of allSettings as Settings[]) {
      for (const sym of s.symbols) {
        const r = await processUserSymbol(supabase, s, sym);
        results.push({ user_id: s.user_id, ...r });
      }
    }

    return new Response(JSON.stringify({ scanned: results.length, results, refreshed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});