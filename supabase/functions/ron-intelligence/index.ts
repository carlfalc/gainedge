import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Run intelligence refresh (calibration + pattern weights)
    const { data: intelligenceData, error: intErr } = await supabase.rpc("refresh_ron_intelligence");
    if (intErr) console.error("Intelligence refresh error:", intErr);

    // 2. Cleanup old candles (180 days)
    const { error: cleanupErr } = await supabase.rpc("cleanup_old_candles");
    if (cleanupErr) console.error("Candle cleanup error:", cleanupErr);

    // 3. Zone respect rate analysis
    let zoneStats: any[] = [];
    try {
      const { data: zones } = await supabase
        .from("liquidity_zones")
        .select("symbol, zone_type, respected, status")
        .in("status", ["active", "broken", "filled"]);

      if (zones && zones.length > 0) {
        const zoneMap: Record<string, { respected: number; broken: number; total: number }> = {};
        for (const z of zones) {
          const key = `${z.symbol}:${z.zone_type}`;
          if (!zoneMap[key]) zoneMap[key] = { respected: 0, broken: 0, total: 0 };
          zoneMap[key].total++;
          if (z.respected === true) zoneMap[key].respected++;
          if (z.status === "broken") zoneMap[key].broken++;
        }
        zoneStats = Object.entries(zoneMap)
          .filter(([, s]) => s.total >= 3)
          .map(([key, s]) => {
            const [symbol, zoneType] = key.split(":");
            return { symbol, zone_type: zoneType, respect_rate: Math.round((s.respected / s.total) * 100), total: s.total };
          });
      }
    } catch (e) { console.warn("Zone analysis error:", e); }

    // 4. News impact analysis
    let newsImpactStats: any[] = [];
    try {
      const { data: impacts } = await supabase
        .from("news_impact_results")
        .select("symbol, direction, magnitude_pips")
        .not("magnitude_pips", "is", null)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (impacts && impacts.length > 0) {
        const impactMap: Record<string, { totalPips: number; count: number; ups: number; downs: number }> = {};
        for (const imp of impacts) {
          if (!impactMap[imp.symbol]) impactMap[imp.symbol] = { totalPips: 0, count: 0, ups: 0, downs: 0 };
          impactMap[imp.symbol].totalPips += Math.abs(imp.magnitude_pips || 0);
          impactMap[imp.symbol].count++;
          if (imp.direction === "up") impactMap[imp.symbol].ups++;
          if (imp.direction === "down") impactMap[imp.symbol].downs++;
        }
        newsImpactStats = Object.entries(impactMap)
          .filter(([, s]) => s.count >= 3)
          .map(([symbol, s]) => ({
            symbol,
            avg_magnitude_pips: +(s.totalPips / s.count).toFixed(1),
            bullish_bias: Math.round((s.ups / s.count) * 100),
            total_events: s.count,
          }));
      }
    } catch (e) { console.warn("News impact analysis error:", e); }

    // 5. MTF alignment analysis
    let mtfStats: any[] = [];
    try {
      const { data: mtfOutcomes } = await supabase
        .from("signal_outcomes")
        .select("mtf_alignment, result")
        .not("mtf_alignment", "is", null)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (mtfOutcomes && mtfOutcomes.length > 0) {
        const mtfMap: Record<string, { wins: number; total: number }> = {};
        for (const o of mtfOutcomes) {
          const a = o.mtf_alignment!;
          if (!mtfMap[a]) mtfMap[a] = { wins: 0, total: 0 };
          mtfMap[a].total++;
          if (o.result === "WIN") mtfMap[a].wins++;
        }
        mtfStats = Object.entries(mtfMap)
          .filter(([, s]) => s.total >= 3)
          .map(([alignment, s]) => ({
            alignment,
            win_rate: Math.round((s.wins / s.total) * 100),
            total: s.total,
          }));
      }
    } catch (e) { console.warn("MTF analysis error:", e); }

    // 6. Generate hourly insights from ALL intelligence findings
    const findings = Array.isArray(intelligenceData) ? intelligenceData : [];
    let insightsCreated = 0;

    const { data: allUsers } = await supabase.from("profiles").select("id").limit(500);
    const userIds = (allUsers || []).map((u: any) => u.id);
    const targetUsers = userIds.slice(0, 50);

    // Helper: insert insight with dedup
    async function insertInsight(userId: string, title: string, description: string, symbol: string | null) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("insights")
        .select("id")
        .eq("user_id", userId)
        .eq("title", title)
        .gte("created_at", oneDayAgo)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("insights").insert({
          user_id: userId, insight_type: "ron_intelligence",
          title, description, symbol, severity: "info",
        });
        insightsCreated++;
      }
    }

    // Intelligence findings from refresh_ron_intelligence
    for (const finding of findings) {
      if (!finding || !finding.type) continue;
      let title = "", description = "";
      let symbol: string | null = null;

      if (finding.type === "best_session" && finding.win_rate > 60) {
        title = `📊 ${finding.symbol} performs best in ${finding.session}`;
        description = `${finding.symbol} has a ${finding.win_rate}% win rate during ${finding.session} session (${finding.total} trades).`;
        symbol = finding.symbol;
      } else if (finding.type === "confidence_performance") {
        if (finding.confidence >= 7 && finding.win_rate > 65) {
          title = `🎯 High-confidence signals performing well`;
          description = `Confidence ${finding.confidence}+ signals are winning ${finding.win_rate}% of the time (${finding.total} trades).`;
        }
      } else if (finding.type === "pattern_performance" && finding.total >= 5) {
        title = `🧠 ${finding.pattern} on ${finding.symbol}: ${finding.win_rate}% win rate`;
        description = `${finding.pattern} on ${finding.symbol} has won ${finding.win_rate}% of ${finding.total} trades, avg ${finding.avg_pips || 0} pips.`;
        symbol = finding.symbol;
      }

      if (title && description) {
        for (const userId of targetUsers) await insertInsight(userId, title, description, symbol);
      }
    }

    // Zone respect insights
    for (const zs of zoneStats) {
      if (zs.respect_rate >= 70) {
        const title = `🏗️ ${zs.symbol} ${zs.zone_type.replace(/_/g, " ")}s hold ${zs.respect_rate}%`;
        const desc = `${zs.zone_type.replace(/_/g, " ")} zones on ${zs.symbol} are respected ${zs.respect_rate}% of the time (${zs.total} zones tracked).`;
        for (const userId of targetUsers) await insertInsight(userId, title, desc, zs.symbol);
      }
    }

    // News impact insights
    for (const ni of newsImpactStats) {
      if (ni.avg_magnitude_pips > 10) {
        const title = `📰 ${ni.symbol} moves avg ${ni.avg_magnitude_pips} pips after news`;
        const desc = `${ni.symbol} reacts with avg ${ni.avg_magnitude_pips} pip moves after news events. Bullish bias: ${ni.bullish_bias}% (${ni.total_events} events).`;
        for (const userId of targetUsers) await insertInsight(userId, title, desc, ni.symbol);
      }
    }

    // MTF alignment insights
    for (const ms of mtfStats) {
      const title = `📐 MTF ${ms.alignment}: ${ms.win_rate}% win rate`;
      const desc = `Signals with ${ms.alignment.replace(/_/g, " ")} multi-timeframe alignment win ${ms.win_rate}% (${ms.total} trades).`;
      for (const userId of targetUsers) await insertInsight(userId, title, desc, null);
    }

    return new Response(JSON.stringify({
      success: true,
      findings: findings.length,
      zone_stats: zoneStats.length,
      news_impact_stats: newsImpactStats.length,
      mtf_stats: mtfStats.length,
      insights_created: insightsCreated,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ron-intelligence error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
