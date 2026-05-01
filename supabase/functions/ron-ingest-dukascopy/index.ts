// Proxy to Render-hosted ron-ml /ingest/dukascopy-direct endpoint.
// Render downloads tick data straight from Dukascopy's public datafeed,
// aggregates to 1m OHLCV, and bulk-inserts into candle_history.
// Capped at 31 days per call (Render HTTP timeout). The frontend chunks
// longer ranges sequentially.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RON_ML_URL     = Deno.env.get("RON_ML_URL")     ?? "https://ron-ml.onrender.com";
const RON_ML_API_KEY = Deno.env.get("RON_ML_API_KEY") ?? "gainedge-ron-2026";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const symbol   = (body.symbol as string) ?? "XAUUSD";
  const start    = body.start as string | undefined;
  const end      = body.end as string | undefined;
  const max_days = (body.max_days as number) ?? 31;

  if (!start || !end) {
    return new Response(JSON.stringify({ error: "start and end (YYYY-MM-DD) required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const r = await fetch(`${RON_ML_URL}/ingest/dukascopy-direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": RON_ML_API_KEY },
      body: JSON.stringify({ symbol, start, end, max_days }),
    });
    const txt = await r.text();
    let parsed: unknown;
    try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
    if (!r.ok) {
      return new Response(JSON.stringify({
        error: "ron-ml /ingest/dukascopy-direct failed", status: r.status, body: parsed,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Render unreachable", detail: (err as Error).message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});