/**
 * Read-only client for the persisted RON seven-agent decision surface (marker 2D.2m).
 * Invokes `ron-decision-read` only. No writes, no recomputation, no local inference.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RonEvidenceView {
  evidence_hash: string;
  agent_id: string;
  agent_version: number;
  as_of: string;
  status: string;
  direction?: string | null;
  recommendation: string;
  observations: { key: string; kind: string; value_num?: number; value_text?: string; unit?: string; at?: string }[];
  data_health: { status: string; freshness_minutes: number; completeness: number; issues: string[] };
  uncertainty: { level: string; limitations: string[] };
  conflicts: string[];
  dependencies: string[];
  provenance_refs: string[];
  source_timestamps: Record<string, string>;
  ordinal: number;
  authority_rank: number;
}

export interface RonDecisionView {
  read_version: number;
  decision: Record<string, unknown> & {
    decision_id: string; decision_hash: string; trace_id: string; instrument: string;
    timeframe: string; as_of: string; state: string; recommendation: string;
    direction: string; execution_path: string; created_at: string;
  };
  decision_detail: {
    data_health?: { worst_status?: string; stale_agents?: string[]; issues?: string[] };
    coverage?: { present_agents?: string[]; missing_expected_agents?: string[]; unexpected_agents?: string[] };
    agreements?: string[];
    disagreements?: { kind: string; agents: string[]; detail: string; non_binding: boolean }[];
    blocking_reasons?: string[];
    promoted_state_variables?: string[];
  };
  explanation: {
    why?: string[]; what_would_change?: string[]; missing_or_conflicting?: string[];
    data_health?: string[]; source_refs?: string[];
  };
  evidence: RonEvidenceView[];
  evidence_count: number;
  reconstructable: boolean;
  numeric_probability: null;
  probability_status: "not_calibrated";
  execution_allowed: false;
  execution_path: "signal_only";
}

export interface RonDecisionReadResult {
  decision_available: boolean;
  view: RonDecisionView | null;
  view_hash?: string;
  spec_hash?: string;
  read_version?: number;
}

export async function fetchLatestRonDecision(
  params: { instrument?: string; timeframe?: string; decision_id?: string } = {},
): Promise<RonDecisionReadResult> {
  await supabase.auth.refreshSession();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("ron-decision-read", { body: params });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as RonDecisionReadResult;
}
