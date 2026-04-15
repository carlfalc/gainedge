import { corsHeaders } from "@supabase/supabase-js/cors";

const PAIRS = [
  { symbol: "EUR/USD", finnhub: "OANDA:EUR_USD" },
  { symbol: "USD/JPY", finnhub: "OANDA:USD_JPY" },
  { symbol: "GBP/USD", finnhub: "OANDA:GBP_USD" },
  { symbol: "EUR/JPY", finnhub: "OANDA:EUR_JPY" },
  { symbol: "GBP/JPY", finnhub: "OANDA:GBP_JPY" },
  { symbol: "USD/CAD", finnhub: "OANDA:USD_CAD" },
  { symbol: "XAU/USD", finnhub: "OANDA:XAU_USD" },
  { symbol: "AUD/USD", finnhub: "OANDA:AUD_USD" },
  { symbol: "USD/CHF", finnhub: "OANDA:USD_CHF" },
  { symbol: "NZD/USD", finnhub: "OANDA:NZD_USD" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
  if (!FINNHUB_API_KEY) {
    return new Response(JSON.stringify({ error: "FINNHUB_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Fetch all quotes in parallel
    const results = await Promise.allSettled(
      PAIRS.map(async (pair) => {
        const url = `https://finnhub.io/api/v1/quote?symbol=${pair.finnhub}&token=${FINNHUB_API_KEY}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return null;
        const data = await resp.json();
        // Finnhub quote: c=current, pc=previous close, d=change, dp=change%
        if (!data || !data.c || data.c === 0) return null;
        return {
          symbol: pair.symbol,
          price: data.c,
          change: data.d ?? 0,
          changePercent: data.dp ?? 0,
        };
      })
    );

    const quotes = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value);

    return new Response(JSON.stringify({ quotes, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=15" },
    });
  } catch (err) {
    console.error("forex-ticker error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch quotes" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
