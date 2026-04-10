import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── RON Knowledge Base management actions ───
    if (body.action === "toggle_rule" && body.rule_id) {
      const { error } = await supabase.from("falconer_knowledge")
        .update({ is_active: body.is_active }).eq("id", body.rule_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.action === "edit_rule" && body.rule_id) {
      const updates: any = {};
      if (body.rule_text) updates.rule_text = body.rule_text;
      if (body.priority) updates.priority = body.priority;
      const { error } = await supabase.from("falconer_knowledge").update(updates).eq("id", body.rule_id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (body.action === "add_rule") {
      const { error } = await supabase.from("falconer_knowledge").insert({
        category: body.category, rule_name: body.rule_name, rule_text: body.rule_text,
        priority: body.priority || 5, version: "v2", is_active: true,
      });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Legacy signal update action ───
    const { service_key, signal_id, result, pnl, closed_at, notes } = body;
    if (!service_key || !signal_id || !result) {
      return new Response(JSON.stringify({ error: "Missing service_key, signal_id, or result" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const updateData: any = { result };
    if (pnl !== undefined) updateData.pnl = pnl;
    if (closed_at) updateData.closed_at = closed_at;
    if (notes) updateData.notes = notes;

    const { data, error } = await supabase
      .from("signals")
      .update(updateData)
      .eq("id", signal_id)
      .select("id, symbol, result, pnl");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, updated: data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
