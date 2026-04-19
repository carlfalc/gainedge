import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// V1 ENHANCED BACKTEST — supports test variants:
// • candle_source: "raw" (default) or "ha" — calculate EMAs on Heiken Ashi closes
// • stop_mode: "fixed" (default) | "atr"
//     - fixed: use sl_pips / tp_pips
//     - atr:   SL = atr_sl_mult × ATR(14), TP = atr_tp_mult × ATR(14)
// • trend_filter: "strict" (default 1H EMA4>EMA17) | "loose" (EMA4>EMA17 OR price > EMA17 × (1+slack))
// • Pessimistic intrabar: SL assumed first when both TP & SL hit in same bar.

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const r: number[] = [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      if (i === period - 1) r.push(sum / period);
      else r.push(values[i]);
    } else {
      r.push(values[i] * k + r[i - 1] * (1 - k));
    }
  }
  return r;
}

function heikenAshi(candles: { open: number; high: number; low: number; close: number }[]) {
  const ha: { open: number; high: number; low: number; close: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0
      ? (c.open + c.close) / 2
      : (ha[i - 1].open + ha[i - 1].close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    ha.push({ open: haOpen, high: haHigh, low: haLow, close: haClose });
  }
  return ha;
}

function atr(candles: { high: number; low: number; close: number }[], period: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { tr.push(candles[i].high - candles[i].low); continue; }
    const prev = candles[i - 1].close;
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev),
      Math.abs(candles[i].low - prev),
    ));
  }
  // Wilder's smoothing
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      sum += tr[i];
      if (i === period - 1) out.push(sum / period);
      else out.push(NaN);
    } else {
      out.push((out[i - 1] * (period - 1) + tr[i]) / period);
    }
  }
  return out;
}

const PIP: Record<string, number> = {
  XAUUSD: 0.1, XAGUSD: 0.01,
  US30: 1.0, NAS100: 1.0, SPX500: 1.0, GER40: 1.0, UK100: 1.0,
  USDJPY: 0.01, GBPJPY: 0.01, EURJPY: 0.01, AUDJPY: 0.01, CADJPY: 0.01, CHFJPY: 0.01,
};
function pipFor(sym: string): number {
  if (PIP[sym] !== undefined) return PIP[sym];
  if (sym.includes("JPY")) return 0.01;
  return 0.0001;
}

function getActiveSessionsAt(date: Date): string[] {
  const minOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  const out: string[] = [];
  if (minOfDay >= 22 * 60 || minOfDay < 7 * 60) out.push("asian");
  if (minOfDay >= 7 * 60 && minOfDay < 16 * 60) out.push("london");
  if (minOfDay >= 12 * 60 + 30 && minOfDay < 21 * 60) out.push("ny");
  return out;
}

interface Opts {
  symbols?: string[];
  use_trend_filter?: boolean;
  trend_filter?: "strict" | "loose";
  trend_loose_slack?: number; // e.g. 0.005 = 0.5%
  enable_asian?: boolean;
  enable_london?: boolean;
  enable_ny?: boolean;
  candle_source?: "raw" | "ha";
  stop_mode?: "fixed" | "atr";
  sl_pips?: number;
  tp_pips?: number;
  atr_period?: number;
  atr_sl_mult?: number;
  atr_tp_mult?: number;
  days?: number;
  label?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body: Opts = await req.json().catch(() => ({}));

  const symbols = body.symbols ?? ["XAUUSD", "EURUSD", "USDJPY", "US30", "NAS100", "AUDUSD", "NZDUSD", "GBPUSD"];
  const useTrend = body.use_trend_filter ?? true;
  const trendMode = body.trend_filter ?? "strict";
  const trendSlack = body.trend_loose_slack ?? 0.005;
  const enAsian = body.enable_asian ?? true;
  const enLondon = body.enable_london ?? true;
  const enNy = body.enable_ny ?? true;
  const candleSrc = body.candle_source ?? "raw";
  const stopMode = body.stop_mode ?? "fixed";
  const SL_PIPS = body.sl_pips ?? 55;
  const TP_PIPS = body.tp_pips ?? 100;
  const atrPeriod = body.atr_period ?? 14;
  const atrSL = body.atr_sl_mult ?? 1.5;
  const atrTP = body.atr_tp_mult ?? 2.7;
  const days = body.days ?? 90;
  const label = body.label ?? "v1_enhanced";

  const sessionAllowedAt = (d: Date) => {
    const active = getActiveSessionsAt(d);
    if (active.length === 0) return false;
    return active.some(s => (s === "asian" && enAsian) || (s === "london" && enLondon) || (s === "ny" && enNy));
  };

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const results: any[] = [];

  for (const symbol of symbols) {
    const { data: c15raw, error: e15 } = await sb.from("candle_history")
      .select("timestamp,open,high,low,close")
      .eq("symbol", symbol).eq("timeframe", "15m").gte("timestamp", since)
      .order("timestamp", { ascending: true });
    if (e15) { results.push({ symbol, error: e15.message }); continue; }
    if (!c15raw || c15raw.length < 30) { results.push({ symbol, total_candles: c15raw?.length ?? 0, note: "insufficient" }); continue; }

    const c15 = c15raw.map(c => ({
      timestamp: c.timestamp,
      open: +c.open, high: +c.high, low: +c.low, close: +c.close,
    }));

    // EMA source: raw closes or HA closes
    const haCandles = candleSrc === "ha" ? heikenAshi(c15) : null;
    const emaSource = haCandles ? haCandles.map(c => c.close) : c15.map(c => c.close);
    const e4 = ema(emaSource, 4);
    const e17 = ema(emaSource, 17);

    // ATR series (always raw candles for true volatility)
    const atrSeries = stopMode === "atr" ? atr(c15, atrPeriod) : null;

    // 1H trend
    let c1h: any[] = [];
    if (useTrend) {
      const { data } = await sb.from("candle_history")
        .select("timestamp,close")
        .eq("symbol", symbol).eq("timeframe", "1h").gte("timestamp", since)
        .order("timestamp", { ascending: true });
      c1h = data ?? [];
    }
    const h1Closes = c1h.map(c => +c.close);
    const h1E4 = ema(h1Closes, 4);
    const h1E17 = ema(h1Closes, 17);
    const h1Times = c1h.map(c => new Date(c.timestamp).getTime());
    function trendOk(ts: number, dir: "BUY" | "SELL"): boolean | null {
      if (!useTrend || h1Times.length === 0) return null;
      let lo = 0, hi = h1Times.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (h1Times[mid] <= ts) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (idx < 17) return null;
      const e4v = h1E4[idx], e17v = h1E17[idx], px = h1Closes[idx];
      const up = e4v > e17v;
      if (trendMode === "loose") {
        const upLoose = up || px > e17v * (1 + trendSlack);
        const dnLoose = !up || px < e17v * (1 - trendSlack);
        return dir === "BUY" ? upLoose : dnLoose;
      }
      return dir === "BUY" ? up : !up;
    }

    const pip = pipFor(symbol);
    const sigs: any[] = [];
    let open: any = null;
    let skippedTrend = 0, skippedSession = 0, conservativeResolutions = 0;

    for (let i = 18; i < c15.length; i++) {
      const bar = c15[i];
      const high = bar.high, low = bar.low, openPx = bar.open;
      const ts = new Date(bar.timestamp).getTime();

      if (open) {
        let result: string | null = null, exitPx: number | null = null;
        const tpInRange = open.dir === "BUY" ? high >= open.tp : low <= open.tp;
        const slInRange = open.dir === "BUY" ? low <= open.sl : high >= open.sl;
        if (tpInRange && slInRange) {
          conservativeResolutions++;
          result = "LOSS"; exitPx = open.sl;
        } else if (tpInRange) {
          result = "WIN"; exitPx = open.tp;
        } else if (slInRange) {
          result = "LOSS"; exitPx = open.sl;
        }
        if (result) {
          const pips = (open.dir === "BUY" ? exitPx! - open.entry : open.entry - exitPx!) / pip;
          sigs.push({ ...open, exitTs: bar.timestamp, exitPrice: exitPx, result, pips });
          open = null;
        }
      }

      if (open) continue;

      const pf = e4[i - 1], ps = e17[i - 1], cf = e4[i], cs = e17[i];
      let dir: "BUY" | "SELL" | null = null;
      if (pf <= ps && cf > cs) dir = "BUY";
      else if (pf >= ps && cf < cs) dir = "SELL";
      if (!dir) continue;

      if (!sessionAllowedAt(new Date(ts))) { skippedSession++; continue; }

      if (useTrend) {
        const ok = trendOk(ts, dir);
        if (ok === false) { skippedTrend++; continue; }
      }

      const entry = bar.close;
      let slDist: number, tpDist: number;
      if (stopMode === "atr" && atrSeries) {
        const a = atrSeries[i];
        if (!isFinite(a) || a <= 0) continue;
        slDist = atrSL * a;
        tpDist = atrTP * a;
      } else {
        slDist = pip * SL_PIPS;
        tpDist = pip * TP_PIPS;
      }
      const tp = dir === "BUY" ? entry + tpDist : entry - tpDist;
      const sl = dir === "BUY" ? entry - slDist : entry + slDist;
      open = { dir, entry, tp, sl, openTs: bar.timestamp, openIdx: i, slPips: slDist / pip, tpPips: tpDist / pip };
    }

    const wins = sigs.filter(s => s.result === "WIN").length;
    const losses = sigs.filter(s => s.result === "LOSS").length;
    const longs = sigs.filter(s => s.dir === "BUY");
    const shorts = sigs.filter(s => s.dir === "SELL");
    const lw = longs.filter(s => s.result === "WIN").length, ll = longs.length - lw;
    const sw = shorts.filter(s => s.result === "WIN").length, sl_ = shorts.length - sw;
    const netPips = sigs.reduce((a, s) => a + s.pips, 0);
    const grossWin = sigs.filter(s => s.pips > 0).reduce((a, s) => a + s.pips, 0);
    const grossLoss = Math.abs(sigs.filter(s => s.pips < 0).reduce((a, s) => a + s.pips, 0));
    const profitFactor = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null;

    // Max drawdown in pips on equity curve
    let eq = 0, peak = 0, mdd = 0;
    for (const s of sigs) {
      eq += s.pips;
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > mdd) mdd = dd;
    }

    const spanDays = (new Date(c15.at(-1)!.timestamp).getTime() - new Date(c15[0].timestamp).getTime()) / 86400_000;

    const bySession: Record<string, { count: number; wins: number; losses: number; net: number }> = {
      asian: { count: 0, wins: 0, losses: 0, net: 0 },
      london: { count: 0, wins: 0, losses: 0, net: 0 },
      ny: { count: 0, wins: 0, losses: 0, net: 0 },
    };
    for (const s of sigs) {
      const active = getActiveSessionsAt(new Date(s.openTs));
      for (const k of active) {
        if (!bySession[k]) continue;
        bySession[k].count++;
        if (s.result === "WIN") bySession[k].wins++;
        else if (s.result === "LOSS") bySession[k].losses++;
        bySession[k].net += s.pips;
      }
    }

    // Risk-adjusted score: NetPips / MDD × √TradeCount
    const riskAdj = mdd > 0 && sigs.length > 0 ? +(netPips / mdd * Math.sqrt(sigs.length)).toFixed(2) : null;

    results.push({
      symbol,
      span_days: +spanDays.toFixed(0),
      total_candles: c15.length,
      total_resolved: sigs.length,
      wins, losses, open_at_end: open ? 1 : 0,
      win_rate: sigs.length ? +(wins / sigs.length * 100).toFixed(1) : 0,
      net_pips: +netPips.toFixed(1),
      profit_factor: profitFactor,
      max_drawdown_pips: +mdd.toFixed(1),
      risk_adjusted_score: riskAdj,
      per_day: spanDays > 0 ? +(sigs.length / spanDays).toFixed(2) : 0,
      conservative_resolutions: conservativeResolutions,
      skipped_by_trend_filter: skippedTrend,
      skipped_by_session_filter: skippedSession,
      longs: { count: longs.length, wins: lw, losses: ll },
      shorts: { count: shorts.length, wins: sw, losses: sl_ },
      by_session: Object.fromEntries(
        Object.entries(bySession).map(([k, v]) => [k, {
          ...v,
          net: +v.net.toFixed(1),
          win_rate: v.count ? +(v.wins / v.count * 100).toFixed(1) : 0,
        }])
      ),
      first_signals: sigs.slice(0, 5).map(s => ({
        ts: s.openTs, dir: s.dir,
        entry: +s.entry.toFixed(5), tp: +s.tp.toFixed(5), sl: +s.sl.toFixed(5),
        sl_pips: +s.slPips.toFixed(1), tp_pips: +s.tpPips.toFixed(1),
        result: s.result, exit: s.exitPrice, pips: +s.pips.toFixed(1),
      })),
    });
  }

  return new Response(JSON.stringify({
    ok: true, label, version: "v1_enhanced_v2",
    config: {
      candle_source: candleSrc, stop_mode: stopMode,
      sl_pips: SL_PIPS, tp_pips: TP_PIPS,
      atr_period: atrPeriod, atr_sl_mult: atrSL, atr_tp_mult: atrTP,
      use_trend_filter: useTrend, trend_filter: trendMode, trend_loose_slack: trendSlack,
      enable_asian: enAsian, enable_london: enLondon, enable_ny: enNy,
      days,
    },
    results,
  }, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
