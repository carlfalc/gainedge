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

    // 3. Generate hourly insights from intelligence findings
    const findings = Array.isArray(intelligenceData) ? intelligenceData : [];
    let insightsCreated = 0;

    // Get all user IDs for broadcasting platform insights
    const { data: allUsers } = await supabase.from("profiles").select("id").limit(500);
    const userIds = (allUsers || []).map((u: any) => u.id);

    for (const finding of findings) {
      if (!finding || !finding.type) continue;

      let title = "";
      let description = "";
      let symbol: string | null = null;

      if (finding.type === "best_session" && finding.win_rate > 60) {
        title = `📊 ${finding.symbol} performs best in ${finding.session}`;
        description = `${finding.symbol} has a ${finding.win_rate}% win rate during ${finding.session} session (${finding.total} trades). Consider focusing your trading on this session.`;
        symbol = finding.symbol;
      } else if (finding.type === "confidence_performance") {
        if (finding.confidence >= 7 && finding.win_rate > 65) {
          title = `🎯 High-confidence signals performing well`;
          description = `Confidence ${finding.confidence}+ signals are winning ${finding.win_rate}% of the time (${finding.total} trades). RON's high-conviction calls are reliable.`;
        } else if (finding.confidence <= 5 && finding.win_rate > 65) {
          title = `⚠️ Low-confidence signals surprisingly strong`;
          description = `Confidence ${finding.confidence} signals winning at ${finding.win_rate}% (${finding.total} trades). RON may be under-rating these setups.`;
        }
      } else if (finding.type === "pattern_performance" && finding.total >= 5) {
        title = `🧠 ${finding.pattern} on ${finding.symbol}: ${finding.win_rate}% win rate`;
        description = `${finding.pattern} pattern on ${finding.symbol} has won ${finding.win_rate}% of ${finding.total} trades, averaging ${finding.avg_pips || 0} pips per win.`;
        symbol = finding.symbol;
      }

      if (title && description) {
        // Insert for a sample of users (first 50 to avoid spam)
        const targetUsers = userIds.slice(0, 50);
        for (const userId of targetUsers) {
          // Deduplicate: don't insert same insight within 24h
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
              user_id: userId,
              insight_type: "ron_intelligence",
              title,
              description,
              symbol,
              severity: "info",
              data: finding,
            });
            insightsCreated++;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      findings: findings.length,
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
