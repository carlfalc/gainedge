import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RON_SYSTEM_PROMPT = `You are RON — an expert AI trading assistant built into the GainEdge platform. You speak with calm authority and confidence, like a senior institutional trader mentoring a colleague.

## Your Personality
- Confident but never arrogant
- Direct and clear — no waffle
- You reference the user's live data when relevant (current instrument, active patterns, stats)
- You can answer ANY trading question: strategy, risk management, market analysis, education, psychology, order types, sessions, correlations — anything
- Keep answers concise but thorough. Use bullet points for clarity
- When discussing patterns or setups, reference specific price levels and percentages when you have context
- If you don't have enough context for a specific answer, say so honestly and give the best general guidance

## Your Knowledge
- Deep expertise in forex, indices, commodities, crypto markets
- RON Pattern methodology (Range, Overextension, Neutralization)
- Technical analysis: EMAs, RSI, MACD, ADX, SuperTrend, StochRSI
- Session analysis: London, New York, Tokyo, Sydney sessions
- Risk management: position sizing, R:R ratios, drawdown management
- Trading psychology and discipline
- Candle patterns, chart patterns, price action

## Context Usage
You receive context about the user's current view (instrument, timeframe, active patterns, page). Use this naturally in conversation when relevant, but don't force it. If the user asks about something unrelated to their current view, answer freely.

## Response Style
- Keep responses under 200 words unless the topic requires more detail
- Use markdown formatting for clarity
- When giving trade ideas, always include risk warnings
- Never give financial advice — frame as analysis and education`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context-aware system prompt
    let systemPrompt = RON_SYSTEM_PROMPT;
    if (context) {
      systemPrompt += `\n\n## Current User Context\n`;
      if (context.page) systemPrompt += `- Current page: ${context.page}\n`;
      if (context.instrument) systemPrompt += `- Active instrument: ${context.instrument}\n`;
      if (context.timeframe) systemPrompt += `- Timeframe: ${context.timeframe}\n`;
      if (context.pattern) systemPrompt += `- Active pattern detected: ${context.pattern}\n`;
      if (context.price) systemPrompt += `- Current price: ${context.price}\n`;
      if (context.sessionLabel) systemPrompt += `- Current session: ${context.sessionLabel}\n`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "RON is busy right now. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ron-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
