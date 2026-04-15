const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

// Cache quotes in memory
let cachedQuotes: QuoteResult[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (cachedQuotes.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return new Response(JSON.stringify({ quotes: cachedQuotes, timestamp: cacheTimestamp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Use exchangerate.host — free, no key required, reliable
    const pairs = [
      { symbol: "EUR/USD", base: "EUR", target: "USD" },
      { symbol: "GBP/USD", base: "GBP", target: "USD" },
      { symbol: "USD/JPY", base: "USD", target: "JPY" },
      { symbol: "AUD/USD", base: "AUD", target: "USD" },
      { symbol: "NZD/USD", base: "NZD", target: "USD" },
      { symbol: "USD/CAD", base: "USD", target: "CAD" },
      { symbol: "USD/CHF", base: "USD", target: "CHF" },
      { symbol: "EUR/JPY", base: "EUR", target: "JPY" },
      { symbol: "GBP/JPY", base: "GBP", target: "JPY" },
    ];

    // Fetch latest and previous day rates from frankfurter.app (free, no key)
    const [latestResp, prevResp] = await Promise.all([
      fetch("https://api.frankfurter.app/latest?from=USD", { signal: AbortSignal.timeout(5000) }),
      fetch(`https://api.frankfurter.app/${getYesterday()}?from=USD`, { signal: AbortSignal.timeout(5000) }),
    ]);

    const latest = await latestResp.json();
    const prev = await prevResp.json();

    if (!latest.rates || !prev.rates) {
      throw new Error("No rates data from API");
    }

    // Build cross rates
    const quotes: QuoteResult[] = [];

    for (const pair of pairs) {
      try {
        const currentRate = getCrossRate(pair.base, pair.target, latest.rates);
        const prevRate = getCrossRate(pair.base, pair.target, prev.rates);

        if (currentRate && prevRate) {
          const change = currentRate - prevRate;
          const changePercent = (change / prevRate) * 100;
          quotes.push({
            symbol: pair.symbol,
            price: currentRate,
            change,
            changePercent,
          });
        }
      } catch (e) {
        console.warn(`Skipping ${pair.symbol}:`, e);
      }
    }

    // Add XAU/USD using Frankfurter (they don't have gold, so use Finnhub)
    const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY");
    if (FINNHUB_KEY) {
      try {
        // Finnhub forex candles for gold
        const now = Math.floor(Date.now() / 1000);
        const dayAgo = now - 86400;
        const goldResp = await fetch(
          `https://finnhub.io/api/v1/forex/candle?symbol=OANDA:XAU_USD&resolution=D&from=${dayAgo}&to=${now}&token=${FINNHUB_KEY}`,
          { signal: AbortSignal.timeout(5000) }
        );
        const goldData = await goldResp.json();
        if (goldData.c && goldData.c.length > 0) {
          const goldPrice = goldData.c[goldData.c.length - 1];
          const goldOpen = goldData.o ? goldData.o[goldData.o.length - 1] : goldPrice;
          quotes.unshift({
            symbol: "XAU/USD",
            price: goldPrice,
            change: goldPrice - goldOpen,
            changePercent: ((goldPrice - goldOpen) / goldOpen) * 100,
          });
        }
      } catch (e) {
        console.warn("Gold fetch failed:", e);
      }
    }

    if (quotes.length > 0) {
      cachedQuotes = quotes;
      cacheTimestamp = Date.now();
    }

    return new Response(JSON.stringify({ quotes, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("forex-ticker error:", err);
    if (cachedQuotes.length > 0) {
      return new Response(JSON.stringify({ quotes: cachedQuotes, timestamp: cacheTimestamp, stale: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // Skip weekends
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getCrossRate(base: string, target: string, rates: Record<string, number>): number | null {
  // Rates are from=USD, so rates[X] = how much X per 1 USD
  if (base === "USD") {
    return rates[target] ?? null;
  }
  if (target === "USD") {
    const baseRate = rates[base];
    return baseRate ? 1 / baseRate : null;
  }
  // Cross rate: base/target = (1/rates[base]) * rates[target]
  const baseRate = rates[base];
  const targetRate = rates[target];
  if (!baseRate || !targetRate) return null;
  return targetRate / baseRate;
}
