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

// Call metaapi-trade server-to-server (service-role). Returns parsed JSON when possible.
async function callMetaApi(payload: Record<string, unknown>): Promise<{ ok: boolean; json: any; text: string }> {
  const url = `${SUPABASE_URL}/functions/v1/metaapi-trade`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { ok: res.ok, json, text };
}

// Send a PineConnector breakeven / close instruction for a user's configured webhook.
async function sendPineConnector(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  symbol: string,
  kind: "be" | "close",
) {
  const { data: s } = await supabase
    .from("falconer_settings")
    .select("pineconnector_license, pineconnector_webhook_url, pineconnector_symbol_override")
    .eq("user_id", userId)
    .maybeSingle();
  if (!s?.pineconnector_license || !s?.pineconnector_webhook_url) return;
  const brokerSym = (s.pineconnector_symbol_override as Record<string, string> | null)?.[symbol] ?? symbol;
  const msg = kind === "be"
    ? buildPineConnectorBreakeven(s.pineconnector_license as string, brokerSym)
    : buildPineConnectorClose(s.pineconnector_license as string, brokerSym);
  await postWebhook(s.pineconnector_webhook_url as string, msg);
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
  let metaapiPositionId: string | null = null;

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
    // Open the full position with the protective SL and the final TP3. The engine
    // scales out qty1/qty2 via partial-close at TP1/TP2 and moves SL to breakeven below.
    const r = await callMetaApi({
      action: "trade",
      user_id: s.user_id,
      symbol,
      actionType: "ORDER_TYPE_BUY",
      volume: pos.qty,
      stopLoss: pos.sl,
      takeProfit: pos.tp3,
    });
    metaapiPositionId = r.json?.result?.positionId ?? r.json?.result?.orderId ?? null;
    payload = { metaapi: r.json ?? r.text };
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
    filled1: false, filled2: false, filled3: false,
    be_done: false,
    metaapi_position_ids: metaapiPositionId ? { entry: metaapiPositionId } : null,
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
    // Load enough bars to compute Heiken-Ashi for the HA-flip exit.
    const candles = await loadCandles(supabase, t.symbol, t.timeframe, 50);
    if (candles.length < 2) continue;
    const last = candles[candles.length - 1];
    const ha = toHA(candles);
    const haN = ha[ha.length - 1];
    const haPrev = ha[ha.length - 2];

    const entry = Number(t.entry_price);
    const tp1 = Number(t.tp1_price);
    const tp2 = Number(t.tp2_price);
    const tp3 = Number(t.tp3_price);
    const beLevel = Number(t.be_level);
    const isMeta = t.execution_path === "metaapi";
    const isPine = t.execution_path === "pineconnector";
    const posId = (t.metaapi_position_ids as { entry?: string } | null)?.entry ?? null;

    const updates: Record<string, unknown> = {};

    // 1) SL hit first (conservative). Broker auto-closes via the protective stop; we
    //    record it and send a safety-net close.
    if (last.low <= Number(t.sl_price)) {
      updates.status = "closed_sl";
      updates.closed_at = new Date().toISOString();
      if (isMeta && posId) await callMetaApi({ action: "close", user_id: t.user_id, positionId: posId });
      else if (isPine) await sendPineConnector(supabase, t.user_id, t.symbol, "close");
      await supabase.from("falconer_trades").update(updates).eq("id", t.id);
      continue;
    }

    let filled1 = !!t.filled1;
    let filled2 = !!t.filled2;
    let beDone = !!t.be_done;
    let sl = Number(t.sl_price);

    // 2) TP1 partial scale-out (qty1). PineConnector EAs handle partials from the
    //    entry message, so only MetaApi needs an explicit partial close.
    if (!filled1 && last.high >= tp1) {
      filled1 = true;
      if (isMeta && posId) {
        await callMetaApi({ action: "partial-close", user_id: t.user_id, positionId: posId, symbol: t.symbol, volume: Number(t.qty1) });
      }
    }
    // 3) TP2 partial scale-out (qty2)
    if (!filled2 && last.high >= tp2) {
      filled2 = true;
      if (isMeta && posId) {
        await callMetaApi({ action: "partial-close", user_id: t.user_id, positionId: posId, symbol: t.symbol, volume: Number(t.qty2) });
      }
    }
    // 4) Breakeven: move stop to entry once price reaches beLevel
    if (!beDone && last.high >= beLevel) {
      beDone = true;
      sl = entry;
      // Re-assert tp3 so POSITION_MODIFY doesn't clear the take-profit when only SL is sent.
      if (isMeta && posId) await callMetaApi({ action: "modify", user_id: t.user_id, positionId: posId, stopLoss: entry, takeProfit: tp3 });
      else if (isPine) await sendPineConnector(supabase, t.user_id, t.symbol, "be");
    }

    // 5) TP3 hit → final close of any remainder (broker TP also closes it)
    if (last.high >= tp3) {
      updates.status = "closed_tp3";
      updates.closed_at = new Date().toISOString();
      updates.filled1 = true;
      updates.filled2 = true;
      updates.filled3 = true;
      updates.be_done = beDone;
      updates.sl_price = sl;
      if (isMeta && posId) await callMetaApi({ action: "close", user_id: t.user_id, positionId: posId });
      else if (isPine) await sendPineConnector(supabase, t.user_id, t.symbol, "close");
      await supabase.from("falconer_trades").update(updates).eq("id", t.id);
      continue;
    }

    // 6) HA-flip exit (only after breakeven): two consecutive red HA bars
    if (beDone && haN.close < haN.open && haPrev.close < haPrev.open) {
      updates.status = "closed_ha_flip";
      updates.closed_at = new Date().toISOString();
      updates.filled1 = filled1;
      updates.filled2 = filled2;
      updates.be_done = beDone;
      updates.sl_price = sl;
      if (isMeta && posId) await callMetaApi({ action: "close", user_id: t.user_id, positionId: posId });
      else if (isPine) await sendPineConnector(supabase, t.user_id, t.symbol, "close");
      await supabase.from("falconer_trades").update(updates).eq("id", t.id);
      continue;
    }

    // 7) Still open — persist progress
    updates.filled1 = filled1;
    updates.filled2 = filled2;
    updates.be_done = beDone;
    updates.sl_price = sl;
    updates.status = beDone ? "be_active" : (filled2 ? "tp2_hit" : (filled1 ? "tp1_hit" : "open"));
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