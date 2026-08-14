/**
 * RON persisted-decision READ contract V1 (implementation marker 2D.2m — NEW marker).
 *
 * Read-only projection of ALREADY-PERSISTED seven-agent orchestration audit rows into a
 * product-safe view model. This module performs NO writes, NO recomputation, NO inference
 * and NO synthesis: every field it emits is copied verbatim from a stored row, or is a
 * derived boolean/count over stored rows.
 *
 * Hard invariants enforced fail-closed by `assertReadSafe`:
 *  - `numeric_probability` is null (a stored non-null value is a defect, not a surface).
 *  - `execution_allowed === false`, `execution_path === 'signal_only'`.
 *  - no secret / private-account / probability / causal-claim shaped keys survive projection.
 *  - a decision whose linked evidence cannot be fully resolved is NOT renderable.
 */
import {
  canonicalize, hashCanonical, scanDenylist, type DenylistHit,
} from "./ron-agent-contracts.ts";

export const RON_DECISION_READ_VERSION = 1;

/** Frozen allowlists. Anything not named here never reaches a client. */
export const DECISION_READ_SPEC_V1 = {
  read_version: RON_DECISION_READ_VERSION,
  mutation_surface: "none",
  recomputation: "none",
  probability_policy: "null_until_qualified",
  execution_policy: "signal_only_execution_disallowed",
  decision_fields: [
    "decision_id", "decision_hash", "explanation_hash", "trace_id", "instrument",
    "timeframe", "as_of", "state", "recommendation", "direction", "numeric_probability",
    "execution_allowed", "execution_path", "orchestrator_version",
    "decision_schema_version", "evidence_schema_version", "registry_hash",
    "ttl_policy_version", "created_at",
  ],
  decision_detail_fields: [
    "data_health", "coverage", "agreements", "disagreements", "blocking_reasons",
    "promoted_state_variables", "evidence_refs",
  ],
  explanation_fields: [
    "why", "what_would_change", "missing_or_conflicting", "data_health", "source_refs",
  ],
  evidence_fields: [
    "evidence_hash", "agent_id", "agent_version", "instrument", "timeframe", "as_of",
    "status", "direction", "recommendation", "observations", "data_health",
    "uncertainty", "conflicts", "dependencies", "provenance_refs", "source_timestamps",
  ],
  /**
   * The ONLY keys permitted to carry a probability-shaped NAME. `numeric_probability` is
   * checked to be null and `probability_status` to be the literal "not_calibrated" BEFORE
   * they are stripped for the denylist scan.
   */
  probability_key_exemptions: ["numeric_probability", "probability_status"],
} as const;

export async function decisionReadSpecHash(): Promise<string> {
  return await hashCanonical(DECISION_READ_SPEC_V1);
}

export class DecisionReadError extends Error {
  readonly reasons: string[];
  constructor(reasons: string[]) {
    super(`decision_read_violation: ${reasons.join("; ")}`);
    this.name = "DecisionReadError";
    this.reasons = reasons;
  }
}

type Row = Record<string, unknown>;

function pick(row: Row, fields: readonly string[]): Row {
  const out: Row = {};
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

export interface DecisionEvidenceView extends Row {
  ordinal: number;
  authority_rank: number;
}

export interface DecisionView {
  read_version: number;
  decision: Row;
  decision_detail: Row;
  explanation: Row;
  evidence: DecisionEvidenceView[];
  evidence_count: number;
  reconstructable: boolean;
  numeric_probability: null;
  probability_status: "not_calibrated";
  execution_allowed: false;
  execution_path: "signal_only";
}

/** Projects one persisted decision + its linked evidence. Copies only; never derives claims. */
export function buildDecisionView(
  decisionRow: Row,
  linkRows: Row[],
  evidenceRows: Row[],
): DecisionView {
  const reasons: string[] = [];
  if (!decisionRow || typeof decisionRow !== "object") throw new DecisionReadError(["missing_decision_row"]);

  const decision = pick(decisionRow, DECISION_READ_SPEC_V1.decision_fields);
  const storedDecision = (decisionRow.decision ?? {}) as Row;
  const storedExplanation = (decisionRow.explanation ?? {}) as Row;
  const decision_detail = pick(storedDecision, DECISION_READ_SPEC_V1.decision_detail_fields);
  const explanation = pick(storedExplanation, DECISION_READ_SPEC_V1.explanation_fields);

  const byHash = new Map<string, Row>();
  for (const e of evidenceRows) {
    if (typeof e.evidence_hash === "string") byHash.set(e.evidence_hash, e);
  }

  const links = [...linkRows].sort((a, b) => {
    const oa = Number(a.ordinal ?? 0), ob = Number(b.ordinal ?? 0);
    if (oa !== ob) return oa - ob;
    return String(a.evidence_hash ?? "").localeCompare(String(b.evidence_hash ?? ""));
  });

  const evidence: DecisionEvidenceView[] = [];
  for (const link of links) {
    const hash = String(link.evidence_hash ?? "");
    const row = byHash.get(hash);
    if (!row) {
      reasons.push(`unresolved_evidence_link:${hash || "unknown"}`);
      continue;
    }
    evidence.push({
      ...pick(row, DECISION_READ_SPEC_V1.evidence_fields),
      ordinal: Number(link.ordinal ?? 0),
      authority_rank: Number(link.authority_rank ?? 0),
    });
  }

  const reconstructable = reasons.length === 0 && links.length > 0
    && evidence.length === links.length;
  if (!reconstructable) reasons.push("evidence_set_not_fully_reconstructable");
  if (reasons.length) throw new DecisionReadError(reasons);

  return {
    read_version: RON_DECISION_READ_VERSION,
    decision,
    decision_detail,
    explanation,
    evidence,
    evidence_count: evidence.length,
    reconstructable: true,
    numeric_probability: null,
    probability_status: "not_calibrated",
    execution_allowed: false,
    execution_path: "signal_only",
  };
}

/** Strips the single exempted probability-shaped key before the denylist scan. */
function stripExemptKey(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripExemptKey);
  if (value === null || typeof value !== "object") return value;
  const out: Row = {};
  for (const [k, v] of Object.entries(value as Row)) {
    if ((DECISION_READ_SPEC_V1.probability_key_exemptions as readonly string[]).includes(k)) continue;
    out[k] = stripExemptKey(v);
  }
  return out;
}

/** Fail-closed safety gate. Throws `DecisionReadError` on ANY violation. */
export function assertReadSafe(view: DecisionView): void {
  const reasons: string[] = [];
  if (view.read_version !== RON_DECISION_READ_VERSION) reasons.push("read_version_mismatch");
  if (view.numeric_probability !== null) reasons.push("numeric_probability_must_be_null");
  if (view.probability_status !== "not_calibrated") reasons.push("probability_status_must_be_not_calibrated");
  if (view.execution_allowed !== false) reasons.push("execution_allowed_must_be_false");
  if (view.execution_path !== "signal_only") reasons.push("execution_path_must_be_signal_only");
  if (!view.reconstructable) reasons.push("decision_not_reconstructable");
  if (view.evidence_count !== view.evidence.length) reasons.push("evidence_count_mismatch");

  const d = view.decision;
  if (d.numeric_probability !== null && d.numeric_probability !== undefined) {
    reasons.push("stored_decision_numeric_probability_not_null");
  }
  if (d.execution_allowed !== false) reasons.push("stored_decision_execution_allowed_not_false");
  if (d.execution_path !== "signal_only") reasons.push("stored_decision_execution_path_not_signal_only");

  const hits: DenylistHit[] = scanDenylist(stripExemptKey(view));
  for (const h of hits) reasons.push(`${h.rule}@${h.path}`);

  if (reasons.length) throw new DecisionReadError(reasons);
}

/** Deterministic content hash of the rendered view (surface-level replay proof). */
export async function decisionViewHash(view: DecisionView): Promise<string> {
  return await hashCanonical(JSON.parse(canonicalize(view)));
}
