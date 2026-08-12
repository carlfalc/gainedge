import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  asianLockedSeries,
  atr,
  bb,
  buildPineConnectorBreakeven,
  buildPineConnectorClose,
  buildPineConnectorEntry,
  buildPosition,
  type Candle,
  computeDailySeries,
  dailyContextFor,
  DEFAULT_CONFIG,
  ema,
  evaluateLongTrigger,
  squeezeSeries,
  type StrategyConfig,
  toHA,
} from "../_shared/falconer-strategy.ts";
import { analyseBullishPatterns } from "../_shared/pattern-analysis.ts";

// How many daily bars to fetch/keep so the strategy can warm a 200-period daily EMA.
const DAILY_LOOKBACK = 320;

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
  allow_live_execution: boolean;
  max_daily_loss_usd: number;
  max_open_positions: number;
  min_setup_score: number;
  last_evaluated_candles: Record<string, string> | null;
}

const TIMEFRAME_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

function timeframeMs(timeframe: string): number {
  return TIMEFRAME_MS[timeframe] ?? TIMEFRAME_MS["15m"];
}

function setupScore(input: {
  trigger: string;
  atrPct: number;
  minAtr: number;
  maxAtr: number;
  close: number;
  ema21: number;
  emaD50: number;
  emaD200: number;
  patternBoost: number;
}): number {
  let score = 55;
  if (input.trigger === "swPDL" || input.trigger === "swAL") score += 8;
  if (input.trigger === "sqzUp") score += 6;
  if (input.close > input.ema21) score += 7;
  if (input.close > input.emaD50) score += 8;
  if (input.close > input.emaD200) score += 8;
  score += input.patternBoost;
  const middle = (input.minAtr + input.maxAtr) / 2;
  const halfRange = Math.max((input.maxAtr - input.minAtr) / 2, 0.0001);
  score += Math.max(0, 8 - Math.round(Math.abs(input.atrPct - middle) / halfRange * 8));
  return Math.max(0, Math.min(100, score));
}

async function logEvent(
  supabase: ReturnType<typeof createClient>,
  event: {
    user_id?: string;
    symbol?: string;
    event_type: string;
    severity?: "info" | "warning" | "error" | "critical";
    message: string;
    context?: Record<string, unknown>;
  },
) {
  await supabase.from("falconer_engine_events").insert({
    ...event,
    severity: event.severity ?? "info",
    context: event.context ?? {},
  });
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
  userId: string,
  symbol: string,
  timeframe: string,
  limit = 500,
  startTime?: string,
): Promise<number> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/metaapi-candles`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "candles", user_id: userId, symbol, timeframe, limit, startTime }),
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
      .filter((r: any) => r.timestamp && Number.isFinite(r.open) && Number.isFinite(r.close))
      // INGESTION GUARD (Phase 2C.1): only genuinely CLOSED bars may be persisted.
      // Writing the still-forming bar produced `premature_bar_persisted` artifacts whose
      // OHLC is a partial-period snapshot; those rows then contaminated RON feature windows.
      .filter((r: any) => {
        const barMs = TF_MS_GUARD[timeframe];
        if (!barMs) return true;
        return new Date(r.timestamp).getTime() + barMs <= Date.now();
      });
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

async function sendSignalEmail(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tradeId: string,
  data: {
    symbol: string;
    score: number;
    entry: number;
    sl: number;
    tp3: number;
    executionPath: string;
  },
) {
  const { data: profile } = await supabase.from("profiles")
    .select("email_alerts")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.email_alerts) return;
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (!email) return;
  await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      templateName: "signal-alert",
      recipientEmail: email,
      idempotencyKey: `falconer-entry-${tradeId}`,
      templateData: {
        symbol: data.symbol,
        direction: "BUY",
        confidence: Number((data.score / 10).toFixed(1)),
        entry_price: data.entry,
        take_profit: data.tp3,
        stop_loss: data.sl,
        risk_reward: "1:5",
        type: data.executionPath === "signal_only" ? "signal" : "live_trade",
      },
    }),
  });
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

// UTC trading-session bucket (approx) used as a RON feature.
function sessionFromHour(h: number): string {
  if (h >= 0 && h < 7) return "asian";
  if (h >= 7 && h < 12) return "london";
  if (h >= 12 && h < 16) return "overlap";
  if (h >= 16 && h < 21) return "ny";
  return "off";
}

async function processUserSymbol(
  supabase: ReturnType<typeof createClient>,
  s: Settings,
  symbol: string,
): Promise<{ symbol: string; fired: boolean; reason?: string }> {
  const allCandles = await loadCandles(supabase, symbol, s.timeframe, 500);
  const interval = timeframeMs(s.timeframe);
  const candles = allCandles.filter(c => c.time + interval <= Date.now());
  if (candles.length < 50) return { symbol, fired: false, reason: "insufficient_candles" };
  const latestClosed = candles[candles.length - 1];
  if (Date.now() - (latestClosed.time + interval) > interval * 2) {
    await logEvent(supabase, {
      user_id: s.user_id,
      symbol,
      event_type: "stale_market_data",
      severity: "warning",
      message: `${symbol} was not scanned because its latest completed candle is stale.`,
      context: { candle: new Date(latestClosed.time).toISOString(), timeframe: s.timeframe },
    });
    return { symbol, fired: false, reason: "stale_market_data" };
  }

  const evaluationKey = `${symbol}|${s.timeframe}`;
  const candleIso = new Date(candles[candles.length - 1].time).toISOString();
  if (s.last_evaluated_candles?.[evaluationKey] === candleIso) {
    return { symbol, fired: false, reason: "already_evaluated" };
  }
  const evaluated = { ...(s.last_evaluated_candles ?? {}), [evaluationKey]: candleIso };
  await supabase.from("falconer_settings")
    .update({ last_evaluated_candles: evaluated })
    .eq("user_id", s.user_id);
  s.last_evaluated_candles = evaluated;

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

  // Daily higher-timeframe context (EMA50/EMA200 trend + previous-day low). The Pine
  // strategy's trend filter lives on the DAILY chart, so the engine loads a dedicated
  // ~320-bar daily series — the 15m window is far too short to warm a daily EMA200.
  // Prefer broker-session daily bars resampled from genuine 1h candles
  // (source = metaapi_resampled_1h, stored as timeframe "1d_r1h"). The native
  // MetaApi 1D feed is sparse and cannot warm EMA200. Falls back to "1d".
  let dailyCandles = await loadCandles(supabase, symbol, "1d_r1h", DAILY_LOOKBACK);
  if (dailyCandles.length < 250) {
    dailyCandles = await loadCandles(supabase, symbol, "1d", DAILY_LOOKBACK);
  }
  if (dailyCandles.length < 250) {
    await logEvent(supabase, {
      user_id: s.user_id,
      symbol,
      event_type: "backfill_required",
      severity: "warning",
      message: `${symbol} requires at least 250 daily candles before Falconer can scan it.`,
      context: { daily_candles: dailyCandles.length, required: 250 },
    });
    return { symbol, fired: false, reason: "insufficient_daily_candles" };
  }
  const dailySeries = computeDailySeries(dailyCandles);

  const cfg = cfgFromSettings(s);
  const closes = candles.map(c => c.close);
  const e21 = ema(closes, 21);
  const atrArr = atr(candles, 14);
  const bbB = bb(closes, 20, 2);
  const sqz = squeezeSeries(candles, 20, 2, 1.5);
  const ha = toHA(candles);
  const asian = asianLockedSeries(candles, cfg);
  const i = candles.length - 1;

  const atrPct = (atrArr[i] / candles[i].close) * 100;
  if (atrPct < cfg.minAtrPct || atrPct > cfg.maxAtrPct) {
    return { symbol, fired: false, reason: `atr_pct_${atrPct.toFixed(3)}` };
  }

  const dctx = dailyContextFor(dailySeries, candles[i].time, candles[i - 1].time, candles[i].close, candles[i - 1].close);
  if (!dctx) return { symbol, fired: false, reason: "no_daily_context" };

  const trig = evaluateLongTrigger({
    haGreen: ha[i].close > ha[i].open,
    haGreenPrev: ha[i - 1].close > ha[i - 1].open,
    haRedPrev: ha[i - 1].close < ha[i - 1].open,
    close: candles[i].close, closePrev: candles[i - 1].close,
    low: candles[i].low, lowPrev: candles[i - 1].low,
    ema21: e21[i],
    atrPct,
    upBBPrev: bbB.upper[i - 1],
    sqzReleased: (sqz[i - 2] ?? false) && !sqz[i],
    emaD50: dctx.emaD50, emaD50Prev: dctx.emaD50Prev, emaD200: dctx.emaD200,
    pdl: dctx.pdl,
    lockedLo: asian.lockedLo[i],
    cfg,
  });
  if (!trig.fired || !trig.type) return { symbol, fired: false, reason: "no_trigger" };

  const rawSL = Math.min(candles[i].low, candles[i - 1].low) - 0.25 * atrArr[i];
  const pos = buildPosition(candles[i].close, rawSL, trig.type, candles[i].time, cfg);
  const patternEvidence = analyseBullishPatterns(candles);
  const score = setupScore({
    trigger: trig.type,
    atrPct,
    minAtr: cfg.minAtrPct,
    maxAtr: cfg.maxAtrPct,
    close: candles[i].close,
    ema21: e21[i],
    emaD50: dctx.emaD50,
    emaD200: dctx.emaD200,
    patternBoost: patternEvidence.scoreBoost,
  });
  const notifyUser = score >= Number(s.min_setup_score ?? 70);
  if (!notifyUser) {
    await logEvent(supabase, {
      user_id: s.user_id,
      symbol,
      event_type: "setup_filtered",
      message: `${symbol} ${trig.type} scored ${score}/100 and was below the notification threshold.`,
      context: { score, threshold: s.min_setup_score, candle: candleIso },
    });
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: todayClosed } = await supabase
    .from("falconer_trades")
    .select("pnl_usd")
    .eq("user_id", s.user_id)
    .eq("mode", "live")
    .gte("closed_at", dayStart.toISOString());
  const dailyPnl = (todayClosed ?? []).reduce((sum: number, row: any) => sum + Number(row.pnl_usd ?? 0), 0);
  const { count: openCount } = await supabase
    .from("falconer_trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", s.user_id)
    .eq("mode", "live")
    .in("status", ["open", "tp1_hit", "tp2_hit", "be_active"]);

  // Route execution
  let executionPath = s.execution_path;
  let payload: Record<string, unknown> = {};
  let metaapiPositionIds: Record<string, string> = {};

  if (executionPath !== "signal_only" && dailyPnl <= -Math.abs(Number(s.max_daily_loss_usd ?? 500))) {
    executionPath = "signal_only";
    payload.risk_gate = "daily_loss_limit";
  }
  if (executionPath !== "signal_only" && Number(openCount ?? 0) >= Number(s.max_open_positions ?? 3)) {
    executionPath = "signal_only";
    payload.risk_gate = "max_open_positions";
  }
  if (executionPath === "metaapi" && !s.allow_live_execution) {
    executionPath = "signal_only";
    payload.risk_gate = "live_execution_not_confirmed";
  }

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
      if (!result.ok) {
        executionPath = "signal_only";
        payload.execution_error = "pineconnector_webhook_failed";
      }
    }
  } else if (executionPath === "metaapi") {
    // Three independent broker positions exactly mirror the 33/33/34 Pine legs.
    // This lets each take-profit rest at the broker instead of relying on a later
    // partial-close request after price has already crossed the target.
    const legs = [
      { key: "tp1", volume: pos.lots * (cfg.pct1 / 100), takeProfit: pos.tp1 },
      { key: "tp2", volume: pos.lots * (cfg.pct2 / 100), takeProfit: pos.tp2 },
      { key: "tp3", volume: pos.lots * ((100 - cfg.pct1 - cfg.pct2) / 100), takeProfit: pos.tp3 },
    ];
    const results: Record<string, unknown> = {};
    let failed = false;
    for (const leg of legs) {
      const result = await callMetaApi({
        action: "trade",
        user_id: s.user_id,
        symbol,
        actionType: "ORDER_TYPE_BUY",
        volume: leg.volume,
        stopLoss: pos.sl,
        takeProfit: leg.takeProfit,
        clientId: `falconer-${s.user_id}-${symbol}-${candles[i].time}-${leg.key}`,
      });
      const positionId = result.json?.result?.positionId ?? result.json?.result?.orderId ?? null;
      results[leg.key] = result.json ?? result.text;
      if (!result.ok || !positionId) {
        failed = true;
        break;
      }
      metaapiPositionIds[leg.key] = positionId;
    }
    payload = { metaapi_legs: results };
    if (failed || Object.keys(metaapiPositionIds).length !== 3) {
      // Compensating close prevents a partially-created three-leg strategy from
      // remaining live when a later leg is rejected.
      for (const positionId of Object.values(metaapiPositionIds)) {
        await callMetaApi({ action: "close", user_id: s.user_id, positionId });
      }
      executionPath = "signal_only";
      metaapiPositionIds = {};
      payload.execution_error = "metaapi_entry_not_confirmed";
    }
  }

  // Capture entry-time market features for RON model training (see migration
  // 20260530110000). These are Falconer-native features available at the signal bar.
  const entryBar = candles[i];
  const entryHour = new Date(entryBar.time).getUTCHours();
  const featureSet = {
    trigger_type: trig.type,
    symbol,
    timeframe: s.timeframe,
    hour_utc: entryHour,
    day_of_week: new Date(entryBar.time).getUTCDay(),
    session: sessionFromHour(entryHour),
    atr_pct: Number(atrPct.toFixed(4)),
    ema21_spread_pct: Number((((entryBar.close - e21[i]) / entryBar.close) * 100).toFixed(4)),
    daily_trend_up: dctx.emaD50 > dctx.emaD50Prev ? 1 : 0,
    above_d50: entryBar.close > dctx.emaD50 ? 1 : 0,
    above_d200: entryBar.close > dctx.emaD200 ? 1 : 0,
    squeeze_on: sqz[i] ? 1 : 0,
    ha_green: ha[i].close > ha[i].open ? 1 : 0,
    ha_green_prev: ha[i - 1].close > ha[i - 1].open ? 1 : 0,
    rr_tp3: cfg.rrTp3,
    risk_usd: cfg.riskUsd,
    entry: pos.entry,
    sl: pos.sl,
    patterns: patternEvidence.names,
  };

  // Record trade
  const { data: tradeRow, error: tradeError } = await supabase.from("falconer_trades").insert({
    user_id: s.user_id,
    mode: "live",
    execution_path: executionPath,
    symbol,
    timeframe: s.timeframe,
    direction: "long",
    features: featureSet,
    setup_score: score,
    notify_user: notifyUser,
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
    metaapi_position_ids: Object.keys(metaapiPositionIds).length ? metaapiPositionIds : null,
    opened_at: new Date(pos.openedAt).toISOString(),
    raw_alert_payload: payload as Record<string, unknown>,
  }).select("id").single();
  if (tradeError || !tradeRow) {
    await logEvent(supabase, {
      user_id: s.user_id,
      symbol,
      event_type: "trade_record_failed",
      severity: "error",
      message: tradeError?.message ?? "Falconer could not persist the trade record.",
    });
    return { symbol, fired: false, reason: "trade_record_failed" };
  }

  if (notifyUser) {
    await sendSignalEmail(supabase, s.user_id, tradeRow.id, {
      symbol,
      score,
      entry: pos.entry,
      sl: pos.sl,
      tp3: pos.tp3,
      executionPath,
    });
  }

  await logEvent(supabase, {
    user_id: s.user_id,
    symbol,
    event_type: "signal_created",
    message: `${symbol} ${trig.type} qualified at ${score}/100 via ${executionPath}.`,
    context: { score, execution_path: executionPath, entry: pos.entry, sl: pos.sl, tp3: pos.tp3 },
  });
  return { symbol, fired: true, reason: `${trig.type}:${score}` };
}

function estimatedPnl(t: any, exitPrice: number, filled1: boolean, filled2: boolean): number {
  const entry = Number(t.entry_price);
  // Pine unit definition: P&L = (exit - entry) * contracts * dpu. Deriving the value per
  // contract from riskUsd/(risk*qty) diverges whenever Pine's math.max(qty, 1.0) floor bites,
  // so use dpu directly (DEFAULT_CONFIG.dollarPerUnit = 1.0, matching the canonical script).
  const dpu = Number(t.features?.dpu ?? DEFAULT_CONFIG.dollarPerUnit ?? 1);
  const q1 = Number(t.qty1);
  const q2 = Number(t.qty2);
  const q3 = Number(t.qty3);
  const realised1 = filled1 ? (Number(t.tp1_price) - entry) * q1 * dpu : 0;
  const realised2 = filled2 ? (Number(t.tp2_price) - entry) * q2 * dpu : 0;
  const remaining = (filled1 ? 0 : q1) + (filled2 ? 0 : q2) + q3;
  const gross = realised1 + realised2 + (exitPrice - entry) * remaining * dpu;
  return Number((gross - Number(t.commission_usd ?? 0) - Number(t.swap_usd ?? 0)).toFixed(2));
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
    const ids = (t.metaapi_position_ids as { tp1?: string; tp2?: string; tp3?: string } | null) ?? {};
    const closeIds = async (positionIds: Array<string | undefined>) => {
      for (const positionId of positionIds.filter((id): id is string => !!id)) {
        await callMetaApi({ action: "close", user_id: t.user_id, positionId });
      }
    };

    const updates: Record<string, unknown> = {};

    // 1) SL hit first (conservative). Broker auto-closes via the protective stop; we
    //    record it and send a safety-net close.
    if (last.low <= Number(t.sl_price)) {
      updates.status = "closed_sl";
      updates.exit_price = Number(t.sl_price);
      updates.pnl_usd = estimatedPnl(t, Number(t.sl_price), !!t.filled1, !!t.filled2);
      updates.closed_at = new Date().toISOString();
      if (isMeta) await closeIds([ids.tp1, ids.tp2, ids.tp3]);
      else if (isPine) await sendPineConnector(supabase, t.user_id, t.symbol, "close");
      await supabase.from("falconer_trades").update(updates).eq("id", t.id);
      continue;
    }

    let filled1 = !!t.filled1;
    let filled2 = !!t.filled2;
    let beDone = !!t.be_done;
    let sl = Number(t.sl_price);

    // 2) TP1/TP2 progress. MetaApi legs already carry their own resting take-profits.
    if (!filled1 && last.high >= tp1) {
      filled1 = true;
    }
    // 3) TP2 partial scale-out (qty2)
    if (!filled2 && last.high >= tp2) {
      filled2 = true;
    }
    // 4) Breakeven: move stop to entry once price reaches beLevel
    if (!beDone && last.high >= beLevel) {
      beDone = true;
      sl = entry;
      if (isMeta) {
        if (!filled1 && ids.tp1) {
          await callMetaApi({ action: "modify", user_id: t.user_id, positionId: ids.tp1, stopLoss: entry, takeProfit: tp1 });
        }
        if (!filled2 && ids.tp2) {
          await callMetaApi({ action: "modify", user_id: t.user_id, positionId: ids.tp2, stopLoss: entry, takeProfit: tp2 });
        }
        if (ids.tp3) {
          await callMetaApi({ action: "modify", user_id: t.user_id, positionId: ids.tp3, stopLoss: entry, takeProfit: tp3 });
        }
      }
      else if (isPine) await sendPineConnector(supabase, t.user_id, t.symbol, "be");
    }

    // 5) TP3 hit → final close of any remainder (broker TP also closes it)
    if (last.high >= tp3) {
      updates.status = "closed_tp3";
      updates.exit_price = tp3;
      updates.pnl_usd = estimatedPnl(t, tp3, true, true);
      updates.closed_at = new Date().toISOString();
      updates.filled1 = true;
      updates.filled2 = true;
      updates.filled3 = true;
      updates.be_done = beDone;
      updates.sl_price = sl;
      if (isMeta) await closeIds([ids.tp1, ids.tp2, ids.tp3]);
      else if (isPine) await sendPineConnector(supabase, t.user_id, t.symbol, "close");
      await supabase.from("falconer_trades").update(updates).eq("id", t.id);
      continue;
    }

    // 6) HA-flip exit (only after breakeven): two consecutive red HA bars
    if (beDone && haN.close < haN.open && haPrev.close < haPrev.open) {
      updates.status = "closed_ha_flip";
      updates.exit_price = last.close;
      updates.pnl_usd = estimatedPnl(t, last.close, filled1, filled2);
      updates.closed_at = new Date().toISOString();
      updates.filled1 = filled1;
      updates.filled2 = filled2;
      updates.be_done = beDone;
      updates.sl_price = sl;
      if (isMeta) await closeIds([
        filled1 ? undefined : ids.tp1,
        filled2 ? undefined : ids.tp2,
        ids.tp3,
      ]);
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

async function reconcileRecentBrokerTrades(supabase: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { data: rows } = await supabase.from("falconer_trades")
    .select("id,user_id,entry_price,metaapi_position_ids")
    .eq("execution_path", "metaapi")
    .eq("mode", "live")
    .in("status", ["closed_tp3", "closed_sl", "closed_ha_flip"])
    .is("actual_exit_price", null)
    .gte("closed_at", since.toISOString())
    .limit(200);
  if (!rows?.length) return;

  const byUser = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  for (const [userId, trades] of byUser) {
    const result = await callMetaApi({
      action: "history",
      user_id: userId,
      startTime: since.toISOString(),
      endTime: new Date().toISOString(),
    });
    const deals = Array.isArray(result.json?.deals) ? result.json.deals : [];
    if (!result.ok || !deals.length) continue;

    for (const trade of trades) {
      const positionIds = Object.values((trade.metaapi_position_ids as Record<string, string> | null) ?? {});
      const matched = deals.filter((deal: any) => {
        const positionId = String(deal.positionId ?? deal.position_id ?? "");
        return positionIds.includes(positionId);
      }).sort((a: any, b: any) => new Date(a.time ?? a.brokerTime ?? 0).getTime() - new Date(b.time ?? b.brokerTime ?? 0).getTime());
      if (!matched.length) continue;

      const entryDeals = matched.filter((deal: any) => String(deal.entryType ?? deal.entry ?? "").toLowerCase().includes("in"));
      const exitDeals = matched.filter((deal: any) => String(deal.entryType ?? deal.entry ?? "").toLowerCase().includes("out"));
      const entryPrice = entryDeals.length
        ? entryDeals.reduce((sum: number, deal: any) => sum + Number(deal.price ?? 0), 0) / entryDeals.length
        : Number(trade.entry_price);
      const exitPrice = exitDeals.length
        ? exitDeals.reduce((sum: number, deal: any) => sum + Number(deal.price ?? 0), 0) / exitDeals.length
        : null;
      if (exitPrice == null) continue;
      const profit = matched.reduce((sum: number, deal: any) => sum + Number(deal.profit ?? 0), 0);
      const commission = matched.reduce((sum: number, deal: any) => sum + Number(deal.commission ?? 0), 0);
      const swap = matched.reduce((sum: number, deal: any) => sum + Number(deal.swap ?? 0), 0);
      await supabase.from("falconer_trades").update({
        actual_entry_price: entryPrice,
        actual_exit_price: exitPrice,
        slippage_points: entryPrice - Number(trade.entry_price),
        commission_usd: commission,
        swap_usd: swap,
        pnl_usd: profit + commission + swap,
        broker_deal_ids: matched.map((deal: any) => String(deal.id ?? deal.dealId ?? "")).filter(Boolean),
      }).eq("id", trade.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = (() => {
    if (authHeader === `Bearer ${SERVICE_KEY}`) return true;
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=")),
      );
      return payload?.role === "service_role" &&
        (typeof payload.exp !== "number" || payload.exp * 1000 > Date.now());
    } catch {
      return false;
    }
  })();
  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: "Service role required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: allSettings } = await supabase
      .from("falconer_settings")
      .select("*")
      .eq("enabled", true);

    // Refresh candle_history with fresh bars BEFORE managing positions or scanning,
    // so both operate on live data. Collect every (symbol, timeframe) pair we care about:
    // every enabled user's configured symbols + any symbol/timeframe with an open trade.
    const pairs = new Map<string, { userId: string; symbol: string; timeframe: string }>();
    for (const s of (allSettings ?? []) as Settings[]) {
      for (const sym of s.symbols ?? []) {
        pairs.set(`${s.user_id}|${sym}|${s.timeframe}`, {
          userId: s.user_id,
          symbol: sym,
          timeframe: s.timeframe,
        });
      }
    }
    const { data: openForRefresh } = await supabase
      .from("falconer_trades")
      .select("user_id, symbol, timeframe")
      .eq("mode", "live")
      .in("status", ["open", "tp1_hit", "tp2_hit", "be_active"]);
    for (const t of (openForRefresh ?? []) as any[]) {
      pairs.set(`${t.user_id}|${t.symbol}|${t.timeframe}`, {
        userId: t.user_id,
        symbol: t.symbol,
        timeframe: t.timeframe,
      });
    }
    const refreshed: { symbol: string; timeframe: string; inserted: number }[] = [];
    for (const { userId, symbol, timeframe } of pairs.values()) {
      const inserted = await refreshCandles(supabase, userId, symbol, timeframe);
      refreshed.push({ symbol, timeframe, inserted });
    }

    // Also keep a daily series fresh for every symbol so the strategy's DAILY trend
    // filter (EMA50 rising, close>EMA50, close>EMA200) has warmed inputs. One fetch per
    // symbol covering ~DAILY_LOOKBACK days back.
    const dailyStart = new Date(Date.now() - (DAILY_LOOKBACK + 10) * 24 * 60 * 60 * 1000).toISOString();
    const dailyPairs = new Map<string, { userId: string; symbol: string }>();
    for (const p of pairs.values()) {
      dailyPairs.set(`${p.userId}|${p.symbol}`, { userId: p.userId, symbol: p.symbol });
    }
    for (const { userId, symbol } of dailyPairs.values()) {
      const inserted = await refreshCandles(supabase, userId, symbol, "1d", DAILY_LOOKBACK, dailyStart);
      refreshed.push({ symbol, timeframe: "1d", inserted });
    }

    await manageOpenPositions(supabase);
    await reconcileRecentBrokerTrades(supabase);

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
