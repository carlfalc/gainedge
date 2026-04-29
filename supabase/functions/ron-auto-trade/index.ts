import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// RON Auto-Trade Engine
// Triggered every 15m via cron. For each user with ron_settings.ron_enabled = true:
//   1. Pull recent high-conviction signals (last 20m, confidence >= 8)
//   2. Validate with PCF filters (EMA50 side + 1H HTF trend) using fresh candle data
//   3. Call RON ML /analyse-setup for win-probability score
//   4. Execute via metaapi-trade if probability >= user threshold AND no open trade on symbol
//   5. Log every decision to ron_auto_trades

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RON_ML_URL       = Deno.env.get("RON_ML_URL")     ?? "https://ron-ml.onrender.com";
const RON_ML_API_KEY   = Deno.env.get("RON_ML_API_KEY") ?? "gainedge-ron-2026";

const PIP: Record<string, number> = {
  XAUUSD: 0.1, XAGUSD: 0.01,
  US30: 1, NAS100: 1, SPX500: 1, GER40: 1, UK100: 1,
  USDJPY: 0.01, GBPJPY: 0.01, EURJPY: 0.01, AUDJPY: 0.01,
};
const pipFor = (s: string) => PIP[s] ?? (s.includes("JPY") ? 0.01 : 0.0001);

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { sum += values[i]; out.push(NaN); }
    else if (i === period - 1) { sum += values[i]; out.push(sum / period); }
    else { out.push(values[i] * k + out[i - 1] * (1 - k)); }
  }
  return out;
}

interface PcfCheck {
  pass: boolean;
  reason: string;
  ema50: number | null;
  htf_aligned: boolean;
  current_price: number | null;
}

async function pcfValidate(sb: any, symbol: string, dir: "BUY"|"SELL"): Promise<PcfCheck> {
  const { data: c15 } = await sb.from("candle_history")
    .select("timestamp,close").eq("symbol", symbol).eq("timeframe", "15m")
    .order("timestamp", { ascending: false }).limit(80);
  if (!c15 || c15.length < 50) {
    return { pass: false, reason: "insufficient 15m candles", ema50: null, htf_aligned: false, current_price: null };
  }
  const closes = c15.map((c: any) => +c.close).reverse();
  const e50 = ema(closes, 50);
  const lastPrice = closes[closes.length - 1];
  const lastE50 = e50[e50.length - 1];
  if (!isFinite(lastE50)) {
    return { pass: false, reason: "EMA50 not ready", ema50: null, htf_aligned: false, current_price: lastPrice };
  }
  const ema50OK = dir === "BUY" ? lastPrice > lastE50 : lastPrice < lastE50;
  if (!ema50OK) {
    return { pass: false, reason: `EMA50 filter — price ${lastPrice} on wrong side of ${lastE50.toFixed(5)}`,
      ema50: lastE50, htf_aligned: false, current_price: lastPrice };
  }

  const { data: c1h } = await sb.from("candle_history")
    .select("close").eq("symbol", symbol).eq("timeframe", "1h")
    .order("timestamp", { ascending: false }).limit(50);
  if (!c1h || c1h.length < 25) {
    return { pass: true, reason: "passed (1H data unavailable)", ema50: lastE50, htf_aligned: true, current_price: lastPrice };
  }
  const closes1h = c1h.map((c: any) => +c.close).reverse();
  const e9_1h = ema(closes1h, 9);
  const e21_1h = ema(closes1h, 21);
  const last9 = e9_1h[e9_1h.length - 1];
  const last21 = e21_1h[e21_1h.length - 1];
  const htfOK = dir === "BUY" ? last9 > last21 : last9 < last21;
  if (!htfOK) {
    return { pass: false, reason: `1H trend disagrees (EMA9 ${last9.toFixed(5)} vs EMA21 ${last21.toFixed(5)})`,
      ema50: lastE50, htf_aligned: false, current_price: lastPrice };
  }
  return { pass: true, reason: "all PCF filters confirmed", ema50: lastE50, htf_aligned: true, current_price: lastPrice };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dry_run ?? false;
  const targetUserId: string | undefined = body.user_id;

  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: signals } = await admin
    .from("signal_outcomes")
    .select("*")
    .eq("result", "PENDING")
    .gte("confidence", 8)
    .gte("created_at", since)
    .order("confidence", { ascending: false })
    .limit(20);

  if (!signals || signals.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "no fresh high-conviction signals", trades_executed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let userQuery = admin.from("ron_settings").select("*").eq("ron_enabled", true);
  if (targetUserId) userQuery = userQuery.eq("user_id", targetUserId);
  const { data: ronUsers } = await userQuery;

  if (!ronUsers || ronUsers.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "no users with RON enabled", trades_executed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const log: any[] = [];
  let totalExecuted = 0;

  for (const user of ronUsers) {
    const userId: string = user.user_id;
    const userSymbols: string[] = user.symbols ?? ["XAUUSD","EURUSD","GBPUSD"];
    const minProb: number     = user.min_ron_probability ?? 0.65;
    const maxTrades: number   = user.max_open_trades     ?? 3;
    const slMode: string      = user.sl_mode             ?? "fixed";
    const slPips: number      = user.sl_pips             ?? 30;
    const tpPips: number      = user.tp_pips             ?? 50;
    const riskPct: number     = user.risk_per_trade_pct  ?? 1.0;

    const { data: brokerConns } = await admin.from("broker_connections")
      .select("metaapi_account_id, broker_name, balance")
      .eq("user_id", userId).eq("is_default", true).limit(1);
    const broker = brokerConns?.[0];
    if (!broker?.metaapi_account_id) {
      log.push({ user_id: userId, action: "skip", reason: "no broker connected" });
      continue;
    }

    const { count: openCount } = await admin.from("ron_auto_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "open");
    if ((openCount ?? 0) >= maxTrades) {
      log.push({ user_id: userId, action: "skip", reason: `max open trades (${openCount}/${maxTrades})` });
      continue;
    }

    const eligible = signals.filter(s => userSymbols.includes(s.symbol));

    for (const sig of eligible) {
      const { count: symOpen } = await admin.from("ron_auto_trades")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("symbol", sig.symbol).eq("status", "open");
      if ((symOpen ?? 0) > 0) {
        log.push({ user_id: userId, symbol: sig.symbol, action: "skip", reason: "already open" });
        continue;
      }

      const pcf = await pcfValidate(admin, sig.symbol, sig.direction);
      if (!pcf.pass) {
        log.push({ user_id: userId, symbol: sig.symbol, action: "skip", reason: `PCF: ${pcf.reason}` });
        continue;
      }

      let ronProb = 0.5;
      try {
        const r = await fetch(`${RON_ML_URL}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": RON_ML_API_KEY },
          body: JSON.stringify({
            symbol: sig.symbol,
            direction: sig.direction,
            adx_at_entry: sig.adx_at_entry ?? 22,
            rsi_at_entry: sig.rsi_at_entry ?? 55,
            stoch_rsi_at_entry: sig.stoch_rsi_at_entry ?? 50,
            macd_status: sig.macd_status ?? "Neutral",
            confidence: sig.confidence ?? 8,
            session: sig.session ?? "london",
            hour_utc: sig.hour_utc ?? new Date().getUTCHours(),
            day_of_week: sig.day_of_week ?? new Date().getUTCDay(),
            pattern_active: sig.pattern_active ?? "None",
          }),
        });
        if (r.ok) {
          const d = await r.json();
          ronProb = d.probability ?? 0.5;
        }
      } catch (err) {
        log.push({ user_id: userId, symbol: sig.symbol, action: "warn", reason: `RON ML unreachable: ${(err as Error).message}` });
      }

      if (ronProb < minProb) {
        log.push({ user_id: userId, symbol: sig.symbol, action: "skip",
          reason: `RON probability ${(ronProb*100).toFixed(0)}% < threshold ${(minProb*100).toFixed(0)}%` });
        continue;
      }

      const pip = pipFor(sig.symbol);
      const slDist = pip * slPips;
      const tpDist = pip * tpPips;
      const px = pcf.current_price ?? sig.entry_price ?? 0;
      const stopLoss   = px > 0 ? +(sig.direction === "BUY" ? px - slDist : px + slDist).toFixed(5) : null;
      const takeProfit = px > 0 ? +(sig.direction === "BUY" ? px + tpDist : px - tpDist).toFixed(5) : null;

      const balance = broker.balance ?? 1000;
      const riskUsd = balance * (riskPct / 100);
      const pipUsd  = sig.symbol === "XAUUSD" ? 1.0 : sig.symbol.includes("JPY") ? 0.09 : 0.10;
      const rawLots = riskUsd / Math.max(slPips * pipUsd * 100, 1);
      const volume  = Math.max(0.01, Math.min(0.50, Math.round(rawLots * 100) / 100));
      const actionType = sig.direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";

      if (dryRun) {
        log.push({ user_id: userId, symbol: sig.symbol, direction: sig.direction,
          action: "DRY_RUN", ron_probability: ronProb, volume, sl: stopLoss, tp: takeProfit, ema50: pcf.ema50 });
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
            action: "trade",
            user_id: userId,
            symbol: sig.symbol,
            actionType,
            volume: volume.toString(),
            stopLoss: stopLoss?.toString(),
            takeProfit: takeProfit?.toString(),
          }),
        });
        const tradeData = await tradeResp.json();

        if (tradeResp.ok && tradeData.success) {
          await admin.from("ron_auto_trades").insert({
            user_id: userId,
            signal_id: sig.id,
            symbol: sig.symbol,
            direction: sig.direction,
            entry_price: px,
            sl_price: stopLoss,
            tp_price: takeProfit,
            volume,
            ron_probability: ronProb,
            metaapi_trade_id: tradeData.result?.orderId ?? tradeData.result?.positionId ?? null,
            status: "open",
            opened_at: new Date().toISOString(),
          });
          totalExecuted++;
          log.push({ user_id: userId, symbol: sig.symbol, direction: sig.direction,
            action: "EXECUTED", ron_probability: ronProb, volume, sl: stopLoss, tp: takeProfit });
        } else {
          log.push({ user_id: userId, symbol: sig.symbol,
            action: "TRADE_FAILED", error: tradeData.error ?? JSON.stringify(tradeData) });
        }
      } catch (err: any) {
        log.push({ user_id: userId, symbol: sig.symbol, action: "ERROR", error: err.message });
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    dry_run: dryRun,
    trades_executed: totalExecuted,
    signals_evaluated: signals.length,
    users_with_ron: ronUsers.length,
    log,
    timestamp: new Date().toISOString(),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
