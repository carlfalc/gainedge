import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assertReadSafe,
  buildDecisionView,
  DecisionReadError,
} from "../_shared/ron-decision-read.ts";

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

/** Exact-pair validation. No mapping, aliasing, normalization or inference. */
function validatePair(rawInstrument: unknown, rawTimeframe: unknown):
  | { kind: "absent" }
  | { kind: "invalid"; message: string }
  | { kind: "pair"; instrument: string; timeframe: string } {
  const iPresent = rawInstrument !== undefined && rawInstrument !== null;
  const tPresent = rawTimeframe !== undefined && rawTimeframe !== null;
  if (!iPresent && !tPresent) return { kind: "absent" };
  if (!iPresent || !tPresent) {
    return { kind: "invalid", message: "instrument and timeframe must both be supplied." };
  }
  if (typeof rawInstrument !== "string" || typeof rawTimeframe !== "string") {
    return { kind: "invalid", message: "instrument and timeframe must be strings." };
  }
  const instrument = rawInstrument.trim();
  const timeframe = rawTimeframe.trim();
  for (const value of [instrument, timeframe]) {
    if (value.length === 0 || value.length > 16) {
      return { kind: "invalid", message: "instrument and timeframe must be 1-16 characters." };
    }
  }
  return { kind: "pair", instrument, timeframe };
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
    const role = (claimsData?.claims as Record<string, unknown> | undefined)?.role;
    if (claimsError || !userId || role !== "authenticated") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { question } = body;
    if (typeof question !== "string" || question.trim().length < 3 || question.length > 2000) {
      return new Response(JSON.stringify({ error: "Question must be between 3 and 2000 characters." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pair = validatePair(body?.instrument, body?.timeframe);
    if (pair.kind === "invalid") {
      return new Response(JSON.stringify({ error: pair.message }), {
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
    } as Record<string, unknown>;

    // Read-only persisted RON projection. Only when an exact pair was supplied.
    if (pair.kind === "pair") {
      const requested_pair = { instrument: pair.instrument, timeframe: pair.timeframe };
      let ronBlock: Record<string, unknown> = { ron_decision_available: false, requested_pair };
      try {
        const { data: decisions, error: dErr } = await admin
          .from("ron_orchestrator_decisions")
          .select("*")
          .eq("instrument", pair.instrument)
          .eq("timeframe", pair.timeframe)
          .order("as_of", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);
        if (!dErr && decisions?.length) {
          const row = decisions[0] as Record<string, unknown>;
          const { data: links, error: lErr } = await admin
            .from("ron_decision_evidence")
            .select("decision_id,evidence_hash,ordinal,authority_rank,agent_id")
            .eq("decision_id", row.decision_id as string);
          if (!lErr) {
            const hashes = (links ?? []).map((l) => l.evidence_hash as string);
            const { data: evidenceRows, error: eErr } = await admin
              .from("ron_agent_evidence")
              .select("*")
              .in("evidence_hash", hashes.length ? hashes : ["__none__"]);
            if (!eErr) {
              const view = buildDecisionView(
                row,
                (links ?? []) as Record<string, unknown>[],
                (evidenceRows ?? []) as Record<string, unknown>[],
              );
              assertReadSafe(view);
              ronBlock = { ron_decision_available: true, requested_pair, view };
            }
          }
        }
      } catch (ronError) {
        // Fail closed: never expose a partial or unverified RON view.
        if (!(ronError instanceof DecisionReadError)) {
          // Non-contract read failures are also treated as unavailable.
        }
        ronBlock = { ron_decision_available: false, requested_pair };
      }
      evidence.ron = ronBlock;
    }

    const system = `You are GainEdge AI, a grounded trading-performance analyst for Falconer v7 TP3.
Answer only from the supplied evidence. Clearly distinguish observed facts from hypotheses.
Never invent live prices, news, win rates, backtests or confidence percentages.
If sample size is below 30 completed trades for a comparison, call it preliminary.
Do not promise profit or tell the user a trade is guaranteed. You may explain setups,
compare measured performance, identify risk, and suggest tests. Keep answers concise,
use NZ-friendly plain English, and state when data is insufficient.
Falconer rules are fixed: long-only, 33/33/34 exits at 1.5R/3R/5R, BE at 1R,
then two-red-Heiken-Ashi exit. AI analysis may not override the deterministic risk gate.

RON persisted-record rules (when a ron block is present in the evidence):
- Persisted RON records are descriptive stored evidence, not a calibrated probability.
- Never invent numeric probability, confidence, likelihood, odds, rankings, causal claims,
  profitability or certainty of any kind.
- If RON evidence is unavailable, say plainly that it is unavailable instead of inferring it.
- numeric_probability is null and probability_status is not_calibrated.
- execution_path is signal_only, execution_allowed is false, and no broker order placement
  occurs from this surface.
- Do not override or reinterpret the stored RON decision or evidence.`;

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

