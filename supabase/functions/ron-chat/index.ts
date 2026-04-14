import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
6. **Use YOUR data.** When you have intelligence data (win rates, pattern stats, session performance), cite specific numbers. These are REAL stats from the platform — flex them.

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
- You have access to REAL platform intelligence: win rates, pattern performance, session analytics, confidence calibration — use these in your answers

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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Build context-aware system prompt
    let systemPrompt = RON_SYSTEM_PROMPT;
    if (context) {
      systemPrompt += `\n\n## Current User Context\n`;
      if (context.userName) {
        systemPrompt += `- User's name: ${context.userName}\n`;
        systemPrompt += `- IMPORTANT: When starting a NEW conversation (first message), greet the user by name with a time-appropriate greeting. User's local hour is ${context.localHour ?? "unknown"} (24h). Use "Good morning" (5-11), "Good afternoon" (12-16), "Good evening" (17-20), or just "Hey" (21-4). For follow-up messages in the same conversation, don't repeat the greeting — just answer naturally.\n`;
      }
      if (context.page) systemPrompt += `- Current page: ${context.page}\n`;
      if (context.instrument) systemPrompt += `- Active instrument: ${context.instrument}\n`;
      if (context.timeframe) systemPrompt += `- Timeframe: ${context.timeframe}\n`;
      if (context.pattern) systemPrompt += `- Active pattern detected: ${context.pattern}\n`;
      if (context.price) systemPrompt += `- Current price: ${context.price}\n`;
      if (context.sessionLabel) systemPrompt += `- Current session: ${context.sessionLabel}\n`;

      // ─── INTELLIGENCE DATA: Real stats from ML pipeline ───
      try {
        // 1. User's personal signal outcomes (last 30 days)
        if (context.userId) {
          const { data: userStats } = await supabase
            .from("signal_outcomes")
            .select("result, pnl_pips, symbol, pattern_active, session, confidence")
            .eq("user_id", context.userId)
            .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .limit(200);

          if (userStats && userStats.length > 0) {
            const total = userStats.length;
            const wins = userStats.filter(s => s.result === "WIN").length;
            const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0";
            const avgPips = userStats.filter(s => s.result === "WIN").reduce((s, r) => s + (r.pnl_pips || 0), 0) / Math.max(wins, 1);

            systemPrompt += `\n## User's Personal Performance (Last 30 Days)\n`;
            systemPrompt += `- Total signals: ${total}, Wins: ${wins}, Win Rate: ${winRate}%\n`;
            systemPrompt += `- Avg pips per win: ${avgPips.toFixed(1)}\n`;

            // Best symbol
            const symbolStats: Record<string, { wins: number; total: number }> = {};
            for (const s of userStats) {
              if (!symbolStats[s.symbol]) symbolStats[s.symbol] = { wins: 0, total: 0 };
              symbolStats[s.symbol].total++;
              if (s.result === "WIN") symbolStats[s.symbol].wins++;
            }
            const bestSymbol = Object.entries(symbolStats).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];
            if (bestSymbol && bestSymbol[1].total >= 3) {
              systemPrompt += `- Best instrument: ${bestSymbol[0]} (${((bestSymbol[1].wins / bestSymbol[1].total) * 100).toFixed(0)}% win rate, ${bestSymbol[1].total} trades)\n`;
            }
          }
        }

        // 2. Platform-wide pattern stats (for the current instrument)
        if (context.instrument) {
          const { data: platStats } = await supabase
            .from("signal_outcomes")
            .select("pattern_active, result, pnl_pips, session")
            .eq("symbol", context.instrument)
            .not("pattern_active", "is", null)
            .gte("created_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
            .limit(500);

          if (platStats && platStats.length > 0) {
            const patternMap: Record<string, { wins: number; total: number; avgPips: number[] }> = {};
            for (const s of platStats) {
              const p = s.pattern_active!;
              if (!patternMap[p]) patternMap[p] = { wins: 0, total: 0, avgPips: [] };
              patternMap[p].total++;
              if (s.result === "WIN") {
                patternMap[p].wins++;
                patternMap[p].avgPips.push(Math.abs(s.pnl_pips || 0));
              }
            }

            systemPrompt += `\n## Platform Pattern Intelligence for ${context.instrument}\n`;
            for (const [pattern, stats] of Object.entries(patternMap)) {
              if (stats.total >= 3) {
                const wr = ((stats.wins / stats.total) * 100).toFixed(0);
                const avgP = stats.avgPips.length > 0 ? (stats.avgPips.reduce((a, b) => a + b, 0) / stats.avgPips.length).toFixed(1) : "N/A";
                systemPrompt += `- ${pattern}: ${wr}% win rate (${stats.total} trades), avg win: ${avgP} pips\n`;
              }
            }
          }
        }

        // 3. Calibration data — confidence performance
        const { data: calibration } = await supabase
          .from("ron_calibration")
          .select("confidence_level, win_rate, total_signals, recommended_action")
          .order("confidence_level", { ascending: true });

        if (calibration && calibration.length > 0) {
          systemPrompt += `\n## RON Confidence Calibration\n`;
          for (const c of calibration) {
            systemPrompt += `- Confidence ${c.confidence_level}: ${c.win_rate}% win rate (${c.total_signals} trades) — ${c.recommended_action}\n`;
          }
        }

        // 4. Pattern weights — learned adjustments
        if (context.instrument) {
          const { data: weights } = await supabase
            .from("pattern_weights")
            .select("pattern_name, session, win_rate, total, avg_pips, weight_adjustment")
            .eq("symbol", context.instrument)
            .gte("total", 3);

          if (weights && weights.length > 0) {
            systemPrompt += `\n## Learned Pattern Weights for ${context.instrument}\n`;
            for (const w of weights) {
              const adj = w.weight_adjustment > 0 ? "BOOSTED" : w.weight_adjustment < 0 ? "REDUCED" : "NEUTRAL";
              systemPrompt += `- ${w.pattern_name} (${w.session || "all sessions"}): ${w.win_rate}% WR, ${w.avg_pips} avg pips, ${adj} weight\n`;
            }
          }
        }

        // 5. Recent intelligence insights
        const { data: recentIntel } = await supabase
          .from("insights")
          .select("title, description")
          .eq("insight_type", "ron_intelligence")
          .order("created_at", { ascending: false })
          .limit(5);

        if (recentIntel && recentIntel.length > 0) {
          systemPrompt += `\n## Recent RON Intelligence Findings\n`;
          for (const i of recentIntel) {
            systemPrompt += `- ${i.title}: ${i.description}\n`;
          }
        }

        // 6. Liquidity zones for current instrument
        if (context.instrument) {
          const { data: activeZones } = await supabase
            .from("liquidity_zones")
            .select("zone_type, price_high, price_low, tested_count, respected, status")
            .eq("symbol", context.instrument)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(10);

          if (activeZones && activeZones.length > 0) {
            systemPrompt += `\n## Active Liquidity Zones for ${context.instrument}\n`;
            for (const z of activeZones) {
              systemPrompt += `- ${z.zone_type.replace(/_/g, " ")}: ${z.price_low}–${z.price_high} (tested ${z.tested_count}x${z.respected ? ", respected" : ""})\n`;
            }
          }
        }

        // 7. Risk metrics for user
        if (context.userId) {
          const { data: riskMetrics } = await supabase
            .from("ron_risk_metrics")
            .select("symbol, consecutive_losses, max_drawdown_pips, current_drawdown_pips, equity_peak, equity_current, risk_mode")
            .eq("user_id", context.userId);

          if (riskMetrics && riskMetrics.length > 0) {
            const inDrawdown = riskMetrics.some(r => r.risk_mode === "conservative");
            systemPrompt += `\n## User Risk Status\n`;
            if (inDrawdown) {
              systemPrompt += `- ⚠️ CONSERVATIVE MODE: User has consecutive losses. Be more cautious with recommendations.\n`;
            }
            for (const r of riskMetrics) {
              if (r.consecutive_losses >= 2 || r.current_drawdown_pips > 0) {
                systemPrompt += `- ${r.symbol}: ${r.consecutive_losses} consecutive losses, DD ${r.current_drawdown_pips} pips\n`;
              }
            }
          }
        }

        // 8. Volume profile for current instrument
        if (context.instrument) {
          const today = new Date().toISOString().split("T")[0];
          const { data: volProfile } = await supabase
            .from("volume_profile_daily")
            .select("poc_price, value_area_high, value_area_low, total_volume")
            .eq("symbol", context.instrument)
            .eq("profile_date", today)
            .maybeSingle();

          if (volProfile) {
            systemPrompt += `\n## Today's Volume Profile for ${context.instrument}\n`;
            systemPrompt += `- POC: ${volProfile.poc_price}, VA: ${volProfile.value_area_low}–${volProfile.value_area_high}\n`;
          }
        }

        // 9. News impact intelligence
        if (context.instrument) {
          const { data: newsImpact } = await supabase
            .from("news_impact_results")
            .select("magnitude_pips, direction")
            .eq("symbol", context.instrument)
            .not("magnitude_pips", "is", null)
            .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

          if (newsImpact && newsImpact.length >= 3) {
            const avgMag = newsImpact.reduce((s, n) => s + Math.abs(n.magnitude_pips || 0), 0) / newsImpact.length;
            const bullish = newsImpact.filter(n => n.direction === "up").length;
            systemPrompt += `\n## News Impact on ${context.instrument}\n`;
            systemPrompt += `- Avg move: ${avgMag.toFixed(1)} pips, Bullish bias: ${Math.round((bullish / newsImpact.length) * 100)}% (${newsImpact.length} events)\n`;
          }
        }

        // 10. MTF alignment stats
        const { data: mtfOutcomes } = await supabase
          .from("signal_outcomes")
          .select("mtf_alignment, result")
          .not("mtf_alignment", "is", null)
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(200);

        if (mtfOutcomes && mtfOutcomes.length >= 5) {
          const mtfMap: Record<string, { w: number; t: number }> = {};
          for (const o of mtfOutcomes) {
            const a = o.mtf_alignment!;
            if (!mtfMap[a]) mtfMap[a] = { w: 0, t: 0 };
            mtfMap[a].t++;
            if (o.result === "WIN") mtfMap[a].w++;
          }
          systemPrompt += `\n## MTF Alignment Performance\n`;
          for (const [alignment, s] of Object.entries(mtfMap)) {
            if (s.t >= 3) systemPrompt += `- ${alignment.replace(/_/g, " ")}: ${Math.round((s.w / s.t) * 100)}% WR (${s.t})\n`;
          }
        }
      } catch (intErr) {
        console.warn("Intelligence data fetch warning:", intErr);
        // Non-fatal — continue without intelligence data
      }
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
