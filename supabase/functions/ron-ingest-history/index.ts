// Thin proxy to Render-hosted ron-ml /ingest/github-csv endpoint.
// Lets the Backtesting page seed historical 1m candles before running V3.

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

  const symbol    = (body.symbol as string)    ?? "XAUUSD";
  const timeframe = (body.timeframe as string) ?? "1m";

  let upstream: Response;
  try {
    upstream = await fetch(`${RON_ML_URL}/ingest/github-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": RON_ML_API_KEY },
      body: JSON.stringify({ ...body, symbol, timeframe }),
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: "ron-ml unreachable", detail: (err as Error).message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
