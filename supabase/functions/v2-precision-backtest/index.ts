import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PCF v2 — Precision Confluence Strategy Backtest
// Entry: EMA8/EMA21 crossover on 15m candles
// Filters (ALL required):
//   1. Session — London (07:00-16:00 UTC) or NY (12:30-21:00 UTC)
//   2. EMA50 — price on correct side of 15m EMA50
//   3. RSI(14) zone — 45-72 (BUY) / 28-55 (SELL)
//   4. ADX(14) — strength gate, default >= 20
//   5. 1H HTF trend — EMA9 vs EMA21 on 1H must agree with direction
// SL/TP: user-configurable, fixed pips OR ATR multiplier

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

function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function atr(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const p = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
  });
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) { sum += tr[i]; out.push(NaN); }
    else if (i === period - 1) { sum += tr[i]; out.push(sum / period); }
    else { out.push((out[i - 1] * (period - 1) + tr[i]) / period); }
  }
  return out;
}

function adx(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < period * 2 + 1) return out;
  const tr: number[] = [], pdm: number[] = [], mdm: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { tr.push(candles[i].high - candles[i].low); pdm.push(0); mdm.push(0); continue; }
    const hd = candles[i].high - candles[i - 1].high;
    const ld = candles[i - 1].low - candles[i].low;
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
    pdm.push(hd > ld && hd > 0 ? hd : 0);
    mdm.push(ld > hd && ld > 0 ? ld : 0);
  }
  let smTR = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smP = pdm.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smM = mdm.slice(1, period + 1).reduce((a, b) => a + b, 0);
  const dx: number[] = new Array(period + 1).fill(NaN);
  for (let i = period + 1; i < n; i++) {
    smTR = smTR - smTR / period + tr[i];
    smP = smP - smP / period + pdm[i];
    smM = smM - smM / period + mdm[i];
    const pdi = smTR > 0 ? 100 * smP / smTR : 0;
    const mdi = smTR > 0 ? 100 * smM / smTR : 0;
    const s = pdi + mdi;
    dx.push(s > 0 ? 100 * Math.abs(pdi - mdi) / s : 0);
  }
  let adxVal = dx.slice(period + 1, period * 2 + 1).reduce((a, b) => a + b, 0) / period;
  if (period * 2 < n) out[period * 2] = adxVal;
  for (let i = period * 2 + 1; i < n; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
    out[i] = adxVal;
  }
  return out;
}

const PIP: Record<string, number> = {
  XAUUSD: 0.1, XAGUSD: 0.01,
  US30: 1, NAS100: 1, SPX500: 1, GER40: 1, UK100: 1, HK50: 1, JP225: 1, AUS200: 1,
  USDJPY: 0.01, GBPJPY: 0.01, EURJPY: 0.01, AUDJPY: 0.01, CADJPY: 0.01, CHFJPY: 0.01, NZDJPY: 0.01,
};
const pipFor = (s: string) => PIP[s] ?? (s.includes("JPY") ? 0.01 : 0.0001);

function inLondonOrNY(d: Date): boolean {
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (m >= 420 && m < 960) || (m >= 750 && m < 1260);
}

interface Opts {
  symbols?: string[];
  sl_mode?: "fixed" | "atr";
  sl_pips?: number;
  tp_pips?: number;
  atr_sl_mult?: number;
  atr_tp_mult?: number;
  adx_min?: number;
  rsi_buy_min?: number;
  rsi_buy_max?: number;
  rsi_sell_min?: number;
  rsi_sell_max?: number;
  days?: number;
  label?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body: Opts = await req.json().catch(() => ({}));

  const symbols  = body.symbols     ?? ["XAUUSD","EURUSD","GBPUSD","USDJPY","NAS100","US30","AUDUSD","NZDUSD"];
  const slMode   = body.sl_mode     ?? "atr";
  const SL_PIPS  = body.sl_pips     ?? 30;
  const TP_PIPS  = body.tp_pips     ?? 50;
  const atrSL    = body.atr_sl_mult ?? 1.5;
  const atrTP    = body.atr_tp_mult ?? 2.5;
  const ADX_MIN  = body.adx_min     ?? 20;
  const RSI_BUY  = [body.rsi_buy_min  ?? 45, body.rsi_buy_max  ?? 72];
  const RSI_SELL = [body.rsi_sell_min ?? 28, body.rsi_sell_max ?? 55];
  const days     = body.days        ?? 90;
  const label    = body.label       ?? "PCF_v2";

  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const results: any[] = [];

  for (const symbol of symbols) {
    const { data: raw15, error: e15 } = await sb.from("candle_history")
      .select("timestamp,open,high,low,close").eq("symbol", symbol).eq("timeframe", "15m")
      .gte("timestamp", since).order("timestamp", { ascending: true });
    if (e15 || !raw15 || raw15.length < 60) {
      results.push({ symbol, note: "insufficient 15m data", candles: raw15?.length ?? 0 });
      continue;
    }
    const c15 = raw15.map(c => ({ timestamp: c.timestamp, open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
    const cls = c15.map(c => c.close);

    const E8  = ema(cls, 8);
    const E21 = ema(cls, 21);
    const E50 = ema(cls, 50);
    const RSI = rsi(cls, 14);
    const ATR = atr(c15, 14);
    const ADX = adx(c15, 14);

    const { data: raw1h } = await sb.from("candle_history")
      .select("timestamp,close").eq("symbol", symbol).eq("timeframe", "1h")
      .gte("timestamp", since).order("timestamp", { ascending: true });
    const c1h = (raw1h ?? []).map(c => ({ ts: new Date(c.timestamp).getTime(), close: +c.close }));
    const hE9  = ema(c1h.map(c => c.close), 9);
    const hE21 = ema(c1h.map(c => c.close), 21);

    function htfOk(ts: number, dir: "BUY"|"SELL"): boolean {
      if (c1h.length < 21) return true;
      let lo = 0, hi = c1h.length - 1, idx = -1;
      while (lo <= hi) { const mid = (lo+hi)>>1; if (c1h[mid].ts <= ts) { idx=mid; lo=mid+1; } else hi=mid-1; }
      if (idx < 21) return false;
      return dir === "BUY" ? hE9[idx] > hE21[idx] : hE9[idx] < hE21[idx];
    }

    const pip = pipFor(symbol);
    const sigs: any[] = [];
    let open: any = null;
    const sk = { session: 0, ema50: 0, rsi: 0, adx: 0, htf: 0 };
    let conservative = 0;

    for (let i = 55; i < c15.length; i++) {
      const bar = c15[i];
      const ts  = new Date(bar.timestamp).getTime();

      if (open) {
        const tpHit = open.dir === "BUY" ? bar.high >= open.tp : bar.low  <= open.tp;
        const slHit = open.dir === "BUY" ? bar.low  <= open.sl : bar.high >= open.sl;
        let result: string|null = null, exitPx = 0;
        if (tpHit && slHit) { conservative++; result = "LOSS"; exitPx = open.sl; }
        else if (tpHit)     { result = "WIN";  exitPx = open.tp; }
        else if (slHit)     { result = "LOSS"; exitPx = open.sl; }
        if (result) {
          sigs.push({ ...open, exitTs: bar.timestamp, exitPx, result,
            pips: (open.dir === "BUY" ? exitPx - open.entry : open.entry - exitPx) / pip });
          open = null;
        }
      }
      if (open) continue;

      const pe8 = E8[i-1], pe21 = E21[i-1], ce8 = E8[i], ce21 = E21[i];
      if (!isFinite(pe8)||!isFinite(pe21)||!isFinite(ce8)||!isFinite(ce21)) continue;
      let dir: "BUY"|"SELL"|null = null;
      if (pe8 <= pe21 && ce8 > ce21) dir = "BUY";
      else if (pe8 >= pe21 && ce8 < ce21) dir = "SELL";
      if (!dir) continue;

      if (!inLondonOrNY(new Date(ts))) { sk.session++; continue; }

      const e50v = E50[i];
      if (!isFinite(e50v)) { sk.ema50++; continue; }
      if (dir === "BUY"  && bar.close < e50v) { sk.ema50++; continue; }
      if (dir === "SELL" && bar.close > e50v) { sk.ema50++; continue; }

      const rsiV = RSI[i];
      if (!isFinite(rsiV)) { sk.rsi++; continue; }
      if (dir === "BUY"  && (rsiV < RSI_BUY[0]  || rsiV > RSI_BUY[1]))  { sk.rsi++; continue; }
      if (dir === "SELL" && (rsiV < RSI_SELL[0] || rsiV > RSI_SELL[1])) { sk.rsi++; continue; }

      const adxV = ADX[i];
      if (!isFinite(adxV) || adxV < ADX_MIN) { sk.adx++; continue; }

      if (!htfOk(ts, dir)) { sk.htf++; continue; }

      const entry = bar.close;
      let slDist: number, tpDist: number;
      if (slMode === "atr") {
        const a = ATR[i]; if (!isFinite(a) || a <= 0) continue;
        slDist = atrSL * a; tpDist = atrTP * a;
      } else {
        slDist = pip * SL_PIPS; tpDist = pip * TP_PIPS;
      }
      open = {
        dir, entry, openTs: bar.timestamp,
        tp: dir === "BUY" ? entry + tpDist : entry - tpDist,
        sl: dir === "BUY" ? entry - slDist : entry + slDist,
        slPips: slDist / pip, tpPips: tpDist / pip,
        rsi: +rsiV.toFixed(1), adx: +adxV.toFixed(1),
      };
    }

    const wins = sigs.filter(s => s.result === "WIN").length;
    const losses = sigs.length - wins;
    const netPips = sigs.reduce((a, s) => a + s.pips, 0);
    const gw = sigs.filter(s => s.pips > 0).reduce((a, s) => a + s.pips, 0);
    const gl = Math.abs(sigs.filter(s => s.pips < 0).reduce((a, s) => a + s.pips, 0));
    let eq = 0, peak = 0, mdd = 0;
    for (const s of sigs) { eq += s.pips; if (eq > peak) peak = eq; if (peak - eq > mdd) mdd = peak - eq; }
    const spanDays = c15.length > 1
      ? (new Date(c15.at(-1)!.timestamp).getTime() - new Date(c15[0].timestamp).getTime()) / 86400_000 : 0;

    const bySession: Record<string, { count: number; wins: number; net: number }> = {
      london: { count: 0, wins: 0, net: 0 }, ny: { count: 0, wins: 0, net: 0 }, overlap: { count: 0, wins: 0, net: 0 },
    };
    for (const s of sigs) {
      const m = new Date(s.openTs).getUTCHours() * 60 + new Date(s.openTs).getUTCMinutes();
      const inL = m >= 420 && m < 960, inN = m >= 750 && m < 1260;
      const key = inL && inN ? "overlap" : inL ? "london" : "ny";
      bySession[key].count++; if (s.result === "WIN") bySession[key].wins++; bySession[key].net += s.pips;
    }

    results.push({
      symbol,
      span_days: +spanDays.toFixed(0),
      total_trades: sigs.length,
      wins, losses,
      win_rate: sigs.length ? +(wins / sigs.length * 100).toFixed(1) : 0,
      net_pips: +netPips.toFixed(1),
      profit_factor: gl > 0 ? +(gw / gl).toFixed(2) : null,
      max_drawdown_pips: +mdd.toFixed(1),
      trades_per_day: spanDays > 0 ? +(sigs.length / spanDays).toFixed(2) : 0,
      conservative_resolutions: conservative,
      filters_skipped: { ...sk, total: Object.values(sk).reduce((a, b) => a + b, 0) },
      by_session: Object.fromEntries(Object.entries(bySession).map(([k, v]) => [k, {
        ...v, net: +v.net.toFixed(1), win_rate: v.count ? +(v.wins / v.count * 100).toFixed(1) : 0,
      }])),
      sample_trades: sigs.slice(-5).map(s => ({
        ts: s.openTs, dir: s.dir,
        entry: +s.entry.toFixed(5), sl: +s.sl.toFixed(5), tp: +s.tp.toFixed(5),
        sl_pips: +s.slPips.toFixed(1), tp_pips: +s.tpPips.toFixed(1),
        rsi: s.rsi, adx: s.adx, result: s.result, pips: +s.pips.toFixed(1),
      })),
    });
  }

  const totTrades = results.reduce((a, r) => a + (r.total_trades ?? 0), 0);
  const totWins   = results.reduce((a, r) => a + (r.wins ?? 0), 0);

  return new Response(JSON.stringify({
    ok: true, label, version: "PCF_v2",
    strategy: "Precision Confluence — EMA8/21 cross + EMA50 side + RSI zone + ADX strength + 1H HTF trend. London/NY sessions only.",
    config: {
      sl_mode: slMode, sl_pips: SL_PIPS, tp_pips: TP_PIPS, atr_sl_mult: atrSL, atr_tp_mult: atrTP,
      adx_min: ADX_MIN, rsi_buy_zone: RSI_BUY, rsi_sell_zone: RSI_SELL, days,
      sessions: "London 07:00-16:00 UTC + NY 12:30-21:00 UTC",
    },
    aggregate: {
      total_trades: totTrades, wins: totWins, losses: totTrades - totWins,
      overall_win_rate: totTrades > 0 ? +(totWins / totTrades * 100).toFixed(1) : 0,
      total_net_pips: +results.reduce((a, r) => a + (r.net_pips ?? 0), 0).toFixed(1),
    },
    results,
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
