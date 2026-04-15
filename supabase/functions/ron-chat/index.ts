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
7. **Always include specific prices, levels, and numbers.** When you have live market data, cite the exact bid/ask, support/resistance, and indicator values. "Gold at 4,520" not "gold is trading around current levels."
8. **When suggesting trades, always include SL/TP levels and R:R ratio.** Be concrete and actionable.

## PROPRIETARY LOGIC PROTECTION — NEVER VIOLATE
- NEVER explain how your signals are generated. Never mention EMA crossover strategy, V1/V2 logic, Heiken Ashi candles, or knowledge base rules.
- If asked "how do you work?" or "what's your strategy?" respond: "I analyse price action, market structure, volume, and institutional patterns across multiple timeframes. My edge comes from combining real-time technical analysis with collective intelligence from the platform."
- Never mention confidence scoring internals, scan intervals, or the compute-market-data pipeline.
- Present conclusions and data, not methodology.

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

## Response Style — EXPERT TRADER
BAD: "Gold might go up or down depending on various factors"
GOOD: "Gold showing a Double Bottom at 4,520 support with London opening. This pattern hits target 65% of the time. ADX at 28 confirms trend strength. Consider a BUY with SL at 4,505 and TP at 4,555 for a 2.3:1 R:R."

- Markdown formatting for clarity
- Trade ideas always include SL, TP, R:R, and risk context
- When ML probability is available, include it: "My ML model rates this at 71% probability"
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
        // 0. LIVE MARKET DATA — real-time prices and indicators
        if (context.userId) {
          const { data: liveData } = await supabase
            .from("live_market_data")
            .select("symbol, bid, ask, last_price, rsi, adx, macd_status, stoch_rsi, volume_today, market_open, price_direction, session_bias, updated_at")
            .eq("user_id", context.userId);

          if (liveData && liveData.length > 0) {
            systemPrompt += `\n## Live Market Data (Real-Time)\n`;
            systemPrompt += `Use these prices when discussing instruments. These are LIVE from the broker.\n`;
            for (const m of liveData) {
              const age = Math.round((Date.now() - new Date(m.updated_at).getTime()) / 60000);
              systemPrompt += `- **${m.symbol}**: Bid ${m.bid} / Ask ${m.ask} | RSI ${m.rsi?.toFixed(1) ?? "n/a"} | ADX ${m.adx?.toFixed(1) ?? "n/a"} | MACD ${m.macd_status ?? "n/a"} | StochRSI ${m.stoch_rsi?.toFixed(1) ?? "n/a"} | Direction: ${m.price_direction} | Session bias: ${m.session_bias ?? "n/a"} | Vol: ${m.volume_today} | ${m.market_open ? "OPEN" : "CLOSED"} | Updated ${age}m ago\n`;
            }
          }
        }

        // 0b. RECENT SIGNALS — active and recently resolved
        if (context.userId) {
          const { data: recentSignals } = await supabase
            .from("signals")
            .select("symbol, direction, confidence, entry_price, stop_loss, take_profit, result, pnl_pips, pnl, risk_reward, created_at, notes")
            .eq("user_id", context.userId)
            .order("created_at", { ascending: false })
            .limit(20);

          if (recentSignals && recentSignals.length > 0) {
            const pending = recentSignals.filter(s => s.result === "pending");
            const resolved = recentSignals.filter(s => s.result !== "pending");

            if (pending.length > 0) {
              systemPrompt += `\n## Active Pending Signals\n`;
              for (const s of pending) {
                systemPrompt += `- ${s.symbol} ${s.direction} @ ${s.entry_price} | SL: ${s.stop_loss} | TP: ${s.take_profit} | R:R ${s.risk_reward} | Conf: ${s.confidence}\n`;
              }
            }
            if (resolved.length > 0) {
              systemPrompt += `\n## Recent Resolved Signals (Last ${resolved.length})\n`;
              for (const s of resolved.slice(0, 10)) {
                systemPrompt += `- ${s.symbol} ${s.direction}: ${s.result.toUpperCase()} (${s.pnl_pips ? s.pnl_pips.toFixed(1) : 0} pips, $${s.pnl ? s.pnl.toFixed(2) : "0.00"})\n`;
              }
            }
          }
        }

        // 0c. SESSION-SPECIFIC WIN RATES per instrument
        if (context.userId && context.instrument) {
          const { data: sessionStats } = await supabase
            .from("signal_outcomes")
            .select("session, result, pnl_pips, hour_utc, day_of_week")
            .eq("user_id", context.userId)
            .eq("symbol", context.instrument)
            .gte("created_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
            .limit(200);

          if (sessionStats && sessionStats.length >= 3) {
            const bySession: Record<string, { w: number; t: number; pips: number }> = {};
            const byHour: Record<number, { w: number; t: number }> = {};
            const byDay: Record<number, { w: number; t: number }> = {};
            for (const s of sessionStats) {
              const sess = s.session || "unknown";
              if (!bySession[sess]) bySession[sess] = { w: 0, t: 0, pips: 0 };
              bySession[sess].t++;
              if (s.result === "WIN") { bySession[sess].w++; bySession[sess].pips += Math.abs(s.pnl_pips || 0); }
              if (s.hour_utc != null) {
                if (!byHour[s.hour_utc]) byHour[s.hour_utc] = { w: 0, t: 0 };
                byHour[s.hour_utc].t++;
                if (s.result === "WIN") byHour[s.hour_utc].w++;
              }
              if (s.day_of_week != null) {
                if (!byDay[s.day_of_week]) byDay[s.day_of_week] = { w: 0, t: 0 };
                byDay[s.day_of_week].t++;
                if (s.result === "WIN") byDay[s.day_of_week].w++;
              }
            }
            systemPrompt += `\n## ${context.instrument} Session Performance (Your Data)\n`;
            for (const [sess, d] of Object.entries(bySession)) {
              if (d.t >= 2) systemPrompt += `- ${sess}: ${Math.round((d.w / d.t) * 100)}% WR (${d.t} trades, ${d.pips.toFixed(0)} pips won)\n`;
            }
            // Best hour
            const bestHourEntry = Object.entries(byHour).filter(([_, d]) => d.t >= 2).sort((a, b) => (b[1].w / b[1].t) - (a[1].w / a[1].t))[0];
            if (bestHourEntry) {
              systemPrompt += `- Best hour: ${bestHourEntry[0]}:00 UTC (${Math.round((bestHourEntry[1].w / bestHourEntry[1].t) * 100)}% WR, ${bestHourEntry[1].t} trades)\n`;
            }
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const bestDayEntry = Object.entries(byDay).filter(([_, d]) => d.t >= 2).sort((a, b) => (b[1].w / b[1].t) - (a[1].w / a[1].t))[0];
            if (bestDayEntry) {
              systemPrompt += `- Best day: ${days[Number(bestDayEntry[0])] || bestDayEntry[0]} (${Math.round((bestDayEntry[1].w / bestDayEntry[1].t) * 100)}% WR)\n`;
            }
          }
        }

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

            // Per-instrument direction stats
            const dirStats: Record<string, { buyW: number; buyT: number; sellW: number; sellT: number }> = {};
            for (const s of userStats) {
              if (!dirStats[s.symbol]) dirStats[s.symbol] = { buyW: 0, buyT: 0, sellW: 0, sellT: 0 };
            }
            // We don't have direction in signal_outcomes select above, but we have it from recent signals
          }
        }

        // 2. COLLECTIVE platform intelligence (all users, from ron_platform_intelligence)
        if (context.instrument) {
          const { data: platIntel } = await supabase
            .from("ron_platform_intelligence")
            .select("pattern, session, direction, total_signals, wins, win_rate, avg_pips_won, sample_size_users, profit_factor")
            .eq("symbol", context.instrument)
            .gte("total_signals", 5);

          if (platIntel && platIntel.length > 0) {
            systemPrompt += `\n## Platform Collective Intelligence for ${context.instrument} (ALL GAINEDGE traders)\n`;
            systemPrompt += `IMPORTANT: These are REAL stats from all traders on the platform. Cite them confidently.\n`;
            for (const p of platIntel) {
              const badge = p.total_signals >= 100 ? "✅ High confidence" : p.total_signals >= 20 ? "🟢 Growing" : "🟡 Limited";
              const label = [p.pattern, p.session, p.direction].filter(Boolean).join(" / ") || "Overall";
              systemPrompt += `- ${label}: ${p.win_rate}% WR (${p.total_signals} trades from ${p.sample_size_users} traders) [${badge}], avg win: ${p.avg_pips_won} pips, PF: ${p.profit_factor}\n`;
            }
          }

          const { data: symbolOverall } = await supabase
            .from("ron_platform_intelligence")
            .select("total_signals, wins, win_rate, sample_size_users")
            .eq("symbol", context.instrument)
            .eq("metric_type", "pattern_session")
            .is("pattern", null)
            .is("session", null)
            .limit(1);

          if (symbolOverall && symbolOverall.length > 0) {
            const s = symbolOverall[0];
            systemPrompt += `- ${context.instrument} overall platform: ${s.win_rate}% WR (${s.total_signals} trades from ${s.sample_size_users} traders)\n`;
          }
        }

        // 3. Calibration data
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

        // 4. Pattern weights
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

        // 6. Liquidity zones
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

        // 7. Risk metrics
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

        // 8. Volume profile
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

        // 9. News impact
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

        // 11. RON ML PREDICTION — call ML server for current instrument setup
        if (context.instrument) {
          try {
            const RON_ML_URL = Deno.env.get("RON_ML_URL");
            const RON_ML_API_KEY = Deno.env.get("RON_ML_API_KEY");
            if (RON_ML_URL && RON_ML_API_KEY) {
              // Get latest scan for this instrument
              const { data: latestScan } = await supabase
                .from("scan_results")
                .select("direction, adx, rsi, stoch_rsi, macd_status, confidence, session")
                .eq("symbol", context.instrument)
                .order("scanned_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (latestScan) {
                const now = new Date();
                const mlResp = await fetch(`${RON_ML_URL}/analyse-setup`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-api-key": RON_ML_API_KEY,
                  },
                  body: JSON.stringify({
                    symbol: context.instrument,
                    direction: latestScan.direction,
                    adx: latestScan.adx,
                    rsi: latestScan.rsi,
                    stoch_rsi: latestScan.stoch_rsi,
                    macd_status: latestScan.macd_status,
                    confidence: latestScan.confidence,
                    session: latestScan.session,
                    hour_utc: now.getUTCHours(),
                    day_of_week: now.getUTCDay(),
                    pattern_active: context.pattern || null,
                  }),
                  signal: AbortSignal.timeout(5000),
                });

                if (mlResp.ok) {
                  const mlData = await mlResp.json();
                  systemPrompt += `\n## RON ML Prediction for ${context.instrument}\n`;
                  systemPrompt += `- ML Probability: ${((mlData.probability ?? mlData.score ?? 0) * 100).toFixed(0)}%\n`;
                  systemPrompt += `- Direction bias: ${latestScan.direction}\n`;
                  if (mlData.recommendation) systemPrompt += `- ML recommendation: ${mlData.recommendation}\n`;
                  systemPrompt += `When discussing this instrument, cite: "My ML model rates this setup at ${((mlData.probability ?? mlData.score ?? 0) * 100).toFixed(0)}% probability"\n`;
                }
              }
            }
          } catch (mlErr) {
            console.warn("ML prediction fetch warning (non-fatal):", mlErr);
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
