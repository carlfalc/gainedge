import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { api_key, insights } = await req.json();
    if (!api_key || !Array.isArray(insights) || insights.length === 0) {
      return new Response(JSON.stringify({ error: "Missing api_key or insights array" }), {
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

    const rows = insights.map((i: any) => ({
      user_id: keyRow.user_id,
      insight_type: i.insight_type,
      symbol: i.symbol ?? null,
      title: i.title,
      description: i.description,
      data: i.data ?? null,
      severity: i.severity ?? "info",
      estimated_impact: i.estimated_impact ?? null,
      week_start: i.week_start ?? null,
    }));

    const { data: inserted, error } = await supabase.from("insights").insert(rows).select("id");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      insights_inserted: inserted?.length || 0,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
