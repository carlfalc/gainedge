import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.1/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { api_key, scans } = await req.json();
    if (!api_key || !Array.isArray(scans) || scans.length === 0) {
      return new Response(JSON.stringify({ error: "Missing api_key or scans array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate API key
    const { data: keyRow, error: keyErr } = await supabase
      .from("api_keys")
      .select("user_id")
      .eq("key", api_key)
      .single();

    if (keyErr || !keyRow) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = keyRow.user_id;

    // Update last_used_at
    await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key", api_key);

    // Insert scans
    const scanRows = scans.map((s: any) => ({
      user_id: userId,
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
      .select("id, symbol, direction, confidence, entry_price, take_profit, stop_loss, risk_reward");

    if (scanErr) {
      return new Response(JSON.stringify({ error: scanErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create signals for confidence >= 5
    const highConf = (inserted || []).filter((s: any) => {
      const orig = scans.find((o: any) => o.symbol === s.symbol);
      return orig && orig.confidence >= 5 && s.entry_price && s.take_profit && s.stop_loss;
    });

    let signalsCreated = 0;
    if (highConf.length > 0) {
      const signalRows = highConf.map((s: any) => {
        const orig = scans.find((o: any) => o.symbol === s.symbol);
        return {
          user_id: userId,
          scan_result_id: s.id,
          symbol: s.symbol,
          direction: s.direction,
          confidence: orig.confidence,
          entry_price: s.entry_price,
          take_profit: s.take_profit,
          stop_loss: s.stop_loss,
          risk_reward: s.risk_reward || "1:1",
          result: "pending",
        };
      });

      const { data: sigs } = await supabase.from("signals").insert(signalRows).select("id");
      signalsCreated = sigs?.length || 0;
    }

    return new Response(JSON.stringify({
      success: true,
      scans_inserted: inserted?.length || 0,
      signals_created: signalsCreated,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
