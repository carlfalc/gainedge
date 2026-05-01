// Proxy to Render-hosted ron-ml /ingest/github-csv endpoint.
// Render's endpoint ingests ONE filename per call. We auto-discover all
// matching CSV files in the carlfalc/ron-ml GitHub repo for the requested
// symbol and ingest each one, returning an aggregated summary.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RON_ML_URL     = Deno.env.get("RON_ML_URL")     ?? "https://ron-ml.onrender.com";
const RON_ML_API_KEY = Deno.env.get("RON_ML_API_KEY") ?? "gainedge-ron-2026";

// Map our symbol → GitHub filename prefix
const SYMBOL_PREFIX: Record<string, string> = {
  XAUUSD: "XAU-USD",
  XAUAUD: "XAU-AUD",
  XAGUSD: "XAG-USD",
  AUDUSD: "AUD-USD",
  EURUSD: "EUR-USD",
  GBPUSD: "GBP-USD",
  USDJPY: "USD-JPY",
  USDCAD: "USD-CAD",
  USDCHF: "USD-CHF",
  NZDUSD: "NZD-USD",
  AUDJPY: "AUD-JPY",
  GBPJPY: "GBP-JPY",
  EURJPY: "EUR-JPY",
  EURGBP: "EUR-GBP",
  EURNZD: "EUR-NZD",
  AUDNZD: "AUD-NZD",
  AUDCAD: "AUD-CAD",
  NZDCAD: "NZD-CAD",
  GBPCAD: "GBP-CAD",
  US500:  "USA500.IDX-USD",
  USOIL:  "LIGHT.CMD-USD",
  XNGUSD: "GAS.CMD-USD",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const symbol    = (body.symbol as string)    ?? "XAUUSD";
  const timeframe = (body.timeframe as string) ?? "1m";
  const prefix    = SYMBOL_PREFIX[symbol] ?? symbol;

  // 1. Discover matching CSVs from GitHub
  let files: { name: string }[] = [];
  try {
    const ghRes = await fetch("https://api.github.com/repos/carlfalc/ron-ml/contents/", {
      headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "GAINEDGE-Ingest" },
    });
    if (!ghRes.ok) {
      return new Response(JSON.stringify({
        error: "GitHub listing failed", status: ghRes.status, body: await ghRes.text(),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const all = await ghRes.json() as { name: string; type: string }[];
    files = all.filter(f =>
      f.type === "file" &&
      f.name.endsWith(".csv") &&
      f.name.startsWith(`${prefix}_`) &&
      !f.name.includes(" - Copy")
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "GitHub unreachable", detail: (err as Error).message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (files.length === 0) {
    return new Response(JSON.stringify({
      error: "no matching CSV files in repo", symbol, prefix,
    }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2. Ingest each file sequentially via Render
  const details: unknown[] = [];
  let totalParsed = 0;
  let totalStored = 0;
  let failures = 0;

  for (const f of files) {
    try {
      const r = await fetch(`${RON_ML_URL}/ingest/github-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": RON_ML_API_KEY },
        body: JSON.stringify({ filename: f.name, symbol, timeframe }),
      });
      const txt = await r.text();
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
      if (!r.ok) {
        failures++;
        details.push({ file: f.name, status: r.status, error: parsed });
        continue;
      }
      totalParsed += Number(parsed.candles_parsed ?? 0);
      totalStored += Number(parsed.candles_stored ?? 0);
      details.push({ file: f.name, ok: true, parsed: parsed.candles_parsed, stored: parsed.candles_stored });
    } catch (err) {
      failures++;
      details.push({ file: f.name, error: (err as Error).message });
    }
  }

  return new Response(JSON.stringify({
    ok: failures === 0,
    symbol, timeframe,
    files_found:  files.length,
    files_failed: failures,
    total_candles_parsed: totalParsed,
    total_candles_stored: totalStored,
    details,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
