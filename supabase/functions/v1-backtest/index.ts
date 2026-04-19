import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function ema(closes: number[], period: number): number[] {
  if (!closes.length) return [];
  const k = 2/(period+1); const r = [closes[0]];
  for (let i=1;i<closes.length;i++) r.push(closes[i]*k + r[i-1]*(1-k));
  return r;
}
const PIP: Record<string,number> = { XAUUSD:0.01, EURUSD:0.0001, USDJPY:0.01, US30:1.0, NAS100:0.1, AUDUSD:0.0001, NZDUSD:0.0001, GBPUSD:0.0001, XAGUSD:0.001, GBPJPY:0.01 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { symbols = ["XAUUSD","EURUSD","USDJPY","US30","NAS100","AUDUSD","NZDUSD","GBPUSD"] } = await req.json().catch(() => ({}));
  const results: any[] = [];
  for (const symbol of symbols) {
    const since = new Date(Date.now() - 90*86400_000).toISOString();
    const { data: candles, error } = await sb.from("candle_history").select("timestamp,open,high,low,close").eq("symbol", symbol).eq("timeframe","15m").gte("timestamp", since).order("timestamp", { ascending: true });
    if (error) { results.push({ symbol, error: error.message }); continue; }
    if (!candles || candles.length < 30) { results.push({ symbol, total_candles: candles?.length ?? 0, note: "insufficient" }); continue; }
    const closes = candles.map(c=>+c.close);
    const e4 = ema(closes,4), e17 = ema(closes,17);
    const pip = PIP[symbol] ?? (symbol.includes("JPY") ? 0.01 : 0.0001);
    const dist = pip * 55;
    const sigs: any[] = []; let open: any = null;
    for (let i=18;i<candles.length;i++) {
      if (open) {
        const high = +candles[i].high, low = +candles[i].low;
        let r=null, px=null;
        if (open.dir==="BUY") { if (low<=open.sl){r="LOSS";px=open.sl;} else if (high>=open.tp){r="WIN";px=open.tp;} }
        else { if (high>=open.sl){r="LOSS";px=open.sl;} else if (low<=open.tp){r="WIN";px=open.tp;} }
        if (r){ const pips=(open.dir==="BUY"?px-open.entry:open.entry-px)/pip; sigs.push({...open, exitTs:candles[i].timestamp, exitPrice:px, result:r, pips}); open=null; }
      }
      if (!open){
        const pf=e4[i-1], ps=e17[i-1], cf=e4[i], cs=e17[i];
        let dir=null;
        if (pf<=ps && cf>cs) dir="BUY"; else if (pf>=ps && cf<cs) dir="SELL";
        if (dir){ const entry=+candles[i].close; const tp = dir==="BUY"?entry+dist:entry-dist; const sl=dir==="BUY"?entry-dist:entry+dist; open={dir,entry,tp,sl,openTs:candles[i].timestamp,openIdx:i}; }
      }
    }
    const wins = sigs.filter(s=>s.result==="WIN").length;
    const losses = sigs.filter(s=>s.result==="LOSS").length;
    const longs = sigs.filter(s=>s.dir==="BUY"); const shorts = sigs.filter(s=>s.dir==="SELL");
    const lw = longs.filter(s=>s.result==="WIN").length, ll = longs.filter(s=>s.result==="LOSS").length;
    const sw = shorts.filter(s=>s.result==="WIN").length, sl_ = shorts.filter(s=>s.result==="LOSS").length;
    const netPips = sigs.reduce((a,s)=>a+s.pips,0);
    const days = (new Date(candles.at(-1)!.timestamp).getTime() - new Date(candles[0].timestamp).getTime())/86400_000;
    results.push({
      symbol, total_candles: candles.length, span_days: +days.toFixed(0),
      total_resolved: sigs.length, wins, losses, open_at_end: open?1:0,
      win_rate: sigs.length ? +(wins/sigs.length*100).toFixed(1) : 0,
      net_pips: +netPips.toFixed(1),
      per_day: +(sigs.length/days).toFixed(2),
      longs: { count: longs.length, wins: lw, losses: ll },
      shorts: { count: shorts.length, wins: sw, losses: sl_ },
      sample_first_signal: sigs[0] ? { ts: sigs[0].openTs, dir: sigs[0].dir, entry: sigs[0].entry, tp: sigs[0].tp, sl: sigs[0].sl, tp_pips: +(Math.abs(sigs[0].tp-sigs[0].entry)/pip).toFixed(2), sl_pips: +(Math.abs(sigs[0].entry-sigs[0].sl)/pip).toFixed(2) } : null,
    });
  }
  return new Response(JSON.stringify({ ok: true, results }, null, 2), { headers: { ...cors, "Content-Type":"application/json" } });
});
