import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// ─── HARD DENYLIST ───
const HARD_DENYLIST = [
  "login", "sign in", "signin", "captcha", "bot check", "making sure you",
  "register", "cookie policy", "privacy policy", "terms of service",
  "careers", "contact us", "about us", "forum", "community",
  "template", "inspiration", "design thinking", "ux design",
  "startup lessons", "account settings", "subscribe now",
  "unsubscribe", "404", "page not found", "access denied",
  "forbidden", "verify your email", "reset password",
];

// ─── SOFT ALLOWLIST ───
const SOFT_ALLOWLIST = [
  "fed", "fomc", "powell", "ecb", "lagarde", "boj", "ueda", "rbnz", "rba",
  "pboc", "boe", "inflation", "cpi", "ppi", "nfp", "payrolls", "non-farm",
  "rates", "rate decision", "rate cut", "rate hike", "yields", "treasury",
  "gold", "xauusd", "bullion", "xau",
  "nasdaq", "nas100", "us30", "dow", "s&p", "spx", "hk50", "hang seng",
  "crude", "oil", "wti", "brent", "opec",
  "btc", "bitcoin", "eth", "ethereum",
  "sanctions", "war", "conflict", "geopolitical", "tariff", "trade war",
  "gdp", "pmi", "unemployment", "retail sales", "earnings",
  "recession", "dxy", "dollar index",
  "usd", "eur", "gbp", "jpy", "aud", "nzd", "cad", "chf",
  "eurusd", "gbpusd", "usdjpy", "audusd", "nzdusd",
];

// ─── INSTRUMENT KEYWORD MAP ───
const INSTRUMENT_KEYWORDS: Record<string, string[]> = {
  XAUUSD: ["gold", "xauusd", "xau", "precious metal", "safe haven", "bullion", "gold price"],
  OIL: ["oil", "crude", "opec", "wti", "brent", "petroleum", "energy"],
  NAS100: ["nas100", "nasdaq", "tech stock", "tech sector", "silicon valley", "ai stock", "chip"],
  US30: ["us30", "dow jones", "dow", "industrial", "blue chip"],
  AUDUSD: ["aud", "australian", "rba", "iron ore", "china pmi", "aussie", "audusd"],
  NZDUSD: ["nzd", "new zealand", "rbnz", "dairy", "kiwi", "nzdusd"],
  EURUSD: ["eur", "euro", "ecb", "lagarde", "eurozone", "eurusd"],
  GBPUSD: ["gbp", "pound", "sterling", "boe", "bank of england", "gbpusd"],
  USDJPY: ["jpy", "yen", "boj", "japan", "usdjpy"],
  HK50: ["hk50", "hang seng", "hong kong", "hsi"],
  BTCUSD: ["btc", "bitcoin"],
  ETHUSD: ["eth", "ethereum"],
  USDCAD: ["cad", "canadian", "loonie", "bank of canada", "usdcad"],
  USDCHF: ["chf", "swiss", "snb", "usdchf", "franc"],
  XAGUSD: ["silver", "xagusd", "xag"],
  SPX500: ["spx", "s&p 500", "s&p500", "sp500"],
};

const MULTI_INSTRUMENT_KEYWORDS: Record<string, string[]> = {
  "tariff,trade war,china,sanctions": ["NAS100", "AUDUSD", "XAUUSD", "HK50"],
  "geopolitical,war,conflict,bomb,attack,iran,missile": ["XAUUSD", "OIL"],
  "recession,financial crisis,credit crunch": ["XAUUSD", "US30", "NAS100"],
};

const USD_KEYWORDS = [
  "usd", "fed", "federal reserve", "inflation", "cpi", "nfp", "fomc",
  "interest rate", "rate decision", "powell", "treasury", "dxy", "dollar index",
  "payrolls", "non-farm",
];

const HIGH_KEYWORDS = [
  "central bank", "rate decision", "rate cut", "rate hike",
  "geopolitical", "war", "attack", "emergency", "crash", "crisis",
  "fed", "rba", "rbnz", "boe", "ecb", "boj", "pboc",
  "cpi", "nfp", "non-farm", "jobs report", "fomc",
  "sanctions", "tariff",
];
const MEDIUM_KEYWORDS = [
  "earnings", "pmi", "gdp", "trade balance", "retail sales",
  "housing", "unemployment", "consumer confidence", "manufacturing",
  "opec", "recession", "yields", "treasury",
];

const BULLISH_KEYWORDS = [
  "surge", "rally", "soar", "jump", "rise", "gain", "boost",
  "beat", "exceed", "strong", "bullish", "dovish", "stimulus",
  "rate cut", "easing", "recovery", "rebound",
];
const BEARISH_KEYWORDS = [
  "fall", "drop", "plunge", "crash", "decline", "slide", "slump",
  "miss", "weak", "bearish", "hawkish", "tighten", "rate hike",
  "sell-off", "selloff", "recession", "contraction", "war", "sanctions",
];

const INSTRUMENT_SENTIMENT_OVERRIDES: Record<string, { bullish: string[]; bearish: string[] }> = {
  XAUUSD: {
    bullish: ["risk-off", "war", "conflict", "geopolitical", "dovish", "rate cut", "weak dollar", "inflation rise", "crisis"],
    bearish: ["hawkish", "rate hike", "strong dollar", "risk-on", "yields rise"],
  },
  NAS100: {
    bullish: ["rate cut", "dovish", "stimulus", "ai", "tech rally", "beat earnings"],
    bearish: ["rate hike", "hawkish", "war", "tariff", "sanctions", "regulation"],
  },
  US30: {
    bullish: ["rate cut", "infrastructure", "stimulus", "jobs beat"],
    bearish: ["rate hike", "tariff", "trade war", "recession"],
  },
};

// ═══════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════

interface RawArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface ProcessedArticle {
  headline: string;
  source: string;
  published_at: string;
  instruments_affected: string[];
  impact: string;
  sentiment_direction: string;
  ai_reason_short: string | null;
}

// ═══════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════

function normalizeArticle(raw: {
  title?: string; summary?: string; source?: string; url?: string; publishedAt?: string;
}): RawArticle | null {
  let title = (raw.title || "").replace(/<[^>]*>/g, "").trim();
  let summary = (raw.summary || "").replace(/<[^>]*>/g, "").trim();
  const source = (raw.source || "Unknown").trim();
  const url = (raw.url || "").trim();
  const publishedAt = raw.publishedAt || new Date().toISOString();
  if (!title || title.length < 10) return null;
  if (/^(home|index|page|untitled|null|undefined)$/i.test(title)) return null;
  title = title.slice(0, 500);
  summary = summary.slice(0, 1000);
  return { title, summary, source, url, publishedAt };
}

function isOnDenylist(article: RawArticle): boolean {
  const text = `${article.title} ${article.summary} ${article.url} ${article.source}`.toLowerCase();
  return HARD_DENYLIST.some(term => text.includes(term));
}

function isRelevantMarketNews(article: RawArticle): boolean {
  if (isOnDenylist(article)) return false;
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const allowlistHits = SOFT_ALLOWLIST.filter(k => text.includes(k));
  if (allowlistHits.length >= 1) return true;
  for (const keywords of Object.values(INSTRUMENT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return true;
  }
  return false;
}

function scoreMarketRelevance(article: RawArticle): "irrelevant" | "low" | "medium" | "high" {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  if (HIGH_KEYWORDS.some(k => text.includes(k))) return "high";
  if (MEDIUM_KEYWORDS.some(k => text.includes(k))) return "medium";
  const hits = SOFT_ALLOWLIST.filter(k => text.includes(k)).length;
  if (hits >= 3) return "medium";
  if (hits >= 1) return "low";
  return "irrelevant";
}

function detectAffectedInstruments(article: RawArticle, subscriberInstruments?: string[]): string[] {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const instruments = new Set<string>();

  for (const [symbol, keywords] of Object.entries(INSTRUMENT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) instruments.add(symbol);
  }
  for (const [keyStr, syms] of Object.entries(MULTI_INSTRUMENT_KEYWORDS)) {
    if (keyStr.split(",").some(k => text.includes(k))) {
      syms.forEach(s => instruments.add(s));
    }
  }
  if (USD_KEYWORDS.some(k => text.includes(k))) {
    ["XAUUSD", "AUDUSD", "NZDUSD", "US30", "NAS100", "EURUSD", "GBPUSD", "USDJPY"].forEach(s => instruments.add(s));
  }

  const result = Array.from(instruments);
  if (subscriberInstruments && subscriberInstruments.length > 0) {
    const filtered = result.filter(s => subscriberInstruments.includes(s));
    return filtered.length > 0 ? filtered : result;
  }
  return result;
}

function classifyArticleSentiment(article: RawArticle, instruments: string[]): string {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  for (const instr of instruments) {
    const overrides = INSTRUMENT_SENTIMENT_OVERRIDES[instr];
    if (overrides) {
      if (overrides.bullish.some(k => text.includes(k))) return "bullish";
      if (overrides.bearish.some(k => text.includes(k))) return "bearish";
    }
  }
  const bullishHits = BULLISH_KEYWORDS.filter(k => text.includes(k)).length;
  const bearishHits = BEARISH_KEYWORDS.filter(k => text.includes(k)).length;
  if (bullishHits > bearishHits) return "bullish";
  if (bearishHits > bullishHits) return "bearish";
  return "neutral";
}

function shouldInsertNewsItem(item: ProcessedArticle): boolean {
  if (item.impact === "irrelevant") return false;
  if (item.impact === "low") return false;
  if (item.instruments_affected.length > 0) return true;
  if (item.impact === "medium" || item.impact === "high") return true;
  return false;
}

function processArticle(raw: {
  title?: string; summary?: string; source?: string; url?: string; publishedAt?: string;
}): ProcessedArticle | null {
  const normalized = normalizeArticle(raw);
  if (!normalized) return null;
  if (!isRelevantMarketNews(normalized)) return null;
  const impact = scoreMarketRelevance(normalized);
  if (impact === "irrelevant") return null;
  const instruments = detectAffectedInstruments(normalized);
  const sentiment = classifyArticleSentiment(normalized, instruments);
  const processed: ProcessedArticle = {
    headline: normalized.title,
    source: normalized.source,
    published_at: normalized.publishedAt,
    instruments_affected: instruments,
    impact,
    sentiment_direction: sentiment,
    ai_reason_short: null,
  };
  if (!shouldInsertNewsItem(processed)) return null;
  return processed;
}

// ═══════════════════════════════════════════
//  AI REASONING GENERATION
// ═══════════════════════════════════════════

async function generateAIReasons(articles: ProcessedArticle[]): Promise<void> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || articles.length === 0) return;

  // Build a single batch prompt for efficiency
  const articleSummaries = articles.map((a, i) => 
    `[${i}] Headline: "${a.headline}" | Instruments: ${a.instruments_affected.join(", ")} | Sentiment: ${a.sentiment_direction} | Impact: ${a.impact}`
  ).join("\n");

  const systemPrompt = `You are a concise market analyst for a trading terminal. For each numbered article below, write ONE short explanation (max 25 words) of WHY the news affects the listed instruments. 

Rules:
- Use cautious language: "may support", "could pressure", "may weigh on", "may lift"
- Never say "will definitely", "guaranteed", "confirmed buy/sell"
- Explain the macro transmission mechanism (e.g. inflation → rates → USD → gold)
- Be beginner-friendly and plain English
- If multiple instruments: explain the shared macro driver first, then the effect
- Do NOT just restate the headline

Respond with ONLY a JSON array of strings, one per article, in the same order. Example:
["Softer inflation may revive rate-cut hopes, supporting equities and weighing on the US dollar.", "Geopolitical tension may boost safe-haven gold demand and pressure risk assets."]`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: articleSummaries },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("AI response not parseable as JSON array:", content.slice(0, 200));
      return;
    }

    const reasons: string[] = JSON.parse(jsonMatch[0]);
    
    for (let i = 0; i < Math.min(reasons.length, articles.length); i++) {
      if (reasons[i] && typeof reasons[i] === "string") {
        articles[i].ai_reason_short = reasons[i].slice(0, 300);
      }
    }
  } catch (e) {
    console.error("AI reasoning generation error:", e);
  }
}

// ═══════════════════════════════════════════
//  API FETCHERS
// ═══════════════════════════════════════════

async function fetchFinnhub(apiKey: string): Promise<ProcessedArticle[]> {
  if (!apiKey) return [];
  const results: ProcessedArticle[] = [];
  try {
    for (const category of ["general", "forex"]) {
      const res = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=${apiKey}`);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      for (const item of (data || []).slice(0, 15)) {
        const processed = processArticle({
          title: item.headline,
          summary: item.summary || "",
          source: item.source || "Finnhub",
          url: item.url || "",
          publishedAt: new Date(item.datetime * 1000).toISOString(),
        });
        if (processed) results.push(processed);
      }
    }
  } catch (e) { console.error("Finnhub error:", e); }
  return results;
}

async function fetchAlphaVantage(apiKey: string): Promise<ProcessedArticle[]> {
  if (!apiKey) return [];
  const results: ProcessedArticle[] = [];
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=FOREX:AUD,FOREX:NZD,FOREX:USD,COMMODITY:GOLD&apikey=${apiKey}`);
    if (!res.ok) { await res.text(); return results; }
    const data = await res.json();
    for (const item of (data.feed || []).slice(0, 10)) {
      const publishedAt = item.time_published
        ? `${item.time_published.slice(0,4)}-${item.time_published.slice(4,6)}-${item.time_published.slice(6,8)}T${item.time_published.slice(9,11)}:${item.time_published.slice(11,13)}:00Z`
        : new Date().toISOString();
      const processed = processArticle({
        title: item.title,
        summary: item.summary || "",
        source: item.source || "Alpha Vantage",
        url: item.url || "",
        publishedAt,
      });
      if (processed) results.push(processed);
    }
  } catch (e) { console.error("AlphaVantage error:", e); }
  return results;
}

async function fetchMarketaux(apiKey: string): Promise<ProcessedArticle[]> {
  if (!apiKey) return [];
  const results: ProcessedArticle[] = [];
  try {
    const res = await fetch(`https://api.marketaux.com/v1/news/all?filter_entities=true&language=en&api_token=${apiKey}`);
    if (!res.ok) { await res.text(); return results; }
    const data = await res.json();
    for (const item of (data.data || []).slice(0, 10)) {
      const processed = processArticle({
        title: item.title,
        summary: item.description || "",
        source: item.source || "Marketaux",
        url: item.url || "",
        publishedAt: item.published_at || new Date().toISOString(),
      });
      if (processed) results.push(processed);
    }
  } catch (e) { console.error("Marketaux error:", e); }
  return results;
}

// ═══════════════════════════════════════════
//  DEDUP & CLEANUP
// ═══════════════════════════════════════════

function deduplicateNews(items: ProcessedArticle[]): ProcessedArticle[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.headline.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function cleanupIrrelevantNews(supabase: ReturnType<typeof createClient>) {
  // Purge ALL low-impact items regardless of age
  await supabase.from("news_items").delete().eq("impact", "low");

  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await supabase.from("news_items").delete().lt("published_at", cutoff48h);
}

// ═══════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY") || "";
    const alphaKey = Deno.env.get("ALPHA_VANTAGE_API_KEY") || "";
    const marketauxKey = Deno.env.get("MARKETAUX_API_KEY") || "";

    const [finnhubNews, alphaNews, marketauxNews] = await Promise.all([
      fetchFinnhub(finnhubKey),
      fetchAlphaVantage(alphaKey),
      fetchMarketaux(marketauxKey),
    ]);

    const allNews = deduplicateNews([...finnhubNews, ...alphaNews, ...marketauxNews]);

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
      e.headline.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60).trim()
    ));

    const newItems = allNews.filter(n =>
      !existingHeadlines.has(n.headline.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60).trim())
    );

    // Generate AI explanations for new items
    if (newItems.length > 0) {
      await generateAIReasons(newItems);
    }

    let inserted = 0;
    if (newItems.length > 0) {
      const rows = newItems.map(n => ({
        headline: n.headline.slice(0, 500),
        source: n.source,
        impact: n.impact,
        instruments_affected: n.instruments_affected,
        published_at: n.published_at,
        sentiment_direction: n.sentiment_direction,
        ai_reason_short: n.ai_reason_short,
      }));

      const { error } = await supabase.from("news_items").insert(rows);
      if (error) console.error("Insert error:", error);
      else inserted = rows.length;
    }

    await cleanupIrrelevantNews(supabase);

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
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
