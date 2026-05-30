// RON adaptive-advisor proxy. Fetches the Render-hosted ron-ml brain's
// /intelligence/full-briefing (economic data, sentiment, fear-greed, ML status)
// and returns it to the dashboard. Keeps the brain URL/key server-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RON_ML_URL     = Deno.env.get("RON_ML_URL")     ?? "https://ron-ml.onrender.com";
const RON_ML_API_KEY = Deno.env.get("RON_ML_API_KEY") ?? "gainedge-ron-2026";

// Render free tier can cold-start slowly; allow generous time before giving up.
const BRIEFING_TIMEOUT_MS = 55_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIEFING_TIMEOUT_MS);
  try {
    const res = await fetch(`${RON_ML_URL}/intelligence/full-briefing`, {
      method: "GET",
      headers: { "X-API-Key": RON_ML_API_KEY, "Accept": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    let briefing: any = null;
    try { briefing = JSON.parse(text); } catch { /* non-JSON */ }

    if (!res.ok || !briefing) {
      return new Response(JSON.stringify({
        ok: false,
        error: `brain_unavailable_${res.status}`,
        detail: text.slice(0, 300),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, briefing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as Error).name === "AbortError";
    return new Response(JSON.stringify({
      ok: false,
      error: aborted ? "brain_timeout" : "brain_fetch_failed",
      detail: (e as Error).message,
    }), { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
