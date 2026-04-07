import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { api_key, signal_id, result, pnl, closed_at, notes } = await req.json();
    if (!api_key || !signal_id || !result) {
      return new Response(JSON.stringify({ error: "Missing api_key, signal_id, or result" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validResults = ["pending", "win", "loss", "breakeven", "cancelled"];
    if (!validResults.includes(result)) {
      return new Response(JSON.stringify({ error: `Invalid result. Must be one of: ${validResults.join(", ")}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key", api_key);

    // Verify signal belongs to user
    const { data: signal } = await supabase
      .from("signals")
      .select("id")
      .eq("id", signal_id)
      .eq("user_id", keyRow.user_id)
      .single();

    if (!signal) {
      return new Response(JSON.stringify({ error: "Signal not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updateData: any = { result };
    if (pnl !== undefined) updateData.pnl = pnl;
    if (closed_at) updateData.closed_at = closed_at;
    if (notes) updateData.notes = notes;

    const { error } = await supabase
      .from("signals")
      .update(updateData)
      .eq("id", signal_id)
      .eq("user_id", keyRow.user_id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
