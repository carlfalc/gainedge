/**
 * RON Phase 2D.1h — Agentic Intelligence Architecture FOUNDATION (contract only).
 *
 * This module introduces NO runtime behaviour, no model, no trading logic and no new
 * lineage. It declares, deterministically and hashably:
 *
 *   1. The SPECIALIST ROLES that make up RON, each with an explicit evidence contract:
 *      which accepted artifacts it may read, and which CLASSES of claim it may emit.
 *   2. The ACCEPTED EVIDENCE LEDGER — the only artifacts any RON role may cite. Anything
 *      not listed here is inadmissible, so RON cannot silently cite unaccepted work.
 *   3. The TRUTHFULNESS RULES that fall out of the accepted research record. Research V4
 *      promoted ZERO state variables under the two-stage gate, so no role may assert
 *      conditional predictive edge from any State Spec V2 variable. Fail-closed.
 *
 * Evidence gating is intentionally deny-by-default: a claim is admissible only when its
 * class is granted to the emitting role AND every artifact it cites is in the ledger.
 */
import { sha256 } from "./ron-calibration.ts";
import { derivePromotedStateVariables } from "./ron-promotion-readiness.ts";

export const RON_AGENTIC_ARCHITECTURE_VERSION = 1;

/* --------------------------------------------------------- accepted evidence */

export type ArtifactKind = "lineage" | "calibration" | "research" | "recovery";

export interface AcceptedArtifact {
  id: string;
  kind: ArtifactKind;
  /** Immutable identity of the accepted artifact (run hash, digest or version tuple). */
  identity: string;
  /** What the artifact is permitted to support. Free-form but frozen at declaration. */
  supports: string;
}

/** The ONLY artifacts a RON role may cite. Extending this list is an audited change. */
export const ACCEPTED_EVIDENCE_LEDGER: readonly AcceptedArtifact[] = [
  {
    id: "lineage_2d1g",
    kind: "lineage",
    identity: "XAUUSD/15m quality_v5/feature_v6/label_v7 @ source_as_of=2026-08-13T05:14:00Z",
    supports: "the eligible bar universe, quarantine decisions and label definitions",
  },
  {
    id: "calibration_v8",
    kind: "calibration",
    identity: "f2511605fe5db78a074caa7c391e77d20c9b24e53b779bc62f983df99eb0b863",
    supports: "unconditional and hierarchy base rates with Wilson intervals on held-out data",
  },
  {
    id: "research_v4",
    kind: "research",
    identity: "e8636bfdeab3b9be08c9d90eff4ccf6e7ac54c1a2a73639b1a8029730dd9f903",
    supports: "the NEGATIVE result that no State Spec V2 candidate cleared the two-stage gate",
  },
  {
    id: "recovery_native_15m",
    kind: "recovery",
    identity: "552 genuine broker-native XAUUSD 15m bars, insertion-only, zero conflicts",
    supports: "coverage of holes A, C and the recoverable part of hole B",
  },
] as const;

export const LEDGER_IDS = ACCEPTED_EVIDENCE_LEDGER.map((a) => a.id);

/**
 * Research V4 promoted nothing. This list is the single source of truth for any
 * conditional-edge claim and stays EMPTY until a run passes the two-stage gate.
 *
 * 2D.2n: no longer a naked literal — it is DERIVED from the accepted promotion manifest
 * (`ron-promotion-readiness.ts`), which is empty and deny-by-default. The derivation is
 * pure and returns [] unless an audited, separately versioned, disjointly confirmed
 * promotion entry exists and independently validates. Value today: [].
 */
export const PROMOTED_STATE_VARIABLES: readonly string[] = derivePromotedStateVariables();

/* ------------------------------------------------------------- claim classes */

export type ClaimClass =
  | "observed_market_state"      // what the accepted lineage says the market did
  | "data_quality_status"        // quarantine / coverage / staleness statements
  | "base_rate"                  // calibrated unconditional or hierarchy rates
  | "conditional_edge"           // "variable X predicts outcome Y" — requires promotion
  | "signal_generation"          // Falconer or another pluggable generator's output
  | "execution_intent"           // proposed order actions
  | "research_verdict";          // statements about what research did or did not show

export interface RoleSpec {
  role: string;
  purpose: string;
  reads: readonly string[];      // artifact ids from the ledger
  may_claim: readonly ClaimClass[];
}

/** Specialist roles. Each is deny-by-default outside its declared claim classes. */
export const RON_ROLES: readonly RoleSpec[] = [
  {
    role: "observer",
    purpose: "Report the eligible, quality-gated market state without interpretation.",
    reads: ["lineage_2d1g", "recovery_native_15m"],
    may_claim: ["observed_market_state", "data_quality_status"],
  },
  {
    role: "statistician",
    purpose: "Quote calibrated base rates and their uncertainty; never invent conditioning.",
    reads: ["calibration_v8", "lineage_2d1g"],
    may_claim: ["base_rate", "research_verdict"],
  },
  {
    role: "researcher",
    purpose: "State what research established, including negative results, and nothing more.",
    reads: ["research_v4", "calibration_v8"],
    may_claim: ["research_verdict", "conditional_edge"],
  },
  {
    role: "signal_router",
    purpose: "Surface pluggable generator output (e.g. Falconer) labelled as such.",
    reads: ["lineage_2d1g"],
    may_claim: ["signal_generation", "observed_market_state"],
  },
  {
    role: "risk_governor",
    purpose: "Gate execution intent against safety limits and data-quality status.",
    reads: ["lineage_2d1g", "calibration_v8"],
    may_claim: ["execution_intent", "data_quality_status"],
  },
] as const;

export const ROLE_NAMES = RON_ROLES.map((r) => r.role);

/* ------------------------------------------------------------ evidence gate */

export interface Claim {
  role: string;
  claim_class: ClaimClass;
  cites: readonly string[];
  /** State Spec V2 variables the claim conditions on, if any. */
  conditions_on?: readonly string[];
}

export interface ClaimDecision {
  admissible: boolean;
  reasons: string[];
}

/** Deny-by-default admissibility check. Every failure reason is reported, not just the first. */
export function evaluateClaim(claim: Claim): ClaimDecision {
  const reasons: string[] = [];
  const role = RON_ROLES.find((r) => r.role === claim.role);

  if (!role) {
    return { admissible: false, reasons: [`unknown_role: ${claim.role}`] };
  }
  if (!role.may_claim.includes(claim.claim_class)) {
    reasons.push(`claim_class_not_granted: ${claim.role} may not emit ${claim.claim_class}`);
  }
  if (claim.cites.length === 0) {
    reasons.push("no_evidence_cited");
  }
  for (const id of claim.cites) {
    if (!LEDGER_IDS.includes(id)) reasons.push(`artifact_not_accepted: ${id}`);
    else if (!role.reads.includes(id)) reasons.push(`artifact_not_readable_by_role: ${id}`);
  }
  if (claim.claim_class === "conditional_edge") {
    const vars = claim.conditions_on ?? [];
    if (vars.length === 0) reasons.push("conditional_edge_without_declared_variables");
    for (const v of vars) {
      if (!PROMOTED_STATE_VARIABLES.includes(v)) {
        reasons.push(`state_variable_not_promoted: ${v} (research_v4 promoted none)`);
      }
    }
  }

  return { admissible: reasons.length === 0, reasons };
}

/* ----------------------------------------------------------------- payloads */

export function agenticArchitecturePayload() {
  return [
    "ron_agentic_architecture_version", RON_AGENTIC_ARCHITECTURE_VERSION,
    "deny_by_default", true,
    "promoted_state_variables", [...PROMOTED_STATE_VARIABLES],
    "accepted_evidence", [...ACCEPTED_EVIDENCE_LEDGER]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((a) => [a.id, a.kind, a.identity, a.supports]),
    "roles", [...RON_ROLES]
      .sort((a, b) => (a.role < b.role ? -1 : 1))
      .map((r) => [r.role, r.purpose, [...r.reads].sort(), [...r.may_claim].sort()]),
  ];
}

export async function agenticArchitectureHash() {
  return await sha256(agenticArchitecturePayload());
}
