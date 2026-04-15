const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAIRS = [
  { symbol: "EUR/USD", from: "EUR", to: "USD" },
  { symbol: "USD/JPY", from: "USD", to: "JPY" },
  { symbol: "GBP/USD", from: "GBP", to: "USD" },
  { symbol: "EUR/JPY", from: "EUR", to: "JPY" },
  { symbol: "GBP/JPY", from: "GBP", to: "JPY" },
  { symbol: "USD/CAD", from: "USD", to: "CAD" },
  { symbol: "AUD/USD", from: "AUD", to: "USD" },
  { symbol: "USD/CHF", from: "USD", to: "CHF" },
  { symbol: "NZD/USD", from: "NZD", to: "USD" },
];

// Cache to avoid hitting rate limits (5 calls/min on free tier)
let cachedQuotes: any[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Return cache if fresh
  if (cachedQuotes.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return new Response(JSON.stringify({ quotes: cachedQuotes, timestamp: cacheTimestamp, cached: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
    });
  }

  const API_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY");
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "ALPHA_VANTAGE_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Alpha Vantage batch endpoint — fetch all at once
    const fromCurrencies = PAIRS.map(p => p.from).join(",");
    const toCurrencies = PAIRS.map(p => p.to).join(",");

    // Use individual calls but with a small stagger to stay under rate limit
    // Fetch first 5 pairs (free tier = 25 calls/day, so we batch smartly)
    const quotes: any[] = [];

    for (const pair of PAIRS) {
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${pair.from}&to_currency=${pair.to}&apikey=${API_KEY}`;
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await resp.json();

        const rateInfo = data?.["Realtime Currency Exchange Rate"];
        if (rateInfo) {
          const price = parseFloat(rateInfo["5. Exchange Rate"]);
          const bid = parseFloat(rateInfo["8. Bid Price"]);
          const ask = parseFloat(rateInfo["9. Ask Price"]);

          quotes.push({
            symbol: pair.symbol,
            price,
            bid,
            ask,
            change: 0, // AV doesn't provide change directly
            changePercent: 0,
          });
        }
      } catch (e) {
        console.warn(`Failed to fetch ${pair.symbol}:`, e);
      }
    }

    if (quotes.length > 0) {
      cachedQuotes = quotes;
      cacheTimestamp = Date.now();
    }

    return new Response(JSON.stringify({ quotes, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
    });
  } catch (err) {
    console.error("forex-ticker error:", err);
    // Return stale cache if available
    if (cachedQuotes.length > 0) {
      return new Response(JSON.stringify({ quotes: cachedQuotes, timestamp: cacheTimestamp, stale: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Failed to fetch quotes" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
