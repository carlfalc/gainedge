/**
 * RON implementation marker 2D.2n (NEW marker) — PROSPECTIVE PROMOTION-READINESS /
 * RESEARCH-V5 HANDOFF FOUNDATION. Pure contract, no runtime behaviour, no I/O.
 *
 * Source position this module encodes, and nothing beyond it:
 *   - Research V4 (`ron-research-v4.ts`) is a frozen ACCEPTED NEGATIVE artifact: its
 *     two-stage gate promoted ZERO candidates. It therefore can never yield a promotion
 *     entry here, and this module never re-reads, re-runs or reinterprets it.
 *   - `PROMOTED_STATE_VARIABLES` must stay EMPTY. This module makes that emptiness a
 *     DERIVED consequence of an empty accepted manifest instead of a naked literal.
 *   - A future promotion must come from a SEPARATELY VERSIONED research contract
 *     (research_version > RESEARCH_VERSION_V4) whose confirmatory evidence is disjoint
 *     from, and strictly after, the discovery/selection data and the spec freeze.
 *
 * Deny-by-default: `ACCEPTED_PROMOTION_MANIFEST` is empty, and a non-empty manifest can
 * only ever come from an explicit, audited edit to this file (or an equally immutable
 * acceptance artifact referenced by one). Nothing in this module can promote anything
 * at runtime, from a database row, or from a `promising_for_2d2` flag.
 *
 * This module deliberately reuses ALREADY FROZEN accepted thresholds. It invents no new
 * numeric threshold. Where a future-data sufficiency threshold is NOT source-supported
 * today, it is declared as an UNRESOLVED PREREQUISITE that blocks promotion, rather than
 * being guessed at.
 */
import { sha256 } from "./ron-calibration.ts";
import { PROMOTION_GATE_V4, RESEARCH_VERSION_V4 } from "./ron-research-v4.ts";

export const RON_PROMOTION_READINESS_VERSION = 1;

/* ------------------------------------------------------------------- policy */

export const PROMOTION_READINESS_SPEC_V1 = {
  readiness_version: RON_PROMOTION_READINESS_VERSION,
  default_decision: "deny",
  manifest_mutation_surface: "audited_source_change_only",
  runtime_promotion_surface: "none",
  probability_policy: "no_probability_in_contract",
  execution_policy: "signal_only_execution_disallowed",
  frozen_negative_artifacts: ["research_v4"],
  /** A promotion candidate must be produced by a research contract newer than V4. */
  min_research_version_for_promotion: RESEARCH_VERSION_V4 + 1,
  /** Final gate semantics are INHERITED from the accepted V4 gate; nothing new invented. */
  inherited_gate_version: PROMOTION_GATE_V4.gate_version,
  inherited_holdout_role: PROMOTION_GATE_V4.holdout_role,
  inherited_holdout_infeasible_behaviour: PROMOTION_GATE_V4.holdout_infeasible_behaviour,
  confirmation_rule: "confirmatory_window_strictly_after_discovery_window_and_spec_freeze",
  selection_rule: "confirmatory_data_never_used_for_selection_ranking_or_tuning",
  reuse_rule: "already_consumed_holdout_or_identical_cutoff_is_not_fresh_confirmation",
  /**
   * Strict literal rule enforced in code: `confirmation_window.start > spec_frozen_at`.
   * Equality is NOT defensible — a window opening exactly at the freeze instant is not
   * strictly post-freeze evidence.
   */
  freeze_boundary_rule: "confirmation_window_start_must_be_strictly_greater_than_spec_frozen_at",
  /** Acceptance is never self-asserted by a manifest entry. */
  acceptance_binding_rule: "acceptance_artifact_and_every_prerequisite_resolution_must_match_explicit_accepted_registry",
} as const;

/**
 * Prerequisites that are NOT source-supported today. Each one BLOCKS promotion until an
 * entry cites an accepted artifact that resolves it. No number is invented here.
 */
export const UNRESOLVED_PROMOTION_PREREQUISITES: readonly string[] = [
  // How much genuinely post-freeze confirmatory data is "enough" has no accepted source.
  "confirmatory_sample_sufficiency_threshold",
  // No accepted artifact defines how a newer research contract is itself accepted.
  "research_contract_acceptance_procedure",
] as const;

/** Field names that must never appear anywhere in a manifest entry. */
const FORBIDDEN_KEY_SUBSTRINGS: readonly string[] = [
  "probability", "confidence", "expected_value", "edge_estimate",
  "entry", "stop", "target", "take_profit", "lot", "size", "qty", "risk_amount",
  "user", "account", "broker", "balance", "equity", "pnl", "profit",
  "token", "jwt", "authorization", "bearer", "api_key", "password", "secret",
  "cause", "causal", "because",
];

/* ------------------------------------------------------------------- shapes */

export interface PromotionWindow {
  /** ISO-8601 UTC instants, inclusive start / exclusive end. */
  start: string;
  end: string;
}

export interface AcceptedPromotionEntry {
  /** Immutable identity of the research artifact that produced this promotion. */
  research_version: number;
  research_run_id: string;
  research_run_identity_hash: string;
  research_contract_accepted: boolean;
  /** Immutable acceptance artifact that made the research contract admissible. */
  acceptance_artifact_id: string;
  acceptance_manifest_version: number;
  /** Candidate identity. */
  candidate_id: string;
  candidate_spec_hash: string;
  state_spec_version: number;
  state_spec_hash: string;
  direction: string;
  state_variables: readonly string[];
  /** Final-gate evidence — all three stages must be explicitly true. */
  gate_version: number;
  pre_holdout_gate_pass: boolean;
  holdout_gate_pass: boolean;
  final_promotion_pass: boolean;
  holdout_used_for_selection: boolean;
  /** Data provenance proving disjoint, post-freeze confirmation. */
  spec_frozen_at: string;
  discovery_window: PromotionWindow;
  confirmation_window: PromotionWindow;
  confirmation_source_identity: string;
  discovery_source_cutoff: string;
  confirmation_source_cutoff: string;
  /** Prerequisite id -> accepted artifact identity that resolves it. */
  prerequisite_resolutions: Readonly<Record<string, string>>;
}

/**
 * THE accepted manifest. EMPTY, because Research V4 — the only accepted research
 * artifact — produced ZERO final promotions. Adding an entry is an audited code change.
 */
export const ACCEPTED_PROMOTION_MANIFEST: readonly AcceptedPromotionEntry[] = [] as const;

/* ------------------------------------------------- accepted artifact registry */

export type AcceptedArtifactKind =
  | "research_contract_acceptance"
  | "prerequisite_resolution";

/**
 * One EXPLICITLY accepted artifact identity. Existence of a record here is the ONLY
 * admissible proof of acceptance; a boolean or a nonempty string inside a manifest entry
 * is a self-assertion and proves nothing.
 */
export interface AcceptedArtifactRecord {
  artifact_id: string;
  artifact_kind: AcceptedArtifactKind;
  /** Required for `research_contract_acceptance`: the research contract version accepted. */
  research_version?: number;
  /** Required for `prerequisite_resolution`: the prerequisite id this artifact resolves. */
  resolves_prerequisite?: string;
}

export interface AcceptanceRegistry {
  registry_version: number;
  artifacts: readonly AcceptedArtifactRecord[];
}

/**
 * THE production/current accepted-artifact registry. EMPTY: no post-V4 research contract
 * has been accepted, and neither unresolved prerequisite has an accepted resolution
 * artifact. Consequently every non-empty promotion entry is denied today.
 */
export const CURRENT_ACCEPTED_ARTIFACT_REGISTRY: AcceptanceRegistry = {
  registry_version: RON_PROMOTION_READINESS_VERSION,
  artifacts: [] as const,
} as const;

function findArtifact(
  registry: AcceptanceRegistry,
  artifactId: string,
  kind: AcceptedArtifactKind,
): AcceptedArtifactRecord | undefined {
  return (registry?.artifacts ?? []).find(
    (a) => a.artifact_id === artifactId && a.artifact_kind === kind,
  );
}

/* --------------------------------------------------------------- validation */

export interface PromotionValidation {
  admissible: boolean;
  reasons: string[];
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const instant = (v: unknown): number | null =>
  typeof v === "string" && ISO_UTC.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

function scanForbiddenKeys(value: unknown, path: string, hits: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanForbiddenKeys(v, `${path}[${i}]`, hits));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    for (const bad of FORBIDDEN_KEY_SUBSTRINGS) {
      if (lower.includes(bad)) hits.push(`forbidden_field: ${path}${path ? "." : ""}${k}`);
    }
    scanForbiddenKeys(v, `${path}${path ? "." : ""}${k}`, hits);
  }
}

/** Deny-by-default validation of ONE candidate promotion entry. Reports every reason. */
export function validatePromotionEntry(
  entry: AcceptedPromotionEntry,
  registry: AcceptanceRegistry = CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
): PromotionValidation {
  const reasons: string[] = [];

  // 1. Immutable, separately versioned research identity.
  if (!Number.isInteger(entry.research_version)
    || entry.research_version < PROMOTION_READINESS_SPEC_V1.min_research_version_for_promotion) {
    reasons.push(
      `research_version_not_separately_versioned: ${entry.research_version} < `
      + `${PROMOTION_READINESS_SPEC_V1.min_research_version_for_promotion} `
      + "(research_v4 is a frozen NEGATIVE artifact and can never promote)",
    );
  }
  if (!nonEmpty(entry.research_run_id)) reasons.push("missing_research_run_id");
  if (!/^[0-9a-f]{64}$/.test(entry.research_run_identity_hash ?? "")) {
    reasons.push("missing_or_malformed_research_run_identity_hash");
  }
  if (entry.research_contract_accepted !== true) reasons.push("research_contract_not_accepted");
  if (!nonEmpty(entry.acceptance_artifact_id)) reasons.push("missing_acceptance_artifact_id");
  else {
    const accepted = findArtifact(
      registry, entry.acceptance_artifact_id, "research_contract_acceptance",
    );
    if (!accepted) {
      reasons.push(
        `acceptance_artifact_not_in_accepted_registry: ${entry.acceptance_artifact_id}`,
      );
    } else if (accepted.research_version !== entry.research_version) {
      reasons.push(
        "acceptance_artifact_research_version_mismatch: "
        + `${accepted.research_version} != ${entry.research_version}`,
      );
    }
  }
  if (entry.acceptance_manifest_version !== RON_PROMOTION_READINESS_VERSION) {
    reasons.push("acceptance_manifest_version_mismatch");
  }

  // 2. Candidate identity.
  if (!nonEmpty(entry.candidate_id)) reasons.push("missing_candidate_id");
  if (!/^[0-9a-f]{64}$/.test(entry.candidate_spec_hash ?? "")) {
    reasons.push("missing_or_malformed_candidate_spec_hash");
  }
  if (!/^[0-9a-f]{64}$/.test(entry.state_spec_hash ?? "")) {
    reasons.push("missing_or_malformed_state_spec_hash");
  }
  if (!Number.isInteger(entry.state_spec_version)) reasons.push("missing_state_spec_version");
  if (!nonEmpty(entry.direction)) reasons.push("missing_direction");
  const vars = entry.state_variables ?? [];
  if (vars.length === 0) reasons.push("no_state_variables_declared");
  if (new Set(vars).size !== vars.length) reasons.push("duplicate_state_variable_in_entry");

  // 3. Explicit final-gate evidence. A `promising_for_2d2`-style flag is NOT a gate.
  if (entry.gate_version !== PROMOTION_READINESS_SPEC_V1.inherited_gate_version) {
    reasons.push(`gate_version_not_inherited_accepted_gate: ${entry.gate_version}`);
  }
  if (entry.pre_holdout_gate_pass !== true) reasons.push("pre_holdout_gate_not_passed");
  if (entry.holdout_gate_pass !== true) reasons.push("holdout_confirmation_gate_not_passed");
  if (entry.final_promotion_pass !== true) reasons.push("final_promotion_gate_not_passed");
  if (entry.holdout_used_for_selection !== false) {
    reasons.push("holdout_used_for_selection_or_tuning");
  }

  // 4. Disjoint, post-freeze confirmatory evidence.
  const frozen = instant(entry.spec_frozen_at);
  const dStart = instant(entry.discovery_window?.start);
  const dEnd = instant(entry.discovery_window?.end);
  const cStart = instant(entry.confirmation_window?.start);
  const cEnd = instant(entry.confirmation_window?.end);
  if (frozen == null) reasons.push("missing_or_malformed_spec_frozen_at");
  if (dStart == null || dEnd == null) reasons.push("missing_or_malformed_discovery_window");
  if (cStart == null || cEnd == null) reasons.push("missing_or_malformed_confirmation_window");
  if (dStart != null && dEnd != null && dEnd <= dStart) reasons.push("empty_discovery_window");
  if (cStart != null && cEnd != null && cEnd <= cStart) reasons.push("empty_confirmation_window");
  if (dEnd != null && cStart != null && cStart < dEnd) {
    reasons.push("confirmation_window_overlaps_discovery_window");
  }
  if (frozen != null && cStart != null && cStart <= frozen) {
    reasons.push("confirmation_window_starts_before_spec_freeze");
  }
  if (!nonEmpty(entry.confirmation_source_identity)) {
    reasons.push("missing_confirmation_source_identity");
  }
  const dCut = instant(entry.discovery_source_cutoff);
  const cCut = instant(entry.confirmation_source_cutoff);
  if (dCut == null) reasons.push("missing_or_malformed_discovery_source_cutoff");
  if (cCut == null) reasons.push("missing_or_malformed_confirmation_source_cutoff");
  if (dCut != null && cCut != null && cCut <= dCut) {
    reasons.push("confirmation_source_cutoff_not_after_discovery_cutoff (same-data replay)");
  }

  // 5. Unresolved prerequisites block promotion instead of being guessed at.
  const res = entry.prerequisite_resolutions ?? {};
  for (const p of UNRESOLVED_PROMOTION_PREREQUISITES) {
    if (!nonEmpty(res[p])) {
      reasons.push(`unresolved_prerequisite: ${p}`);
      continue;
    }
    const artifact = findArtifact(registry, res[p], "prerequisite_resolution");
    if (!artifact) {
      reasons.push(`unresolved_prerequisite: ${p} (resolution_artifact_not_in_accepted_registry: ${res[p]})`);
    } else if (artifact.resolves_prerequisite !== p) {
      reasons.push(`unresolved_prerequisite: ${p} (resolution_artifact_resolves_different_prerequisite: ${artifact.resolves_prerequisite})`);
    }
  }

  // 6. No forbidden field may ride along.
  scanForbiddenKeys(entry, "", reasons);

  return { admissible: reasons.length === 0, reasons };
}

/** Validate a whole manifest, including cross-entry contradictions. */
export function validatePromotionManifest(
  entries: readonly AcceptedPromotionEntry[],
  registry: AcceptanceRegistry = CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
): PromotionValidation {
  const reasons: string[] = [];
  entries.forEach((e, i) => {
    for (const r of validatePromotionEntry(e, registry).reasons) reasons.push(`entry[${i}]: ${r}`);
  });

  const byVariable = new Map<string, string>();
  for (const e of entries) {
    for (const v of e.state_variables ?? []) {
      const prior = byVariable.get(v);
      if (prior === undefined) byVariable.set(v, e.direction);
      else if (prior !== e.direction) reasons.push(`contradictory_variable_direction: ${v}`);
      else reasons.push(`duplicate_variable_across_entries: ${v}`);
    }
  }
  const ids = entries.map((e) => e.candidate_id);
  if (new Set(ids).size !== ids.length) reasons.push("duplicate_candidate_id_in_manifest");

  return { admissible: reasons.length === 0, reasons };
}

/**
 * The ONLY admissible derivation of promoted state variables. Deterministic, sorted, and
 * EMPTY unless every entry in the accepted manifest independently validates.
 */
export function derivePromotedStateVariables(
  entries: readonly AcceptedPromotionEntry[] = ACCEPTED_PROMOTION_MANIFEST,
  registry: AcceptanceRegistry = CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
): readonly string[] {
  if (entries.length === 0) return [];
  if (!validatePromotionManifest(entries, registry).admissible) return [];
  return [...new Set(entries.flatMap((e) => [...e.state_variables]))].sort();
}

/* ----------------------------------------------------------------- payloads */

function entryPayload(e: AcceptedPromotionEntry) {
  return [
    e.research_version, e.research_run_id, e.research_run_identity_hash,
    e.acceptance_artifact_id, e.candidate_id, e.candidate_spec_hash,
    e.state_spec_version, e.state_spec_hash, e.direction,
    [...e.state_variables].sort(),
    e.gate_version, e.pre_holdout_gate_pass, e.holdout_gate_pass, e.final_promotion_pass,
    e.holdout_used_for_selection, e.spec_frozen_at,
    [e.discovery_window.start, e.discovery_window.end],
    [e.confirmation_window.start, e.confirmation_window.end],
    e.confirmation_source_identity, e.discovery_source_cutoff, e.confirmation_source_cutoff,
    Object.keys(e.prerequisite_resolutions ?? {}).sort()
      .map((k) => [k, e.prerequisite_resolutions[k]]),
  ];
}

/** Canonical, input-order-independent payload of the accepted manifest. */
export function promotionManifestPayload(
  entries: readonly AcceptedPromotionEntry[] = ACCEPTED_PROMOTION_MANIFEST,
  registry: AcceptanceRegistry = CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
) {
  return [
    "ron_promotion_readiness_version", RON_PROMOTION_READINESS_VERSION,
    "policy", Object.keys(PROMOTION_READINESS_SPEC_V1).sort()
      .map((k) => [k, (PROMOTION_READINESS_SPEC_V1 as Record<string, unknown>)[k]]),
    "unresolved_prerequisites", [...UNRESOLVED_PROMOTION_PREREQUISITES].sort(),
    "accepted_artifact_registry", [
      registry.registry_version,
      [...(registry.artifacts ?? [])]
        .sort((a, b) => (a.artifact_id < b.artifact_id ? -1 : a.artifact_id > b.artifact_id ? 1 : 0))
        .map((a) => [
          a.artifact_id, a.artifact_kind,
          a.research_version ?? null, a.resolves_prerequisite ?? null,
        ]),
    ],
    "accepted_entries", [...entries]
      .sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : a.candidate_id > b.candidate_id ? 1 : 0))
      .map(entryPayload),
    "derived_promoted_state_variables", [...derivePromotedStateVariables(entries, registry)],
  ];
}

export async function promotionManifestHash(
  entries: readonly AcceptedPromotionEntry[] = ACCEPTED_PROMOTION_MANIFEST,
  registry: AcceptanceRegistry = CURRENT_ACCEPTED_ARTIFACT_REGISTRY,
) {
  return await sha256(promotionManifestPayload(entries, registry));
}