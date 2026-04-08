import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOL_MAP: Record<string, string> = {
  "XAUUSD": "OANDA:XAU_USD",
  "US30": "OANDA:US30_USD",
  "NAS100": "OANDA:NAS100_USD",
  "NZDUSD": "OANDA:NZD_USD",
  "AUDUSD": "OANDA:AUD_USD",
  "EURUSD": "OANDA:EUR_USD",
  "GBPUSD": "OANDA:GBP_USD",
  "USDJPY": "OANDA:USD_JPY",
  "USDCAD": "OANDA:USD_CAD",
  "USDCHF": "OANDA:USD_CHF",
  "GBPJPY": "OANDA:GBP_JPY",
  "EURJPY": "OANDA:EUR_JPY",
  "BTCUSD": "BINANCE:BTCUSDT",
  "ETHUSD": "BINANCE:ETHUSDT",
};

const RESOLUTION_MAP: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "1H": "60", "4H": "240", "1D": "D",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { symbol, resolution, from, to } = await req.json();
    const apiKey = Deno.env.get("FINNHUB_API_KEY");
    if (!apiKey) throw new Error("FINNHUB_API_KEY not configured");

    const finnhubSymbol = SYMBOL_MAP[symbol] || symbol;
    const finnhubRes = RESOLUTION_MAP[resolution] || resolution;

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(finnhubSymbol)}&resolution=${finnhubRes}&from=${from}&to=${to}&token=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.s === "no_data" || !data.t) {
      return new Response(JSON.stringify({ candles: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candles = data.t.map((time: number, i: number) => ({
      time,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v?.[i] ?? 0,
    }));

    return new Response(JSON.stringify({ candles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
