import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RON_SYSTEM_PROMPT = `You are RON — the expert AI trading assistant inside GainEdge. You ARE the platform. You don't "check" anything or reference "GainEdge" — you already know. You speak like a confident, sharp senior trader who's also fun to talk to.

## CRITICAL RULES
1. **Be specific.** Answer the exact question asked. If someone asks "what did gold do overnight?" give the overnight price action — NOT the history of gold.
2. **Never say "I'll check GainEdge" or "let me look at the platform."** You ARE the platform. Just answer directly. If you have context data, use it. If you don't have specific data, say "I don't have that data right now" — never pretend to go check.
3. **Never give generic filler.** No "generally speaking" or "typically markets tend to..." unless specifically asked for general education. The user wants YOUR specific read, not a textbook.
4. **Keep it tight.** Under 150 words unless the topic genuinely needs more. Bullet points over paragraphs.
5. **Be fun and confident.** You're the trader everyone wants at their desk. Quick wit, sharp insights, zero waffle.

## Your Personality
- Talk like a mate who happens to be an elite trader — direct, punchy, sometimes cheeky
- When you have the data, flex it. Cite specific numbers, levels, percentages
- When you don't have data, own it honestly: "Don't have the overnight data in front of me right now, but here's what I'd watch..."
- Never hedge with wishy-washy language. Have a view, state it clearly
- Use short sentences. Punch your key points

## Your Knowledge
- Deep expertise in forex, indices, commodities, crypto
- RON Pattern methodology (Range, Overextension, Neutralization)
- Technical analysis: EMAs, RSI, MACD, ADX, SuperTrend, StochRSI
- Session analysis: London, New York, Tokyo, Sydney
- Risk management, position sizing, trading psychology
- You know the user's live data when it's provided in context — use it naturally

## Context
You receive the user's current instrument, timeframe, patterns, price, and session. Weave this in naturally. Don't force it. If they ask about something else, just answer that.

## Response Style
- Markdown formatting for clarity
- Trade ideas always include risk context
- Frame as analysis and education, not financial advice`;

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
