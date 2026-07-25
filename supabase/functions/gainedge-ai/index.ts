import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function closed(status: string) {
  return ["closed_tp3", "closed_sl", "closed_ha_flip"].includes(status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question } = await req.json();
    if (typeof question !== "string" || question.trim().length < 3 || question.length > 2000) {
      return new Response(JSON.stringify({ error: "Question must be between 3 and 2000 characters." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const [{ data: settings }, { data: trades }, { data: events }, { data: news }] = await Promise.all([
      admin.from("falconer_settings").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("falconer_trades")
        .select("symbol,timeframe,mode,execution_path,trigger_type,status,setup_score,entry_price,exit_price,pnl_usd,features,opened_at,closed_at,notes,tags")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(500),
      admin.from("falconer_engine_events")
        .select("symbol,event_type,severity,message,context,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("news_items")
        .select("headline,impact,sentiment_direction,instruments_affected,published_at,ai_reason_short")
        .order("published_at", { ascending: false })
        .limit(25),
    ]);

    const rows = trades ?? [];
    const completed = rows.filter(t => closed(t.status));
    const wins = completed.filter(t => Number(t.pnl_usd ?? 0) > 0);
    const losses = completed.filter(t => Number(t.pnl_usd ?? 0) < 0);
    const netPnl = completed.reduce((sum, t) => sum + Number(t.pnl_usd ?? 0), 0);
    const bySymbol: Record<string, { trades: number; wins: number; pnl: number }> = {};
    const bySession: Record<string, { trades: number; wins: number; pnl: number }> = {};
    const byDay: Record<string, { trades: number; wins: number; pnl: number }> = {};
    for (const trade of completed) {
      const win = Number(trade.pnl_usd ?? 0) > 0 ? 1 : 0;
      const pnl = Number(trade.pnl_usd ?? 0);
      const symbol = trade.symbol;
      const session = String((trade.features as any)?.session ?? "unknown");
      const day = String((trade.features as any)?.day_of_week ?? "unknown");
      for (const [bucket, key] of [[bySymbol, symbol], [bySession, session], [byDay, day]] as const) {
        bucket[key] ??= { trades: 0, wins: 0, pnl: 0 };
        bucket[key].trades += 1;
        bucket[key].wins += win;
        bucket[key].pnl += pnl;
      }
    }

    const evidence = {
      generated_at: new Date().toISOString(),
      strategy: "Falconer v7 TP3 long-only",
      settings,
      performance: {
        completed_trades: completed.length,
        wins: wins.length,
        losses: losses.length,
        win_rate: completed.length ? Number((wins.length / completed.length * 100).toFixed(1)) : null,
        net_pnl_usd: Number(netPnl.toFixed(2)),
        by_symbol: bySymbol,
        by_session: bySession,
        by_day_of_week_utc: byDay,
      },
      recent_trades: rows.slice(0, 30),
      recent_engine_events: events ?? [],
      recent_news: news ?? [],
    };

    const system = `You are GainEdge AI, a grounded trading-performance analyst for Falconer v7 TP3.
Answer only from the supplied evidence. Clearly distinguish observed facts from hypotheses.
Never invent live prices, news, win rates, backtests or confidence percentages.
If sample size is below 30 completed trades for a comparison, call it preliminary.
Do not promise profit or tell the user a trade is guaranteed. You may explain setups,
compare measured performance, identify risk, and suggest tests. Keep answers concise,
use NZ-friendly plain English, and state when data is insufficient.
Falconer rules are fixed: long-only, 33/33/34 exits at 1.5R/3R/5R, BE at 1R,
then two-red-Heiken-Ashi exit. AI analysis may not override the deterministic risk gate.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `EVIDENCE:\n${JSON.stringify(evidence)}\n\nQUESTION:\n${question.trim()}` },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`AI gateway returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const ai = await response.json();
    const answer = String(ai.choices?.[0]?.message?.content ?? "").trim();
    if (!answer) throw new Error("AI returned an empty answer");

    await admin.from("gainedge_ai_conversations").insert({
      user_id: userId,
      question: question.trim(),
      answer,
      evidence: {
        generated_at: evidence.generated_at,
        completed_trades: completed.length,
        recent_trades: Math.min(rows.length, 30),
        recent_news: Math.min(news?.length ?? 0, 25),
      },
      model: "google/gemini-2.5-flash-lite",
    });

    return new Response(JSON.stringify({ answer, evidence: evidence.performance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

