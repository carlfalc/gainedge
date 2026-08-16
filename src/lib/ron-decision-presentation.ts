/**
 * GAINEDGE_UI_RON_DECISION_CARD_V1 — pure presentation layer for the stored RON
 * decision record. Deterministic formatting ONLY: every string here either comes
 * from the stored record verbatim or from a fixed local glossary. Nothing is
 * inferred, no market claim is generated, no probability is ever produced.
 */
import type { RonDecisionView, RonEvidenceView } from "@/services/ron-decisions";

export interface StatePresentation {
  /** Human-readable headline for the stored state token. */
  label: string;
  /** Cautious glossary sentence describing what the token means procedurally. */
  glossary: string;
  tone: "blocked" | "caution" | "supported" | "neutral";
  /** True when the token is not in the local glossary (safe fallback used). */
  unknown: boolean;
}

const STATE_GLOSSARY: Record<string, Omit<StatePresentation, "unknown">> = {
  DATA_BLOCKED: {
    label: "Blocked on data",
    glossary:
      "RON stopped because the underlying data did not meet its own quality gates. No view was formed.",
    tone: "blocked",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Not enough evidence",
    glossary:
      "The specialists ran, but the recorded evidence did not reach the level RON requires before it says anything further.",
    tone: "caution",
  },
  CONFLICTING_CONTEXT: {
    label: "Context disagrees",
    glossary:
      "Specialists recorded context that pulls in different directions, so RON did not settle on a single reading.",
    tone: "caution",
  },
  OPPORTUNITY_INCOMPLETE: {
    label: "Opportunity checks incomplete",
    glossary:
      "The readiness checks RON must pass before describing an opportunity were not all satisfied at this evaluation.",
    tone: "caution",
  },
  CONTEXT_SUPPORTED: {
    label: "Context supported",
    glossary:
      "The recorded context was internally consistent. This is descriptive context only — it is not a trade instruction.",
    tone: "supported",
  },
  RESEARCH_ONLY: {
    label: "Research only",
    glossary: "This record exists for research and audit purposes and carries no operational meaning.",
    tone: "neutral",
  },
};

/** Title-cases an unknown token without attaching any meaning to it. */
export function titleCaseToken(token: string): string {
  return token
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function presentState(token: string | null | undefined): StatePresentation {
  const key = (token ?? "").trim();
  const known = STATE_GLOSSARY[key];
  if (known) return { ...known, unknown: false };
  return {
    label: key ? titleCaseToken(key) : "Unknown state",
    glossary:
      "This stored state is not in the local glossary, so no meaning is assumed for it here. The raw token is shown for reference.",
    tone: "neutral",
    unknown: true,
  };
}

const AGENT_LABELS: Record<string, string> = {
  session_market_structure: "Session & market structure",
  pattern_context: "Chart pattern context",
  calibration_model_validation: "Model calibration checks",
  cross_asset_correlation: "Cross-asset relationship",
  macro_news_geopolitics: "Macro, news & geopolitics",
  opportunity_risk: "Opportunity readiness",
  falconer_signal_source: "Falconer signal source",
};

export function agentLabel(agentId: string): string {
  return AGENT_LABELS[agentId] ?? titleCaseToken(agentId);
}

/** Fixed governance lines. Never derived from any number in the record. */
export const PROBABILITY_LINE = "Probability: Not calibrated yet";
export const PROBABILITY_NOTE =
  "RON deliberately withholds any percentage until its calibration evidence gates are met. This is by design, not an app error.";
export const EXECUTION_LINE = "Execution: Signal only";
export const EXECUTION_NOTE = "Live execution is off for this surface.";

/**
 * "What RON is saying" — uses stored explanation text verbatim when present, and
 * otherwise falls back to the cautious state glossary. Never a new claim.
 */
export function summaryParagraph(view: Pick<RonDecisionView, "explanation" | "decision">): {
  text: string; source: "stored_explanation" | "state_glossary";
} {
  const why = view.explanation?.why?.filter((s) => typeof s === "string" && s.trim().length > 0) ?? [];
  if (why.length) return { text: why.slice(0, 2).join(" ").trim(), source: "stored_explanation" };
  return { text: presentState(view.decision?.state).glossary, source: "state_glossary" };
}

/** Relative age of an instant against the browser clock. Deterministic and pure. */
export function formatAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "unknown age";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown age";
  const mins = Math.floor((now.getTime() - t) / 60_000);
  if (mins < 0) return "not yet reached";
  if (mins < 1) return "less than a minute old";
  if (mins === 1) return "1 min old";
  if (mins < 60) return `${mins} min old`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour old" : `${hours} hours old`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day old" : `${days} days old`;
}

export interface EvidenceSummary {
  agent_id: string;
  label: string;
  /** Present only when actually stored. */
  status: string | null;
  direction: string | null;
  recommendation: string | null;
  /** Freshness AS RECORDED AT DECISION TIME — never the current age. */
  freshnessAtDecision: string | null;
  health: "healthy" | "degraded" | "unknown";
  /** Stored data-health issues, verbatim. Shown only when the row is open. */
  issues: string[];
  /** Stored conflicts, verbatim. Shown only when the row is open. */
  conflicts: string[];
  /** Stored uncertainty limitations, verbatim. Shown only when the row is open. */
  limitations: string[];
  /** True when there is anything at all to disclose under warnings & caveats. */
  hasWarnings: boolean;
  /** Compact, truthful collapsed-row summary. Null when nothing needs flagging. */
  attentionSummary: string | null;
  evidence_hash: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Compact count line. Zero categories are omitted; nothing is inferred. */
export function attentionSummaryLine(
  health: EvidenceSummary["health"],
  counts: { issues: number; conflicts: number; limitations: number },
): string | null {
  const parts: string[] = [];
  if (health !== "healthy") parts.push("Needs attention");
  if (counts.issues > 0) parts.push(plural(counts.issues, "issue", "issues"));
  if (counts.conflicts > 0) parts.push(plural(counts.conflicts, "conflict", "conflicts"));
  if (counts.limitations > 0) parts.push(plural(counts.limitations, "caveat", "caveats"));
  return parts.length ? parts.join(" · ") : null;
}

export function summariseEvidence(e: RonEvidenceView): EvidenceSummary {
  const healthStatus = e.data_health?.status;
  const health: EvidenceSummary["health"] =
    healthStatus === "healthy" ? "healthy" : healthStatus ? "degraded" : "unknown";
  const issues = [...(e.data_health?.issues ?? [])];
  const conflicts = [...(e.conflicts ?? [])];
  const limitations = [...(e.uncertainty?.limitations ?? [])];
  const fresh = e.data_health?.freshness_minutes;
  return {
    agent_id: e.agent_id,
    label: agentLabel(e.agent_id),
    status: e.status ? titleCaseToken(e.status) : null,
    direction: e.direction ? titleCaseToken(e.direction) : null,
    recommendation: e.recommendation ? titleCaseToken(e.recommendation) : null,
    freshnessAtDecision: typeof fresh === "number" ? `${fresh} min at decision time` : null,
    health,
    issues,
    conflicts,
    limitations,
    hasWarnings: issues.length + conflicts.length + limitations.length > 0,
    attentionSummary: attentionSummaryLine(health, {
      issues: issues.length, conflicts: conflicts.length, limitations: limitations.length,
    }),
    evidence_hash: e.evidence_hash,
  };
}

/** Truthful empty-state copy for a stored explanation list. */
export function emptyListCopy(kind: "why" | "what_would_change" | "missing_or_conflicting" | "blocking"): string {
  switch (kind) {
    case "why":
      return "No supporting rationale was stored with this record. Nothing is inferred in its place.";
    case "what_would_change":
      return "No change conditions were stored with this record. Nothing is inferred in its place.";
    case "missing_or_conflicting":
      return "No missing or conflicting items were recorded.";
    default:
      return "No blocking reasons were recorded.";
  }
}

/**
 * Orchestrator version comes ONLY from the stored `orchestrator_version` field of the
 * frozen read projection. Historical records carry no orchestration run-version metadata
 * and must never be labelled with one.
 */
export function orchestratorVersion(view: RonDecisionView): string | null {
  const raw = (view.decision as Record<string, unknown>)?.orchestrator_version;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

/** Non-empty stored string helper for optional integrity fields. */
export function storedString(view: RonDecisionView, key: string): string | null {
  const raw = (view.decision as Record<string, unknown>)?.[key];
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}