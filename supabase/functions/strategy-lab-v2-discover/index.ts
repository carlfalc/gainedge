import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  DEFAULT_STRATEGY_LAB_V2_COSTS,
  isStrategyLabV2Agent,
  isStrategyLabV2Market,
  isStrategyLabV2Timeframe,
  STRATEGY_LAB_V2_EXECUTION_ALLOWED,
  STRATEGY_LAB_V2_GRAMMAR_VERSION,
  STRATEGY_LAB_V2_SEARCH_AGENTS,
  STRATEGY_LAB_V2_SEARCH_BUDGETS,
  STRATEGY_LAB_V2_VERSION,
  type StrategyGenomeV2,
  type StrategyLabV2CandidateResult,
  type StrategyLabV2Costs,
  type StrategyLabV2SearchDepth,
} from "../_shared/strategy-lab-v2-contracts.ts";
import {
  auditStrategyLabV2Candles,
  finaliseStrategyLabV2,
  searchStrategyLabV2Agent,
  type StrategyLabV2Candle,
} from "../_shared/strategy-lab-v2-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENGINE_COMMIT = Deno.env.get("GIT_COMMIT_SHA") ?? "strategy-lab-v2-discovery";
const MAX_CANDLES = 120_000;

// V2 tables are introduced by this feature's migration and therefore are not in the
// generated application Database type until the next schema-codegen pass.
type DbClient = SupabaseClient;

interface RequestBody {
  action: "start" | "run_agent" | "finalise" | "status" | "cancel";
  run_id?: string;
  agent_id?: string;
  symbol?: string;
  timeframe?: string;
  period_start?: string;
  period_end?: string;
  search_depth?: StrategyLabV2SearchDepth;
  random_seed?: number;
  risk_percent?: number;
  costs?: Partial<StrategyLabV2Costs>;
}

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const finite = (value: unknown, fallback: number, low: number, high: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(low, Math.min(high, parsed)) : fallback;
};

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getClaims(token);
  return error ? null : data?.claims?.sub as string | undefined ?? null;
}

async function loadCandles(
  db: DbClient,
  symbol: string,
  timeframe: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ candles: StrategyLabV2Candle[]; truncated: boolean }> {
  const candles: StrategyLabV2Candle[] = [];
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
    if (error) throw new Error(`candle_read_failed:${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      candles.push({
        time: new Date(String(row.timestamp)).getTime(),
        open: Number(row.open), high: Number(row.high), low: Number(row.low),
        close: Number(row.close), volume: Number(row.volume ?? 0),
      });
    }
    if (data.length < remaining) break;
    cursor = new Date(new Date(String(data.at(-1)?.timestamp)).getTime() + 1).toISOString();
  }
  return { candles, truncated: candles.length === MAX_CANDLES };
}

async function ownedRun(db: DbClient, runId: string, userId: string) {
  const { data, error } = await db.from("strategy_lab_v2_runs").select("*")
    .eq("id", runId).eq("user_id", userId).single();
  if (error || !data) throw new Error("run_not_found");
  return data;
}

function requestCosts(body: RequestBody): StrategyLabV2Costs {
  return {
    spread_bps: finite(body.costs?.spread_bps, DEFAULT_STRATEGY_LAB_V2_COSTS.spread_bps, 0, 100),
    commission_bps: finite(body.costs?.commission_bps, DEFAULT_STRATEGY_LAB_V2_COSTS.commission_bps, 0, 100),
    slippage_bps: finite(body.costs?.slippage_bps, DEFAULT_STRATEGY_LAB_V2_COSTS.slippage_bps, 0, 100),
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const userId = await authenticatedUser(request);
  if (!userId) return json({ error: "unauthorized" }, 401);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await request.json() as RequestBody;
    if (body.action === "start") {
      const symbol = String(body.symbol ?? "").toUpperCase();
      const timeframe = String(body.timeframe ?? "");
      if (!isStrategyLabV2Market(symbol)) return json({ error: "unsupported_symbol" }, 400);
      if (!isStrategyLabV2Timeframe(timeframe)) return json({ error: "unsupported_timeframe" }, 400);
      const startMs = Date.parse(String(body.period_start));
      const endMs = Date.parse(String(body.period_end));
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
        return json({ error: "invalid_period" }, 400);
      }
      const depth = body.search_depth && body.search_depth in STRATEGY_LAB_V2_SEARCH_BUDGETS
        ? body.search_depth : "deep";
      const seed = Math.floor(finite(body.random_seed, Date.now() % 2_147_483_647, 1, 2_147_483_647));
      const costs = requestCosts(body);
      const riskPercent = finite(body.risk_percent, 1, 0.1, 2);
      const loaded = await loadCandles(db, symbol, timeframe, new Date(startMs).toISOString(), new Date(endMs).toISOString());
      const audit = auditStrategyLabV2Candles(loaded.candles);
      if (loaded.truncated) audit.warnings.push(`dataset_truncated_at_${MAX_CANDLES}_candles`);
      const status = audit.sufficient_for_search ? "searching" : "inconclusive";
      const verdict = audit.sufficient_for_search ? null : "INCONCLUSIVE_INSUFFICIENT_DATA";
      const { data: run, error } = await db.from("strategy_lab_v2_runs").insert({
        user_id: userId, status, verdict, symbol, timeframe,
        period_start: new Date(startMs).toISOString(), period_end: new Date(endMs).toISOString(),
        search_depth: depth, random_seed: seed, engine_version: STRATEGY_LAB_V2_VERSION,
        grammar_version: STRATEGY_LAB_V2_GRAMMAR_VERSION, engine_commit: ENGINE_COMMIT,
        candle_count: loaded.candles.length, dataset_audit: audit,
        request_config: { costs, risk_percent: riskPercent, max_candles: MAX_CANDLES, truncated: loaded.truncated,
          objective: "robust_after_cost_out_of_sample_performance", holdout_policy: "single_frozen_finalist" },
        progress: { percent: audit.sufficient_for_search ? 5 : 100, generated: 0, tested: 0, rejected: 0,
          agents_completed: 0, agents_total: STRATEGY_LAB_V2_SEARCH_AGENTS.length, phase: status },
        execution_allowed: STRATEGY_LAB_V2_EXECUTION_ALLOWED,
        started_at: new Date().toISOString(), completed_at: audit.sufficient_for_search ? null : new Date().toISOString(),
      }).select("*").single();
      if (error || !run) throw new Error(`run_create_failed:${error?.message ?? "unknown"}`);
      if (audit.sufficient_for_search) {
        const budget = STRATEGY_LAB_V2_SEARCH_BUDGETS[depth];
        const rows = STRATEGY_LAB_V2_SEARCH_AGENTS.map((agent, index) => ({
          run_id: run.id, agent_id: agent.agent_id, status: "queued", seed: seed + (index + 1) * 100_003,
          budget: budget.per_agent, artifact: { families: agent.families },
        }));
        const { error: agentError } = await db.from("strategy_lab_v2_agent_runs").insert(rows);
        if (agentError) throw new Error(`agent_create_failed:${agentError.message}`);
      }
      return json({ run, audit, next_agents: audit.sufficient_for_search
        ? STRATEGY_LAB_V2_SEARCH_AGENTS.map((agent) => agent.agent_id) : [], execution_allowed: false }, 202);
    }

    if (!body.run_id) return json({ error: "run_id_required" }, 400);
    const run = await ownedRun(db, body.run_id, userId);

    if (body.action === "status") {
      const [{ data: agents }, { data: leaders }] = await Promise.all([
        db.from("strategy_lab_v2_agent_runs").select("*").eq("run_id", run.id).order("created_at"),
        db.from("strategy_lab_v2_candidates").select("candidate_hash,family,score,development_metrics,positive_fold_ratio,genome,disqualified")
          .eq("run_id", run.id).order("score", { ascending: false }).limit(10),
      ]);
      return json({ run, agents: agents ?? [], leaders: leaders ?? [], execution_allowed: false });
    }

    if (body.action === "cancel") {
      if (["viable_strategy_found", "no_viable_strategy", "inconclusive", "failed", "cancelled"].includes(String(run.status))) {
        return json({ run, execution_allowed: false });
      }
      const { data, error } = await db.from("strategy_lab_v2_runs").update({
        cancellation_requested: true, status: "cancelled", completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), progress: { ...(run.progress as object), phase: "cancelled" },
      }).eq("id", run.id).select("*").single();
      if (error) throw new Error(`cancel_failed:${error.message}`);
      return json({ run: data, execution_allowed: false });
    }

    if (run.cancellation_requested || run.status === "cancelled") return json({ error: "run_cancelled" }, 409);

    if (body.action === "run_agent") {
      const agentId = String(body.agent_id ?? "");
      if (!isStrategyLabV2Agent(agentId)) return json({ error: "unknown_agent" }, 400);
      const { data: agent, error: agentReadError } = await db.from("strategy_lab_v2_agent_runs").select("*")
        .eq("run_id", run.id).eq("agent_id", agentId).single();
      if (agentReadError || !agent) throw new Error("agent_not_found");
      if (agent.status === "complete") return json({ agent, skipped: true, execution_allowed: false });
      await db.from("strategy_lab_v2_agent_runs").update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", agent.id);
      const loaded = await loadCandles(db, String(run.symbol), String(run.timeframe), String(run.period_start), String(run.period_end));
      const audit = auditStrategyLabV2Candles(loaded.candles);
      const development = loaded.candles.slice(0, audit.holdout_start_index);
      const config = run.request_config as { costs?: StrategyLabV2Costs };
      const depth = String(run.search_depth) as StrategyLabV2SearchDepth;
      const budget = STRATEGY_LAB_V2_SEARCH_BUDGETS[depth];
      const output = searchStrategyLabV2Agent(development, agentId, Number(agent.budget), budget.generations,
        Number(agent.seed), config.costs ?? DEFAULT_STRATEGY_LAB_V2_COSTS);
      for (let offset = 0; offset < output.candidates.length; offset += 250) {
        const rows = output.candidates.slice(offset, offset + 250).map((candidate) => ({
          run_id: run.id, agent_id: agentId, candidate_hash: candidate.candidate_hash,
          family: candidate.genome.family, generation: candidate.generation,
          parent_hashes: candidate.parent_hashes, genome: candidate.genome, score: candidate.score,
          development_metrics: candidate.metrics, fold_metrics: candidate.folds,
          positive_fold_ratio: candidate.positive_fold_ratio, disqualified: candidate.disqualified,
          disqualification_reasons: candidate.disqualification_reasons,
        }));
        const { error } = await db.from("strategy_lab_v2_candidates").upsert(rows, {
          onConflict: "run_id,candidate_hash", ignoreDuplicates: true,
        });
        if (error) throw new Error(`candidate_persist_failed:${error.message}`);
      }
      const { data: completedAgents } = await db.from("strategy_lab_v2_agent_runs").select("id")
        .eq("run_id", run.id).eq("status", "complete");
      const completed = (completedAgents?.length ?? 0) + 1;
      const totals = {
        generated: Number(run.candidates_generated ?? 0) + output.generated,
        tested: Number(run.candidates_tested ?? 0) + output.tested,
        rejected: Number(run.candidates_rejected ?? 0) + output.rejected,
      };
      const progress = { percent: Math.round(5 + completed / STRATEGY_LAB_V2_SEARCH_AGENTS.length * 70),
        ...totals, agents_completed: completed, agents_total: STRATEGY_LAB_V2_SEARCH_AGENTS.length,
        phase: "searching", current_agent: agentId };
      await Promise.all([
        db.from("strategy_lab_v2_agent_runs").update({
          status: "complete", generated: output.generated, tested: output.tested,
          rejected: output.rejected, generations: output.generations,
          best_candidate_hash: output.best?.candidate_hash ?? null,
          artifact: { families: STRATEGY_LAB_V2_SEARCH_AGENTS.find((item) => item.agent_id === agentId)?.families,
            best_score: output.best?.score ?? null, best_metrics: output.best?.metrics ?? null },
          completed_at: new Date().toISOString(),
        }).eq("id", agent.id),
        db.from("strategy_lab_v2_runs").update({
          candidates_generated: totals.generated, candidates_tested: totals.tested,
          candidates_rejected: totals.rejected, progress, updated_at: new Date().toISOString(),
        }).eq("id", run.id),
      ]);
      return json({ agent: { agent_id: agentId, generated: output.generated, tested: output.tested,
        rejected: output.rejected, generations: output.generations, best: output.best }, progress,
        execution_allowed: false });
    }

    if (body.action === "finalise") {
      const { data: pending } = await db.from("strategy_lab_v2_agent_runs").select("agent_id")
        .eq("run_id", run.id).neq("status", "complete");
      if (pending?.length) return json({ error: "search_agents_incomplete", pending }, 409);
      await db.from("strategy_lab_v2_runs").update({ status: "stress_testing",
        progress: { ...(run.progress as object), percent: 82, phase: "stress_testing" } }).eq("id", run.id);
      const { data: rows, error: candidateError } = await db.from("strategy_lab_v2_candidates").select("*")
        .eq("run_id", run.id).order("score", { ascending: false }).limit(100);
      if (candidateError || !rows?.length) throw new Error("no_candidates_to_finalise");
      const candidates = rows.map((row: Record<string, unknown>) => ({
        candidate_hash: String(row.candidate_hash), generation: Number(row.generation),
        parent_hashes: row.parent_hashes as string[], genome: row.genome as StrategyGenomeV2,
        score: Number(row.score), metrics: row.development_metrics,
        folds: row.fold_metrics, positive_fold_ratio: Number(row.positive_fold_ratio),
        disqualified: Boolean(row.disqualified), disqualification_reasons: row.disqualification_reasons,
      })) as StrategyLabV2CandidateResult[];
      const loaded = await loadCandles(db, String(run.symbol), String(run.timeframe), String(run.period_start), String(run.period_end));
      const audit = auditStrategyLabV2Candles(loaded.candles);
      const config = run.request_config as { costs?: StrategyLabV2Costs };
      const depth = String(run.search_depth) as StrategyLabV2SearchDepth;
      const result = finaliseStrategyLabV2(loaded.candles, audit, candidates,
        config.costs ?? DEFAULT_STRATEGY_LAB_V2_COSTS,
        STRATEGY_LAB_V2_SEARCH_BUDGETS[depth].bootstrap_runs, Number(run.random_seed));
      const status = result.verdict === "VIABLE_STRATEGY_FOUND" ? "viable_strategy_found"
        : result.verdict === "NO_VIABLE_STRATEGY_FOUND" ? "no_viable_strategy" : "inconclusive";
      const finalResult = { ...result, trades: undefined,
        tested_universe: { agents: STRATEGY_LAB_V2_SEARCH_AGENTS.length,
          unique_candidates: run.candidates_tested, walk_forward_folds: 5,
          stress_scenarios: 6, bootstrap_runs: STRATEGY_LAB_V2_SEARCH_BUDGETS[depth].bootstrap_runs,
          holdout_policy: "single_frozen_finalist" },
        execution_allowed: false };
      if (result.selected) {
        await db.from("strategy_lab_v2_candidates").update({ selected_finalist: true })
          .eq("run_id", run.id).eq("candidate_hash", result.selected.candidate_hash);
        await db.from("strategy_lab_v2_holdout_ledger").insert({
          run_id: run.id, candidate_hash: result.selected.candidate_hash,
          holdout_start: new Date(loaded.candles[audit.holdout_start_index].time).toISOString(),
          holdout_end: new Date(loaded.candles.at(-1)!.time).toISOString(), reused: false,
        });
        if (result.trades.length) {
          const trades = result.trades.map((trade, index) => ({
            run_id: run.id, candidate_hash: result.selected!.candidate_hash,
            segment: "sealed_holdout", trade_index: index + 1, direction: trade.direction,
            signal_time: new Date(trade.signal_time).toISOString(), opened_at: new Date(trade.opened_at).toISOString(),
            closed_at: new Date(trade.closed_at).toISOString(), entry: trade.entry, exit: trade.exit,
            stop: trade.stop, target: trade.target, gross_r: trade.gross_r, cost_r: trade.cost_r,
            net_r: trade.net_r, exit_reason: trade.exit_reason,
          }));
          const { error } = await db.from("strategy_lab_v2_trades").insert(trades);
          if (error) throw new Error(`trade_persist_failed:${error.message}`);
        }
      }
      const { data: finalRun, error } = await db.from("strategy_lab_v2_runs").update({
        status, verdict: result.verdict, finalist_hash: result.selected?.candidate_hash ?? null,
        final_result: finalResult, progress: { ...(run.progress as object), percent: 100, phase: status },
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", run.id).select("*").single();
      if (error) throw new Error(`finalise_persist_failed:${error.message}`);
      return json({ run: finalRun, result: finalResult, execution_allowed: false });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "strategy_lab_v2_failed", detail: message, execution_allowed: false }, 500);
  }
});
