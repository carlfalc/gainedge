import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// RON Auto-Trade Engine v2 — DLO + Squeeze signal generation
// Triggered every 15m via cron. For each user with ron_settings.ron_enabled = true,
// and each of their symbols:
//   1. Fetch last 450 15m candles + 100 1H candles from candle_history
//   2. POST to /predict-v3 (DLO + Squeeze + Heikin Ashi + EMA 12/69)
//   3. EXECUTE if ron_action == "EXECUTE" and position limits allow
//   4. No session rules by default — sessions toggleable later via ron_settings.sessions
//   5. Log every decision to ron_auto_trades

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RON_ML_URL       = Deno.env.get("RON_ML_URL")     ?? "https://ron-ml.onrender.com";
const RON_ML_API_KEY   = Deno.env.get("RON_ML_API_KEY") ?? "gainedge-ron-2026";

const PIP: Record<string, number> = {
  XAUUSD: 0.1,  XAGUSD: 0.01,
  US30: 1,      NAS100: 1,   SPX500: 1, GER40: 1, UK100: 1,
  USDJPY: 0.01, GBPJPY: 0.01, EURJPY: 0.01, AUDJPY: 0.01,
};
const pipFor = (s: string) => PIP[s] ?? (s.includes("JPY") ? 0.01 : 0.0001);

function wilderAtr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const trs: number[] = [];
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) { trs.push(highs[i] - lows[i]); continue; }
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i]  - closes[i - 1]),
    ));
  }
  let val = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    val = (val * (period - 1) + trs[i]) / period;
  }
  return val;
}

// Fetch candles and call /predict-v3. Returns the signal JSON or null.
async function getSignal(
  sb: ReturnType<typeof createClient>,
  symbol: string,
  minTier: string,
): Promise<{ signal: Record<string, unknown>; lastClose: number; highs: number[]; lows: number[]; closes: number[] } | null> {
  const { data: c15 } = await sb
    .from("candle_history")
    .select("timestamp,open,high,low,close,volume")
    .eq("symbol", symbol)
    .eq("timeframe", "15m")
    .order("timestamp", { ascending: false })
    .limit(450);

  if (!c15 || c15.length < 100) return null;

  const sorted = (c15 as any[]).slice().reverse();
  const bars   = sorted.map((c) => [c.timestamp, +c.open, +c.high, +c.low, +c.close, +(c.volume ?? 0)]);
  const highs  = sorted.map((c) => +c.high);
  const lows   = sorted.map((c) => +c.low);
  const closes = sorted.map((c) => +c.close);

  const { data: c1h } = await sb
    .from("candle_history")
    .select("timestamp,open,high,low,close,volume")
    .eq("symbol", symbol)
    .eq("timeframe", "1h")
    .order("timestamp", { ascending: false })
    .limit(100);
  const htf_bars = c1h
    ? (c1h as any[]).slice().reverse().map((c) => [c.timestamp, +c.open, +c.high, +c.low, +c.close, +(c.volume ?? 0)])
    : undefined;

  const resp = await fetch(`${RON_ML_URL}/predict-v3`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": RON_ML_API_KEY },
    body: JSON.stringify({ bars, htf_bars, min_tier: minTier }),
  });
  if (!resp.ok) return null;

  const signal = await resp.json() as Record<string, unknown>;
  return { signal, lastClose: closes[closes.length - 1], highs, lows, closes };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body  = await req.json().catch(() => ({})) as Record<string, unknown>;
  const dryRun       = Boolean(body.dry_run);
  const targetUserId = body.user_id as string | undefined;

  let userQuery = admin.from("ron_settings").select("*").eq("ron_enabled", true);
  if (targetUserId) userQuery = userQuery.eq("user_id", targetUserId);
  const { data: ronUsers } = await userQuery;

  if (!ronUsers || ronUsers.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, message: "no users with RON enabled", trades_executed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const log: unknown[] = [];
  let totalExecuted = 0;

  for (const user of ronUsers) {
    const userId: string      = user.user_id;
    const userSymbols: string[] = user.symbols ?? ["XAUUSD", "EURUSD", "USDJPY"];
    const minProb: number     = user.min_ron_probability ?? 0.65;
    const maxTrades: number   = user.max_open_trades     ?? 3;
    const slMode: string      = user.sl_mode             ?? "atr";
    const slPips: number      = user.sl_pips             ?? 30;
    const tpPips: number      = user.tp_pips             ?? 50;
    const atrSlMult: number   = user.atr_sl_mult         ?? 1.5;
    const atrTpMult: number   = user.atr_tp_mult         ?? 2.5;
    const riskPct: number     = user.risk_per_trade_pct  ?? 1.0;
    const minTier: string     = minProb >= 0.75 ? "A" : "B";

    // Broker connection
    const { data: brokerConns } = await admin
      .from("broker_connections")
      .select("metaapi_account_id,broker_name,balance")
      .eq("user_id", userId)
      .eq("is_default", true)
      .limit(1);
    const broker = (brokerConns as any[])?.[0];
    if (!broker?.metaapi_account_id) {
      log.push({ user_id: userId, action: "skip", reason: "no broker connected" });
      continue;
    }

    // Global open trade limit
    const { count: openCount } = await admin
      .from("ron_auto_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "open");
    if ((openCount ?? 0) >= maxTrades) {
      log.push({ user_id: userId, action: "skip", reason: `max open trades (${openCount}/${maxTrades})` });
      continue;
    }

    for (const symbol of userSymbols) {
      // Per-symbol open check
      const { count: symOpen } = await admin
        .from("ron_auto_trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .eq("status", "open");
      if ((symOpen ?? 0) > 0) {
        log.push({ user_id: userId, symbol, action: "skip", reason: "already open" });
        continue;
      }

      // Get DLO + Squeeze signal
      let result: Awaited<ReturnType<typeof getSignal>> = null;
      try {
        result = await getSignal(admin, symbol, minTier);
      } catch (err: unknown) {
        log.push({ user_id: userId, symbol, action: "warn", reason: `predict-v3 error: ${(err as Error).message}` });
        continue;
      }

      if (!result) {
        log.push({ user_id: userId, symbol, action: "skip", reason: "insufficient candle data or ML unreachable" });
        continue;
      }

      const { signal, lastClose, highs, lows, closes } = result;

      if (signal.ron_action !== "EXECUTE") {
        log.push({ user_id: userId, symbol, action: "hold",
          tier: signal.tier, dlo: signal.dlo,
          squeeze: signal.squeeze_state, ha_bull: signal.ha_bullish });
        continue;
      }

      const direction = signal.signal as "BUY" | "SELL";
      const px = lastClose;

      // SL / TP
      let slDist: number, tpDist: number;
      if (slMode === "atr") {
        const atrVal = wilderAtr(highs, lows, closes, 14);
        slDist = atrVal * atrSlMult;
        tpDist = atrVal * atrTpMult;
      } else {
        const pip = pipFor(symbol);
        slDist = pip * slPips;
        tpDist = pip * tpPips;
      }
      const stopLoss   = +(direction === "BUY" ? px - slDist : px + slDist).toFixed(5);
      const takeProfit = +(direction === "BUY" ? px + tpDist : px - tpDist).toFixed(5);

      // Position sizing
      const balance      = (broker.balance as number) ?? 1000;
      const riskUsd      = balance * (riskPct / 100);
      const pip          = pipFor(symbol);
      const pipUsd       = symbol === "XAUUSD" ? 1.0 : symbol.includes("JPY") ? 0.09 : 0.10;
      const slPipsActual = slDist / pip;
      const rawLots      = riskUsd / Math.max(slPipsActual * pipUsd * 100, 1);
      const volume       = Math.max(0.01, Math.min(0.50, Math.round(rawLots * 100) / 100));
      const actionType   = direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";

      if (dryRun) {
        log.push({ user_id: userId, symbol, direction, action: "DRY_RUN",
          tier: signal.tier, dlo: signal.dlo, squeeze: signal.squeeze_state,
          ha_bull: signal.ha_bullish, ha_transition: signal.ha_transition,
          htf_bias: signal.htf_bias, ema12: signal.ema12, ema69: signal.ema69,
          volume, sl: stopLoss, tp: takeProfit, entry: px });
        continue;
      }

      try {
        const tradeResp = await fetch(`${SUPABASE_URL}/functions/v1/metaapi-trade`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            action: "trade", user_id: userId, symbol, actionType,
            volume: volume.toString(),
            stopLoss: stopLoss.toString(),
            takeProfit: takeProfit.toString(),
          }),
        });
        const tradeData = await tradeResp.json() as Record<string, unknown>;

        if (tradeResp.ok && tradeData.success) {
          await admin.from("ron_auto_trades").insert({
            user_id:          userId,
            symbol,
            direction,
            entry_price:      px,
            sl_price:         stopLoss,
            tp_price:         takeProfit,
            volume,
            ron_probability:  signal.tier === "A" ? 0.80 : 0.65,
            metaapi_trade_id: (tradeData.result as any)?.orderId ?? (tradeData.result as any)?.positionId ?? null,
            status:           "open",
            opened_at:        new Date().toISOString(),
          });
          totalExecuted++;
          log.push({ user_id: userId, symbol, direction, action: "EXECUTED",
            tier: signal.tier, volume, sl: stopLoss, tp: takeProfit, entry: px });
        } else {
          log.push({ user_id: userId, symbol, action: "TRADE_FAILED",
            error: (tradeData.error as string) ?? JSON.stringify(tradeData) });
        }
      } catch (err: unknown) {
        log.push({ user_id: userId, symbol, action: "ERROR", error: (err as Error).message });
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      dry_run: dryRun,
      trades_executed: totalExecuted,
      users_with_ron: ronUsers.length,
      log,
      timestamp: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
