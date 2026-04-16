import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOL_MAP: Record<string, string> = {
  "XAU-USD": "XAUUSD",
  "XAU-AUD": "XAUAUD",
  "XAG-USD": "XAGUSD",
  "AUD-USD": "AUDUSD",
  "EUR-USD": "EURUSD",
  "GBP-USD": "GBPUSD",
  "USD-JPY": "USDJPY",
  "USD-CAD": "USDCAD",
  "USD-CHF": "USDCHF",
  "NZD-USD": "NZDUSD",
  "AUD-JPY": "AUDJPY",
  "GBP-JPY": "GBPJPY",
  "EUR-JPY": "EURJPY",
  "EUR-GBP": "EURGBP",
  "EUR-NZD": "EURNZD",
  "AUD-NZD": "AUDNZD",
  "AUD-CAD": "AUDCAD",
  "NZD-CAD": "NZDCAD",
  "GBP-CAD": "GBPCAD",
  "USA500.IDX-USD": "US500",
  "LIGHT.CMD-USD": "USOIL",
  "GAS.CMD-USD": "XNGUSD",
};

function resolveSymbol(filename: string): string | null {
  for (const [prefix, symbol] of Object.entries(SYMBOL_MAP)) {
    if (filename.startsWith(prefix)) return symbol;
  }
  return null;
}

function parseCSV(text: string, symbol: string): any[] {
  const lines = text.trim().split("\n");
  const rows: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    // Skip header row
    if (i === 0 && (parts[0].toLowerCase().includes("time") || parts[0].toLowerCase().includes("date"))) {
      continue;
    }

    if (parts.length < 6) continue;

    const [ts, openStr, highStr, lowStr, closeStr, volStr] = parts;
    const open = parseFloat(openStr);
    const high = parseFloat(highStr);
    const low = parseFloat(lowStr);
    const close = parseFloat(closeStr);
    const volume = parseInt(volStr) || 0;

    // Skip malformed or zero-price candles
    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;
    if (open === 0 || high === 0 || low === 0 || close === 0) continue;

    const parsed = new Date(ts.trim());
    if (isNaN(parsed.getTime())) continue;

    rows.push({ symbol, timeframe: "1m", timestamp: parsed.toISOString(), open, high, low, close, volume });
  }

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch file list from GitHub
    const ghRes = await fetch("https://api.github.com/repos/carlfalc/ron-ml/contents/", {
      headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "GAINEDGE-Ingest" },
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      return new Response(JSON.stringify({ error: "GitHub API error", details: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const files = await ghRes.json();
    const csvFiles = (files as any[]).filter((f: any) => f.name.endsWith(".csv") && f.type === "file");

    if (csvFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No CSV files found in repo" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const details: any[] = [];
    let totalCandles = 0;

    // 2. Process each CSV
    for (const file of csvFiles) {
      const symbol = resolveSymbol(file.name);
      if (!symbol) {
        details.push({ file: file.name, status: "skipped", reason: "unknown symbol prefix" });
        continue;
      }

      // Download raw CSV using raw.githubusercontent.com
      const rawUrl = `https://raw.githubusercontent.com/carlfalc/ron-ml/main/${encodeURIComponent(file.name)}`;
      const csvRes = await fetch(rawUrl);
      if (!csvRes.ok) {
        details.push({ file: file.name, symbol, status: "error", reason: "download failed" });
        continue;
      }

      const csvText = await csvRes.text();
      const rows = parseCSV(csvText, symbol);

      if (rows.length === 0) {
        details.push({ file: file.name, symbol, status: "empty", parsed: 0 });
        continue;
      }

      // 3. Bulk insert in batches of 100
      let stored = 0;
      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error, count } = await supabase
          .from("candle_history")
          .upsert(batch, { onConflict: "symbol,timeframe,timestamp", ignoreDuplicates: true, count: "exact" });

        if (error) {
          console.error(`Batch insert error for ${file.name}:`, error.message);
        } else {
          stored += count || batch.length;
        }
      }

      totalCandles += stored;
      details.push({ file: file.name, symbol, status: "ok", parsed: rows.length, stored });
    }

    return new Response(JSON.stringify({
      success: true,
      total_files: csvFiles.length,
      total_candles_stored: totalCandles,
      details,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Ingest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
