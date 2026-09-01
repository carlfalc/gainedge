import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  DEFAULT_STRATEGY_LAB_COSTS,
  isStrategyLabMarket,
  isStrategyLabTimeframe,
  STRATEGY_LAB_VERSION,
  type StrategyLabCostModel,
} from "../_shared/strategy-lab-contracts.ts";
import {
  type LabCandle,
  runStrategyLab,
} from "../_shared/strategy-lab-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_CANDLES = 50_000;

type LooseTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

type StrategyLabDatabase = {
  public: {
    Tables: {
      candle_history: LooseTable;
      strategy_lab_runs: LooseTable;
      strategy_lab_candidates: LooseTable;
      strategy_lab_agent_runs: LooseTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type StrategyLabClient = SupabaseClient<StrategyLabDatabase>;

interface RequestBody {
  symbol: string;
  timeframe: string;
  period_start: string;
  period_end: string;
  initial_equity?: number;
  risk_percent?: number;
  costs?: Partial<StrategyLabCostModel>;
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function finiteInRange(
  value: unknown,
  fallback: number,
  low: number,
  high: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(low, Math.min(high, parsed))
    : fallback;
}

async function loadCandles(
  db: StrategyLabClient,
  symbol: string,
  timeframe: string,
  periodStart: string,
  periodEnd: string,
): Promise<LabCandle[]> {
  const candles: LabCandle[] = [];
  let cursor = periodStart;
  while (candles.length < MAX_CANDLES) {
    const remaining = Math.min(1_000, MAX_CANDLES - candles.length);
    const { data, error } = await db.from("candle_history")
      .select("timestamp,open,high,low,close,volume")
      .eq("symbol", symbol)
      .eq("timeframe", timeframe)
      .gte("timestamp", cursor)
      .lte("timestamp", periodEnd)
      .order("timestamp", { ascending: true })
      .limit(remaining);
    if (error) throw new Error(`candle_read_failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      candles.push({
        time: new Date(String(row.timestamp)).getTime(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume ?? 0),
      });
    }
    if (data.length < remaining) break;
    cursor = new Date(
      new Date(String(data[data.length - 1].timestamp)).getTime() + 1,
    ).toISOString();
  }
  return candles;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let runId: string | null = null;
  let db: StrategyLabClient | null = null;
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const token = authorization.slice("Bearer ".length);
    const authClient = createClient<StrategyLabDatabase>(
      SUPABASE_URL,
      ANON_KEY,
      {
        global: { headers: { Authorization: authorization } },
      },
    );
    const { data: claims, error: claimsError } = await authClient.auth
      .getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsError || !userId) return json({ error: "unauthorized" }, 401);

    const body = await request.json() as RequestBody;
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const timeframe = String(body.timeframe ?? "").trim();
    if (!isStrategyLabMarket(symbol)) {
      return json({ error: "unsupported_symbol", symbol }, 400);
    }
    if (!isStrategyLabTimeframe(timeframe)) {
      return json({ error: "unsupported_timeframe", timeframe }, 400);
    }
    const startMs = Date.parse(body.period_start);
    const endMs = Date.parse(body.period_end);
    if (
      !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs
    ) {
      return json({ error: "invalid_period" }, 400);
    }

    const initialEquity = finiteInRange(
      body.initial_equity,
      10_000,
      100,
      10_000_000,
    );
    const riskPercent = finiteInRange(body.risk_percent, 1, 0.1, 3);
    const costs: StrategyLabCostModel = {
      spread_bps: finiteInRange(
        body.costs?.spread_bps,
        DEFAULT_STRATEGY_LAB_COSTS.spread_bps,
        0,
        100,
      ),
      commission_bps: finiteInRange(
        body.costs?.commission_bps,
        DEFAULT_STRATEGY_LAB_COSTS.commission_bps,
        0,
        100,
      ),
      slippage_bps: finiteInRange(
        body.costs?.slippage_bps,
        DEFAULT_STRATEGY_LAB_COSTS.slippage_bps,
        0,
        100,
      ),
    };

    db = createClient<StrategyLabDatabase>(SUPABASE_URL, SERVICE_ROLE_KEY);
    const requestConfig = {
      strategy_lab_version: STRATEGY_LAB_VERSION,
      initial_equity: initialEquity,
      risk_percent: riskPercent,
      costs,
      max_candles: MAX_CANDLES,
      selection_source: "validation_only",
      holdout_role: "confirmation_only",
    };
    const { data: run, error: runError } = await db.from("strategy_lab_runs")
      .insert({
        user_id: userId,
        symbol,
        timeframe,
        period_start: new Date(startMs).toISOString(),
        period_end: new Date(endMs).toISOString(),
        request_config: requestConfig,
        status: "running",
        execution_allowed: false,
      }).select("id").single();
    if (runError || !run) {
      throw new Error(`run_create_failed: ${runError?.message ?? "unknown"}`);
    }
    runId = String(run.id);

    const candles = await loadCandles(
      db,
      symbol,
      timeframe,
      new Date(startMs).toISOString(),
      new Date(endMs).toISOString(),
    );
    const result = runStrategyLab(candles, {
      initialEquity,
      riskFraction: riskPercent / 100,
      costs,
    });
    const finalStatus = result.audit.sourceGatePassed ? "complete" : "blocked";

    if (result.candidates.length) {
      const candidateRows = result.candidates.map((candidate) => ({
        run_id: runId,
        candidate_key: candidate.candidate.id,
        family: candidate.candidate.family,
        candidate_version: 1,
        rank: candidate.rank,
        selected: candidate.selected,
        promotion_eligible: candidate.promotionEligible,
        validation_score: candidate.validationScore,
        config: candidate.candidate,
        train_metrics: candidate.train,
        validation_metrics: candidate.validation,
        holdout_metrics: candidate.holdout,
        promotion_reasons: candidate.promotionReasons,
        explanation: candidate.explanation,
      }));
      const { error } = await db.from("strategy_lab_candidates").insert(
        candidateRows,
      );
      if (error) throw new Error(`candidate_persist_failed: ${error.message}`);
    }
    const { error: agentError } = await db.from("strategy_lab_agent_runs")
      .insert(
        result.agentRuns.map((agent) => ({
          run_id: runId,
          agent_id: agent.agentId,
          agent_version: agent.agentVersion,
          status: agent.status,
          detail: agent.detail,
          output: {
            candle_count: candles.length,
            source_gate_passed: result.audit.sourceGatePassed,
          },
        })),
      );
    if (agentError) {
      throw new Error(`agent_persist_failed: ${agentError.message}`);
    }

    const { error: completeError } = await db.from("strategy_lab_runs").update({
      status: finalStatus,
      candle_count: candles.length,
      data_audit: result.audit,
      champion_candidate_key: result.champion?.candidate.id ?? null,
      champion_promotion_eligible: result.champion?.promotionEligible ?? false,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    if (completeError) {
      throw new Error(`run_complete_failed: ${completeError.message}`);
    }

    return json({
      run_id: runId,
      symbol,
      timeframe,
      execution_allowed: false,
      status: finalStatus,
      audit: result.audit,
      agents: result.agentRuns,
      champion: result.champion,
      candidates: result.candidates.slice(0, 10),
      champion_trades: result.championTrades.slice(0, 500),
      equity_curve: result.equityCurve.slice(-500),
      disclosure:
        "Historical research only. Promotion eligibility is not approval or a promise of future profitability.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (db && runId) {
      await db.from("strategy_lab_runs").update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return json({
      error: "strategy_lab_failed",
      detail: message,
      execution_allowed: false,
    }, 500);
  }
});
