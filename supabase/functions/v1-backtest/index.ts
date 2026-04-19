import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// V1 ENHANCED — honest backtest:
// • EMA(4)/EMA(17) crossover on RAW closed 15m candles
// • Optional 1H EMA(4/17) trend filter (BUY needs 1H trend up; SELL needs trend down)
// • Optional session filter (asian/london/ny)
// • Conservative intrabar resolution: when a bar contains BOTH TP and SL,
//   assume SL was hit first (unless the bar opened past SL, then TP first if open is on the right side)
// • Industry-standard pip sizes (XAUUSD=0.1, indices=1, JPY=0.01, FX=0.0001)
// • Risk: SL=55 pips, TP=100 pips (1:1.82 R:R)
// • One open position per symbol

function ema(closes: number[], period: number): number[] {
  if (!closes.length) return [];
  // Seed with SMA of first `period` values to match Pine's ta.ema seeding
  const r: number[] = [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      sum += closes[i];
      if (i === period - 1) r.push(sum / period);
      else r.push(closes[i]); // placeholder until seeded
    } else {
      r.push(closes[i] * k + r[i - 1] * (1 - k));
    }
  }
  return r;
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

const SL_PIPS = 55;
const TP_PIPS = 100;

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
  enable_asian?: boolean;
  enable_london?: boolean;
  enable_ny?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body: Opts = await req.json().catch(() => ({}));
  const symbols = body.symbols ?? ["XAUUSD", "EURUSD", "USDJPY", "US30", "NAS100", "AUDUSD", "NZDUSD", "GBPUSD"];
  const useTrend = body.use_trend_filter ?? true;
  const enAsian = body.enable_asian ?? true;
  const enLondon = body.enable_london ?? true;
  const enNy = body.enable_ny ?? true;

  const sessionAllowedAt = (d: Date) => {
    const active = getActiveSessionsAt(d);
    if (active.length === 0) return false;
    return active.some(s => (s === "asian" && enAsian) || (s === "london" && enLondon) || (s === "ny" && enNy));
  };

  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const results: any[] = [];

  for (const symbol of symbols) {
    // 15m candles
    const { data: c15, error: e15 } = await sb.from("candle_history")
      .select("timestamp,open,high,low,close")
      .eq("symbol", symbol).eq("timeframe", "15m").gte("timestamp", since)
      .order("timestamp", { ascending: true });
    if (e15) { results.push({ symbol, error: e15.message }); continue; }
    if (!c15 || c15.length < 30) { results.push({ symbol, total_candles: c15?.length ?? 0, note: "insufficient" }); continue; }

    // 1H candles for trend filter
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
    function trendUpAt(ts: number): boolean | null {
      if (!useTrend || h1Times.length === 0) return null;
      // find latest 1H candle <= ts
      let lo = 0, hi = h1Times.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (h1Times[mid] <= ts) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (idx < 17) return null; // not enough data
      return h1E4[idx] > h1E17[idx];
    }

    const closes = c15.map(c => +c.close);
    const e4 = ema(closes, 4), e17 = ema(closes, 17);
    const pip = pipFor(symbol);
    const slDist = pip * SL_PIPS;
    const tpDist = pip * TP_PIPS;

    const sigs: any[] = [];
    let open: any = null;
    let skippedTrend = 0, skippedSession = 0, conservativeResolutions = 0;

    for (let i = 18; i < c15.length; i++) {
      const bar = c15[i];
      const high = +bar.high, low = +bar.low, openPx = +bar.open;
      const ts = new Date(bar.timestamp).getTime();

      // Resolve open trade against this bar
      if (open) {
        let result: string | null = null, exitPx: number | null = null;
        const tpInRange = open.dir === "BUY" ? high >= open.tp : low <= open.tp;
        const slInRange = open.dir === "BUY" ? low <= open.sl : high >= open.sl;
        if (tpInRange && slInRange) {
          // Both in range → CONSERVATIVE: assume SL first, unless open was already past SL on the favorable side
          conservativeResolutions++;
          if (open.dir === "BUY" && openPx > open.sl && openPx < open.tp) {
            // open between SL and TP → assume SL first (conservative)
            result = "LOSS"; exitPx = open.sl;
          } else if (open.dir === "SELL" && openPx < open.sl && openPx > open.tp) {
            result = "LOSS"; exitPx = open.sl;
          } else {
            // Open already past one level → unusual, take the side the open is on
            result = "LOSS"; exitPx = open.sl;
          }
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

      // Detect crossover at bar i (event-based, using closed bar values)
      const pf = e4[i - 1], ps = e17[i - 1], cf = e4[i], cs = e17[i];
      let dir: "BUY" | "SELL" | null = null;
      if (pf <= ps && cf > cs) dir = "BUY";
      else if (pf >= ps && cf < cs) dir = "SELL";
      if (!dir) continue;

      // Session filter
      if (!sessionAllowedAt(new Date(ts))) { skippedSession++; continue; }

      // Trend filter
      if (useTrend) {
        const tu = trendUpAt(ts);
        if (tu !== null) {
          const ok = (dir === "BUY" && tu) || (dir === "SELL" && !tu);
          if (!ok) { skippedTrend++; continue; }
        }
      }

      const entry = +bar.close;
      const tp = dir === "BUY" ? entry + tpDist : entry - tpDist;
      const sl = dir === "BUY" ? entry - slDist : entry + slDist;
      open = { dir, entry, tp, sl, openTs: bar.timestamp, openIdx: i };
    }

    const wins = sigs.filter(s => s.result === "WIN").length;
    const losses = sigs.filter(s => s.result === "LOSS").length;
    const longs = sigs.filter(s => s.dir === "BUY");
    const shorts = sigs.filter(s => s.dir === "SELL");
    const lw = longs.filter(s => s.result === "WIN").length, ll = longs.length - lw;
    const sw = shorts.filter(s => s.result === "WIN").length, sl_ = shorts.length - sw;
    const netPips = sigs.reduce((a, s) => a + s.pips, 0);
    const days = (new Date(c15.at(-1)!.timestamp).getTime() - new Date(c15[0].timestamp).getTime()) / 86400_000;

    // Per-session breakdown
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

    results.push({
      symbol,
      filters: { use_trend_filter: useTrend, enable_asian: enAsian, enable_london: enLondon, enable_ny: enNy },
      total_candles: c15.length,
      span_days: +days.toFixed(0),
      total_resolved: sigs.length,
      wins, losses, open_at_end: open ? 1 : 0,
      win_rate: sigs.length ? +(wins / sigs.length * 100).toFixed(1) : 0,
      net_pips: +netPips.toFixed(1),
      per_day: days > 0 ? +(sigs.length / days).toFixed(2) : 0,
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
      sample_first_signal: sigs[0] ? {
        ts: sigs[0].openTs, dir: sigs[0].dir,
        entry: sigs[0].entry, tp: sigs[0].tp, sl: sigs[0].sl,
        tp_pips: +(Math.abs(sigs[0].tp - sigs[0].entry) / pip).toFixed(2),
        sl_pips: +(Math.abs(sigs[0].entry - sigs[0].sl) / pip).toFixed(2),
        result: sigs[0].result, exit: sigs[0].exitPrice, pips: +sigs[0].pips.toFixed(1),
      } : null,
    });
  }

  return new Response(JSON.stringify({ ok: true, version: "v1_enhanced", results }, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
