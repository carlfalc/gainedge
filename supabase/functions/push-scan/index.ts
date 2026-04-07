import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { service_key, target, scans } = await req.json();
    if (!service_key || !Array.isArray(scans) || scans.length === 0) {
      return new Response(JSON.stringify({ error: "Missing service_key or scans array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate platform service key
    const { data: config, error: configErr } = await supabase
      .from("platform_config")
      .select("service_key")
      .eq("service_key", service_key)
      .single();

    if (configErr || !config) {
      return new Response(JSON.stringify({ error: "Invalid service key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalScansInserted = 0;
    let totalSignalsCreated = 0;

    for (const s of scans) {
      // Determine target users
      let userIds: string[] = [];

      if (!target || target === "all") {
        // Find all users who have this symbol in their watchlist
        const { data: instruments } = await supabase
          .from("user_instruments")
          .select("user_id")
          .eq("symbol", s.symbol);
        userIds = (instruments || []).map((i: any) => i.user_id);
      } else {
        // Specific user
        userIds = [target];
      }

      if (userIds.length === 0) continue;

      // Build scan rows for all target users
      const scanRows = userIds.map((uid) => ({
        user_id: uid,
        symbol: s.symbol,
        timeframe: s.timeframe || "15",
        candle_type: s.candle_type || "heiken_ashi",
        direction: s.direction,
        confidence: s.confidence,
        entry_price: s.entry_price ?? null,
        take_profit: s.take_profit ?? null,
        stop_loss: s.stop_loss ?? null,
        risk_reward: s.risk_reward ?? null,
        adx: s.adx ?? null,
        rsi: s.rsi ?? null,
        macd_status: s.macd_status ?? null,
        stoch_rsi: s.stoch_rsi ?? null,
        ema_fast_value: s.ema_fast_value ?? null,
        ema_slow_value: s.ema_slow_value ?? null,
        ema_crossover_status: s.ema_crossover_status || "NONE",
        ema_crossover_direction: s.ema_crossover_direction ?? null,
        supertrend_status: s.supertrend_status ?? null,
        verdict: s.verdict,
        reasoning: s.reasoning,
        session: s.session,
      }));

      const { data: inserted, error: scanErr } = await supabase
        .from("scan_results")
        .insert(scanRows)
        .select("id, user_id, symbol, direction, confidence, entry_price, take_profit, stop_loss, risk_reward");

      if (scanErr) {
        console.error("Scan insert error:", scanErr.message);
        continue;
      }

      totalScansInserted += inserted?.length || 0;

      // Create signals for confidence >= 5
      const highConf = (inserted || []).filter((r: any) =>
        s.confidence >= 5 && r.entry_price && r.take_profit && r.stop_loss
      );

      if (highConf.length > 0) {
        const signalRows = highConf.map((r: any) => ({
          user_id: r.user_id,
          scan_result_id: r.id,
          symbol: r.symbol,
          direction: r.direction,
          confidence: s.confidence,
          entry_price: r.entry_price,
          take_profit: r.take_profit,
          stop_loss: r.stop_loss,
          risk_reward: r.risk_reward || "1:1",
          result: "pending",
        }));

        const { data: sigs } = await supabase.from("signals").insert(signalRows).select("id");
        totalSignalsCreated += sigs?.length || 0;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      scans_inserted: totalScansInserted,
      signals_created: totalSignalsCreated,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
