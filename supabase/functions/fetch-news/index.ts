import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const INSTRUMENT_KEYWORDS: Record<string, string[]> = {
  XAUUSD: ["gold", "xauusd", "precious metal", "safe haven", "bullion"],
  OIL: ["oil", "crude", "opec", "wti", "brent", "petroleum"],
  NAS100: ["nas100", "nasdaq", "tech stock", "s&p", "tech earning", "silicon valley"],
  US30: ["us30", "dow jones", "dow", "industrial"],
  AUDUSD: ["aud", "australian", "rba", "iron ore", "china pmi", "aussie"],
  NZDUSD: ["nzd", "new zealand", "rbnz", "dairy", "kiwi"],
};

const MULTI_INSTRUMENT_KEYWORDS: Record<string, string[]> = {
  "tariff,trade war,china": ["NAS100", "AUDUSD", "XAUUSD"],
  "geopolitical,war,conflict,bomb,attack,iran": ["XAUUSD", "OIL"],
};

const USD_KEYWORDS = ["usd", "fed", "federal reserve", "inflation", "cpi", "nfp", "jobs", "fomc", "interest rate"];

const HIGH_KEYWORDS = ["central bank", "rate decision", "geopolitical", "war", "attack", "emergency", "crash", "crisis", "fed", "rba", "rbnz", "boe", "ecb", "boj", "cpi", "nfp", "jobs report"];
const MEDIUM_KEYWORDS = ["earnings", "pmi", "gdp", "trade balance", "retail sales", "housing"];

function detectInstruments(text: string): string[] {
  const lower = text.toLowerCase();
  const instruments = new Set<string>();

  for (const [symbol, keywords] of Object.entries(INSTRUMENT_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) instruments.add(symbol);
  }

  for (const [keyStr, syms] of Object.entries(MULTI_INSTRUMENT_KEYWORDS)) {
    if (keyStr.split(",").some(k => lower.includes(k))) {
      syms.forEach(s => instruments.add(s));
    }
  }

  if (USD_KEYWORDS.some(k => lower.includes(k))) {
    ["XAUUSD", "AUDUSD", "NZDUSD", "US30", "NAS100"].forEach(s => instruments.add(s));
  }

  return Array.from(instruments);
}

function detectImpact(text: string): string {
  const lower = text.toLowerCase();
  if (HIGH_KEYWORDS.some(k => lower.includes(k))) return "high";
  if (MEDIUM_KEYWORDS.some(k => lower.includes(k))) return "medium";
  return "low";
}

interface NewsCandidate {
  headline: string;
  source: string;
  published_at: string;
  instruments_affected: string[];
  impact: string;
}

async function fetchFinnhub(apiKey: string): Promise<NewsCandidate[]> {
  const results: NewsCandidate[] = [];
  try {
    for (const category of ["general", "forex"]) {
      const res = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=${apiKey}`);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      for (const item of (data || []).slice(0, 15)) {
        const text = `${item.headline} ${item.summary || ""}`;
        results.push({
          headline: item.headline,
          source: item.source || "Finnhub",
          published_at: new Date(item.datetime * 1000).toISOString(),
          instruments_affected: detectInstruments(text),
          impact: detectImpact(text),
        });
      }
    }
  } catch (e) { console.error("Finnhub error:", e); }
  return results;
}

async function fetchAlphaVantage(apiKey: string): Promise<NewsCandidate[]> {
  const results: NewsCandidate[] = [];
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=FOREX:AUD,FOREX:NZD,FOREX:USD,COMMODITY:GOLD&apikey=${apiKey}`);
    if (!res.ok) { await res.text(); return results; }
    const data = await res.json();
    for (const item of (data.feed || []).slice(0, 10)) {
      const text = `${item.title} ${item.summary || ""}`;
      const instruments = detectInstruments(text);

      // Use ticker sentiment to enrich
      if (item.ticker_sentiment) {
        for (const ts of item.ticker_sentiment) {
          const ticker = ts.ticker || "";
          if (ticker.includes("XAU") || ticker.includes("GOLD")) instruments.push("XAUUSD");
          if (ticker.includes("AUD")) instruments.push("AUDUSD");
          if (ticker.includes("NZD")) instruments.push("NZDUSD");
        }
      }

      results.push({
        headline: item.title,
        source: item.source || "Alpha Vantage",
        published_at: item.time_published
          ? `${item.time_published.slice(0,4)}-${item.time_published.slice(4,6)}-${item.time_published.slice(6,8)}T${item.time_published.slice(9,11)}:${item.time_published.slice(11,13)}:00Z`
          : new Date().toISOString(),
        instruments_affected: [...new Set(instruments)],
        impact: detectImpact(text),
      });
    }
  } catch (e) { console.error("AlphaVantage error:", e); }
  return results;
}

async function fetchMarketaux(apiKey: string): Promise<NewsCandidate[]> {
  const results: NewsCandidate[] = [];
  try {
    const res = await fetch(`https://api.marketaux.com/v1/news/all?filter_entities=true&language=en&api_token=${apiKey}`);
    if (!res.ok) { await res.text(); return results; }
    const data = await res.json();
    for (const item of (data.data || []).slice(0, 10)) {
      const text = `${item.title} ${item.description || ""}`;
      const instruments = detectInstruments(text);

      if (item.entities) {
        for (const entity of item.entities) {
          const sym = (entity.symbol || "").toUpperCase();
          if (sym.includes("XAU") || sym.includes("GLD")) instruments.push("XAUUSD");
          if (sym.includes("AUD")) instruments.push("AUDUSD");
        }
      }

      results.push({
        headline: item.title,
        source: item.source || "Marketaux",
        published_at: item.published_at || new Date().toISOString(),
        instruments_affected: [...new Set(instruments)],
        impact: detectImpact(text),
      });
    }
  } catch (e) { console.error("Marketaux error:", e); }
  return results;
}

function deduplicateNews(items: NewsCandidate[]): NewsCandidate[] {
  const seen = new Set<string>();
  return items.filter(item => {
    // Normalize: lowercase, remove punctuation, take first 60 chars
    const key = item.headline.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY") || "";
    const alphaKey = Deno.env.get("ALPHA_VANTAGE_API_KEY") || "";
    const marketauxKey = Deno.env.get("MARKETAUX_API_KEY") || "";

    // Fetch from all sources in parallel
    const [finnhubNews, alphaNews, marketauxNews] = await Promise.all([
      fetchFinnhub(finnhubKey),
      fetchAlphaVantage(alphaKey),
      fetchMarketaux(marketauxKey),
    ]);

    const allNews = deduplicateNews([...finnhubNews, ...alphaNews, ...marketauxNews]);

    // Insert into Supabase using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get existing headlines from last 24h to avoid re-inserting
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("news_items")
      .select("headline")
      .gte("published_at", since);

    const existingHeadlines = new Set((existing || []).map((e: { headline: string }) =>
      e.headline.toLowerCase().slice(0, 60)
    ));

    const newItems = allNews.filter(n =>
      !existingHeadlines.has(n.headline.toLowerCase().slice(0, 60))
    );

    let inserted = 0;
    if (newItems.length > 0) {
      const rows = newItems.map(n => ({
        headline: n.headline.slice(0, 500),
        source: n.source,
        impact: n.impact,
        instruments_affected: n.instruments_affected,
        published_at: n.published_at,
      }));

      const { error } = await supabase.from("news_items").insert(rows);
      if (error) console.error("Insert error:", error);
      else inserted = rows.length;
    }

    // Clean up old news (older than 48h)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await supabase.from("news_items").delete().lt("published_at", cutoff);

    return new Response(
      JSON.stringify({
        success: true,
        fetched: { finnhub: finnhubNews.length, alphaVantage: alphaNews.length, marketaux: marketauxNews.length },
        deduplicated: allNews.length,
        inserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fetch-news error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
