import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { service_key, target, insights } = await req.json();
    if (!service_key || !Array.isArray(insights) || insights.length === 0) {
      return new Response(JSON.stringify({ error: "Missing service_key or insights array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    let totalInserted = 0;

    for (const insight of insights) {
      let userIds: string[] = [];

      if (!target || target === "all") {
        if (insight.symbol) {
          const { data: instruments } = await supabase
            .from("user_instruments")
            .select("user_id")
            .eq("symbol", insight.symbol);
          userIds = (instruments || []).map((i: any) => i.user_id);
        } else {
          const { data: profiles } = await supabase.from("profiles").select("id");
          userIds = (profiles || []).map((p: any) => p.id);
        }
      } else {
        userIds = [target];
      }

      if (userIds.length === 0) continue;

      const rows = userIds.map((uid) => ({
        user_id: uid,
        insight_type: insight.insight_type,
        symbol: insight.symbol || null,
        title: insight.title,
        description: insight.description,
        data: insight.data || null,
        severity: insight.severity || "info",
        estimated_impact: insight.estimated_impact || null,
        week_start: insight.week_start || null,
      }));

      const { data: inserted, error } = await supabase.from("insights").insert(rows).select("id");
      if (!error) totalInserted += inserted?.length || 0;
    }

    return new Response(JSON.stringify({ success: true, insights_inserted: totalInserted }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
