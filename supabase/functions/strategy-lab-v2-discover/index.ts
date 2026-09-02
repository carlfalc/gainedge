import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  DEFAULT_STRATEGY_LAB_V2_COSTS,
  isStrategyLabV2Agent,
  isStrategyLabV2Checkpoint,
  isStrategyLabV2Market,
  isStrategyLabV2Timeframe,
  STRATEGY_LAB_V2_EXECUTION_ALLOWED,
  STRATEGY_LAB_V2_GRAMMAR_VERSION,
  STRATEGY_LAB_V2_SEARCH_AGENTS,
  STRATEGY_LAB_V2_SEARCH_BUDGETS,
  STRATEGY_LAB_V2_VERSION,
  strategyLabV2CheckpointComplete,
  strategyLabV2ChunkSize,
  strategyLabV2EliteCount,
  strategyLabV2PlannedGenerations,
  type StrategyGenomeV2,
  type StrategyLabV2AgentCheckpoint,
  type StrategyLabV2AgentId,
  type StrategyLabV2Audit,
  type StrategyLabV2CandidateResult,
  type StrategyLabV2Costs,
  type StrategyLabV2Elite,
  type StrategyLabV2SearchDepth,
} from "../_shared/strategy-lab-v2-contracts.ts";
import {
  auditStrategyLabV2Candles,
  createStrategyLabV2Checkpoint,
  finaliseStrategyLabV2,
  runStrategyLabV2Generation,
  type StrategyLabV2Candle,
} from "../_shared/strategy-lab-v2-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENGINE_COMMIT = Deno.env.get("GIT_COMMIT_SHA") ?? "strategy-lab-v2-discovery";
const MAX_CANDLES = 120_000;
const CANDIDATE_PERSIST_BATCH = 250;

// V2 tables are introduced by this feature's migration and therefore are not in the
// generated application Database type until the next schema-codegen pass.
type DbClient = SupabaseClient;
type RunRow = Record<string, unknown>;
type AgentRow = Record<string, unknown>;
type ProgressTotals = {
  generated: number;
  tested: number;
  rejected: number;
  budget: number;
};

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
  maxRows = MAX_CANDLES,
): Promise<{ candles: StrategyLabV2Candle[]; truncated: boolean }> {
  const ceiling = Math.max(1, Math.min(MAX_CANDLES, Math.floor(maxRows)));
  const candles: StrategyLabV2Candle[] = [];
  let cursor = periodStart;
  while (candles.length < ceiling) {
    const remaining = Math.min(1_000, ceiling - candles.length);
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
  return { candles, truncated: candles.length === ceiling && ceiling === MAX_CANDLES };
}

/**
 * Re-reads the dataset that was frozen when the run started. Only the rows the run
 * actually used are fetched, so a resumable search never pays for the sealed holdout it
 * is forbidden to look at. Any drift against the persisted audit is a hard error rather
 * than a silently different dataset.
 */
async function loadFrozenDataset(
  db: DbClient,
  run: RunRow,
  scope: "development" | "full",
): Promise<{ candles: StrategyLabV2Candle[]; audit: StrategyLabV2Audit }> {
  const audit = run.dataset_audit as StrategyLabV2Audit | null;
  const total = Number(audit?.candles);
  const holdoutStart = Number(audit?.holdout_start_index);
  if (!audit || !Number.isFinite(total) || !Number.isFinite(holdoutStart) || holdoutStart <= 0) {
    throw new Error("dataset_audit_missing");
  }
  const wanted = scope === "development" ? holdoutStart : total;
  const loaded = await loadCandles(db, String(run.symbol), String(run.timeframe),
    String(run.period_start), String(run.period_end), wanted);
  if (loaded.candles.length < wanted) {
    throw new Error(`dataset_drift_detected:expected_${wanted}_got_${loaded.candles.length}`);
  }
  const candles = loaded.candles.slice(0, wanted);
  if (audit.first_candle != null && candles[0].time !== audit.first_candle) {
    throw new Error("dataset_drift_detected:first_candle_changed");
  }
  if (scope === "full" && audit.last_candle != null && candles.at(-1)!.time !== audit.last_candle) {
    throw new Error("dataset_drift_detected:last_candle_changed");
  }
  return { candles, audit };
}

async function ownedRun(db: DbClient, runId: string, userId: string) {
  const { data, error } = await db.from("strategy_lab_v2_runs").select("*")
    .eq("id", runId).eq("user_id", userId).single();
  if (error || !data) throw new Error("run_not_found");
  return data as RunRow;
}

function requestCosts(body: RequestBody): StrategyLabV2Costs {
  return {
    spread_bps: finite(body.costs?.spread_bps, DEFAULT_STRATEGY_LAB_V2_COSTS.spread_bps, 0, 100),
    commission_bps: finite(body.costs?.commission_bps, DEFAULT_STRATEGY_LAB_V2_COSTS.commission_bps, 0, 100),
    slippage_bps: finite(body.costs?.slippage_bps, DEFAULT_STRATEGY_LAB_V2_COSTS.slippage_bps, 0, 100),
  };
}

const agentFamiliesOf = (agentId: StrategyLabV2AgentId) =>
  STRATEGY_LAB_V2_SEARCH_AGENTS.find((agent) => agent.agent_id === agentId)?.families ?? [];

/**
 * Rebuilds a usable checkpoint for an agent. Candidate rows are the durable source of
 * truth: if a platform kill happens after the candidate upsert but before the checkpoint
 * update, the next invocation reconstructs the advanced generation instead of replaying
 * it or losing progress.
 */
async function resolveCheckpoint(
  db: DbClient,
  run: RunRow,
  agent: AgentRow,
): Promise<{ checkpoint: StrategyLabV2AgentCheckpoint; recovered: boolean; recovered_from_candidates: number }> {
  const agentId = String(agent.agent_id) as StrategyLabV2AgentId;
  const budget = Math.max(1, Math.floor(Number(agent.budget)));
  const depth = String(run.search_depth) as StrategyLabV2SearchDepth;
  const generations = (STRATEGY_LAB_V2_SEARCH_BUDGETS[depth] ?? STRATEGY_LAB_V2_SEARCH_BUDGETS.deep).generations;
  const artifact = (agent.artifact ?? {}) as Record<string, unknown>;
  const stored = artifact.checkpoint;
  const storedMatches =
    isStrategyLabV2Checkpoint(stored) && stored.agent_id === agentId && stored.budget === budget &&
    stored.seed === (Math.abs(Math.trunc(Number(agent.seed))) >>> 0) &&
    stored.chunk_size === strategyLabV2ChunkSize(budget, generations) &&
    stored.planned_generations === strategyLabV2PlannedGenerations(budget, generations);

  const { data, error } = await db.from("strategy_lab_v2_candidates")
    .select("candidate_hash,score,genome,disqualified,generation,development_metrics")
    .eq("run_id", run.id).eq("agent_id", agentId)
    .order("score", { ascending: false }).order("candidate_hash", { ascending: true })
    .limit(budget);
  if (error) throw new Error(`checkpoint_recovery_failed:${error.message}`);
  const rows = data ?? [];
  if (storedMatches && rows.length === stored.tested) {
    return { checkpoint: stored, recovered: false, recovered_from_candidates: 0 };
  }
  if (storedMatches && rows.length < stored.tested) {
    throw new Error(`checkpoint_ahead_of_candidates:${stored.tested}/${rows.length}`);
  }
  const chunkSize = strategyLabV2ChunkSize(budget, generations);
  const elites: StrategyLabV2Elite[] = rows.slice(0, strategyLabV2EliteCount(chunkSize)).map((row) => ({
    candidate_hash: String(row.candidate_hash),
    score: Number(row.score),
    genome: row.genome as StrategyGenomeV2,
  }));
  const tested = rows.length;
  const completedGenerations = rows.reduce(
    (maximum, row) => Math.max(maximum, Number(row.generation ?? 0)),
    0,
  );
  const checkpoint = createStrategyLabV2Checkpoint({
    agentId, seed: Number(agent.seed), budget, generations,
    seen: rows.map((row) => String(row.candidate_hash)),
    elites, tested, generated: Math.max(tested, Number(agent.generated ?? 0)),
    rejected: rows.filter((row) => Boolean(row.disqualified)).length,
    completedGenerations,
    best: rows.length
      ? {
        candidate_hash: String(rows[0].candidate_hash),
        score: Number(rows[0].score),
        metrics: rows[0].development_metrics ?? null,
      }
      : null,
  });
  return { checkpoint, recovered: true, recovered_from_candidates: tested };
}

function nextAgentAfter(agents: AgentRow[], agentId: StrategyLabV2AgentId): StrategyLabV2AgentId | null {
  const ordered = STRATEGY_LAB_V2_SEARCH_AGENTS.map((agent) => agent.agent_id);
  const statusOf = new Map(agents.map((row) => [String(row.agent_id), String(row.status)]));
  const start = ordered.indexOf(agentId);
  for (let step = 1; step <= ordered.length; step += 1) {
    const candidate = ordered[(start + step) % ordered.length];
    if (statusOf.get(candidate) !== "complete") return candidate;
  }
  return null;
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
      const budget = STRATEGY_LAB_V2_SEARCH_BUDGETS[depth];
      const chunkSize = strategyLabV2ChunkSize(budget.per_agent, budget.generations);
      const plannedGenerations = strategyLabV2PlannedGenerations(budget.per_agent, budget.generations);
      const { data: run, error } = await db.from("strategy_lab_v2_runs").insert({
        user_id: userId, status, verdict, symbol, timeframe,
        period_start: new Date(startMs).toISOString(), period_end: new Date(endMs).toISOString(),
        search_depth: depth, random_seed: seed, engine_version: STRATEGY_LAB_V2_VERSION,
        grammar_version: STRATEGY_LAB_V2_GRAMMAR_VERSION, engine_commit: ENGINE_COMMIT,
        candle_count: loaded.candles.length, dataset_audit: audit,
        request_config: { costs, risk_percent: riskPercent, max_candles: MAX_CANDLES, truncated: loaded.truncated,
          objective: "robust_after_cost_out_of_sample_performance", holdout_policy: "single_frozen_finalist",
          per_agent_budget: budget.per_agent, chunk_size: chunkSize, planned_generations: plannedGenerations,
          total_budget: budget.per_agent * STRATEGY_LAB_V2_SEARCH_AGENTS.length,
          execution_model: "resumable_one_generation_micro_batches" },
        progress: { percent: audit.sufficient_for_search ? 5 : 100, generated: 0, tested: 0, rejected: 0,
          agents_completed: 0, agents_total: STRATEGY_LAB_V2_SEARCH_AGENTS.length, phase: status,
          total_budget: budget.per_agent * STRATEGY_LAB_V2_SEARCH_AGENTS.length },
        execution_allowed: STRATEGY_LAB_V2_EXECUTION_ALLOWED,
        started_at: new Date().toISOString(), completed_at: audit.sufficient_for_search ? null : new Date().toISOString(),
      }).select("*").single();
      if (error || !run) throw new Error(`run_create_failed:${error?.message ?? "unknown"}`);
      if (audit.sufficient_for_search) {
        const rows = STRATEGY_LAB_V2_SEARCH_AGENTS.map((agent, index) => {
          const agentSeed = seed + (index + 1) * 100_003;
          return {
            run_id: run.id, agent_id: agent.agent_id, status: "queued", seed: agentSeed,
            budget: budget.per_agent,
            artifact: {
              families: agent.families,
              checkpoint: createStrategyLabV2Checkpoint({
                agentId: agent.agent_id, seed: agentSeed, budget: budget.per_agent,
                generations: budget.generations,
              }),
            },
          };
        });
        const { error: agentError } = await db.from("strategy_lab_v2_agent_runs").insert(rows);
        if (agentError) throw new Error(`agent_create_failed:${agentError.message}`);
      }
      return json({ run, audit, next_agents: audit.sufficient_for_search
        ? STRATEGY_LAB_V2_SEARCH_AGENTS.map((agent) => agent.agent_id) : [],
        chunk_size: chunkSize, planned_generations: plannedGenerations, execution_allowed: false }, 202);
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
      const { data: agentRow, error: agentReadError } = await db.from("strategy_lab_v2_agent_runs").select("*")
        .eq("run_id", run.id).eq("agent_id", agentId).single();
      if (agentReadError || !agentRow) throw new Error("agent_not_found");
      const agent = agentRow as AgentRow;

      try {
        const resolved = await resolveCheckpoint(db, run, agent);
        const checkpoint = resolved.checkpoint;
        const config = run.request_config as { costs?: StrategyLabV2Costs };
        const costs = config?.costs ?? DEFAULT_STRATEGY_LAB_V2_COSTS;

        // Already finished (or finished by a concurrent invocation whose response was lost).
        if (strategyLabV2CheckpointComplete(checkpoint)) {
          const finished = await completeAgent(db, run, agent, checkpoint, resolved.recovered);
          return json({ ...finished, skipped: agent.status === "complete", execution_allowed: false });
        }

        await db.from("strategy_lab_v2_agent_runs").update({
          status: "running",
          started_at: (agent.started_at as string | null) ?? new Date().toISOString(),
        }).eq("id", agent.id);

        const { candles } = await loadFrozenDataset(db, run, "development");
        const output = runStrategyLabV2Generation(candles, checkpoint, costs);

        for (let offset = 0; offset < output.evaluated.length; offset += CANDIDATE_PERSIST_BATCH) {
          const rows = output.evaluated.slice(offset, offset + CANDIDATE_PERSIST_BATCH).map((candidate) => ({
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

        const advanced = output.checkpoint;
        const best = output.evaluated.find((candidate) => candidate.candidate_hash === advanced.best?.candidate_hash);
        if (advanced.best && best) advanced.best = { ...advanced.best, metrics: best.metrics };
        const result = output.complete
          ? await completeAgent(db, run, agent, advanced, resolved.recovered)
          : await advanceAgent(db, run, agent, advanced, resolved.recovered);
        return json({ ...result, execution_allowed: false });
      } catch (agentError) {
        const detail = agentError instanceof Error ? agentError.message : String(agentError);
        // Application-level failures are recoverable: park the agent back in `queued` with a
        // diagnostic so Resume can replay the same generation deterministically.
        const { data: latestAgent } = await db.from("strategy_lab_v2_agent_runs")
          .select("artifact").eq("id", agent.id).single();
        await db.from("strategy_lab_v2_agent_runs").update({
          status: "queued",
          artifact: {
            ...(latestAgent?.artifact as object ?? agent.artifact as object ?? {}),
            last_error: detail,
            last_error_at: new Date().toISOString(),
          },
        }).eq("id", agent.id);
        throw agentError;
      }
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
      const { candles, audit } = await loadFrozenDataset(db, run, "full");
      const config = run.request_config as { costs?: StrategyLabV2Costs };
      const depth = String(run.search_depth) as StrategyLabV2SearchDepth;
      const result = finaliseStrategyLabV2(candles, audit, candidates,
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
          holdout_start: new Date(candles[audit.holdout_start_index].time).toISOString(),
          holdout_end: new Date(candles.at(-1)!.time).toISOString(), reused: false,
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

/** Progress aggregates are always recomputed from persisted agent rows, never incremented. */
async function persistRunProgress(db: DbClient, run: RunRow, currentAgent: StrategyLabV2AgentId) {
  const { data, error } = await db.from("strategy_lab_v2_agent_runs")
    .select("agent_id,status,generated,tested,rejected,generations,budget").eq("run_id", run.id);
  if (error) throw new Error(`progress_read_failed:${error.message}`);
  const agents = (data ?? []) as AgentRow[];
  const totals = agents.reduce<ProgressTotals>((accumulator, row) => ({
    generated: accumulator.generated + Number(row.generated ?? 0),
    tested: accumulator.tested + Number(row.tested ?? 0),
    rejected: accumulator.rejected + Number(row.rejected ?? 0),
    budget: accumulator.budget + Number(row.budget ?? 0),
  }), { generated: 0, tested: 0, rejected: 0, budget: 0 });
  const completed = agents.filter((row) => String(row.status) === "complete").length;
  const share = totals.budget > 0 ? Math.min(1, totals.tested / totals.budget) : 0;
  const progress = {
    percent: Math.max(5, Math.min(75, Math.round(5 + share * 70))),
    generated: totals.generated, tested: totals.tested, rejected: totals.rejected,
    total_budget: totals.budget, agents_completed: completed,
    agents_total: STRATEGY_LAB_V2_SEARCH_AGENTS.length, phase: "searching", current_agent: currentAgent,
  };
  const { error: updateError } = await db.from("strategy_lab_v2_runs").update({
    candidates_generated: totals.generated, candidates_tested: totals.tested,
    candidates_rejected: totals.rejected, progress, updated_at: new Date().toISOString(),
  }).eq("id", run.id);
  if (updateError) throw new Error(`progress_persist_failed:${updateError.message}`);
  return { progress, agents };
}

function agentSummary(checkpoint: StrategyLabV2AgentCheckpoint, complete: boolean, recovered: boolean) {
  return {
    agent_id: checkpoint.agent_id,
    state: complete ? "complete" as const : "partial" as const,
    generated: checkpoint.generated,
    tested: checkpoint.tested,
    rejected: checkpoint.rejected,
    generations: checkpoint.completed_generations,
    planned_generations: checkpoint.planned_generations,
    budget: checkpoint.budget,
    chunk_size: checkpoint.chunk_size,
    best: checkpoint.best,
    recovered_from_persisted_progress: recovered,
  };
}

async function advanceAgent(
  db: DbClient, run: RunRow, agent: AgentRow,
  checkpoint: StrategyLabV2AgentCheckpoint, recovered: boolean,
) {
  const { error } = await db.from("strategy_lab_v2_agent_runs").update({
    status: "running", generated: checkpoint.generated, tested: checkpoint.tested,
    rejected: checkpoint.rejected, generations: checkpoint.completed_generations,
    best_candidate_hash: checkpoint.best?.candidate_hash ?? null,
    artifact: {
      families: agentFamiliesOf(checkpoint.agent_id), checkpoint,
      best_score: checkpoint.best?.score ?? null, best_metrics: checkpoint.best?.metrics ?? null,
    },
  }).eq("id", agent.id);
  if (error) throw new Error(`agent_checkpoint_persist_failed:${error.message}`);
  const { progress } = await persistRunProgress(db, run, checkpoint.agent_id);
  return {
    agent: agentSummary(checkpoint, false, recovered), progress,
    next_action: { action: "run_agent", agent_id: checkpoint.agent_id },
  };
}

async function completeAgent(
  db: DbClient, run: RunRow, agent: AgentRow,
  checkpoint: StrategyLabV2AgentCheckpoint, recovered: boolean,
) {
  const { count } = await db.from("strategy_lab_v2_candidates")
    .select("candidate_hash", { count: "exact", head: true })
    .eq("run_id", run.id).eq("agent_id", checkpoint.agent_id);
  if (count !== checkpoint.budget || checkpoint.tested !== checkpoint.budget) {
    throw new Error(
      `candidate_count_mismatch:${checkpoint.agent_id}:persisted_${count ?? "unknown"}:checkpoint_${checkpoint.tested}:budget_${checkpoint.budget}`,
    );
  }
  const { error } = await db.from("strategy_lab_v2_agent_runs").update({
    status: "complete", generated: checkpoint.generated, tested: checkpoint.tested,
    rejected: checkpoint.rejected, generations: checkpoint.completed_generations,
    best_candidate_hash: checkpoint.best?.candidate_hash ?? null,
    artifact: {
      families: agentFamiliesOf(checkpoint.agent_id), checkpoint,
      best_score: checkpoint.best?.score ?? null, best_metrics: checkpoint.best?.metrics ?? null,
      persisted_candidates: count ?? null,
    },
    completed_at: new Date().toISOString(),
  }).eq("id", agent.id);
  if (error) throw new Error(`agent_complete_persist_failed:${error.message}`);
  const { progress, agents } = await persistRunProgress(db, run, checkpoint.agent_id);
  const next = nextAgentAfter(agents, checkpoint.agent_id);
  return {
    agent: { ...agentSummary(checkpoint, true, recovered), persisted_candidates: count ?? null },
    progress,
    next_action: next ? { action: "run_agent", agent_id: next } : { action: "finalise" },
  };
}
