/**
 * RON implementation marker 2D.2o (NEW marker) — RESEARCH CONTRACT ACCEPTANCE PROCEDURE
 * FOUNDATION. Pure contract, no runtime behaviour, no I/O, no database, no probability,
 * no execution, no statistical threshold.
 *
 * This module resolves EXACTLY ONE previously unresolved promotion prerequisite:
 * `research_contract_acceptance_procedure` — "no accepted artifact defines how a newer
 * research contract is itself accepted".
 *
 * It does NOT resolve `confirmatory_sample_sufficiency_threshold`: how much post-freeze
 * confirmatory data is "enough" has no accepted source, and inventing a number here would
 * be an arbitrary methodological choice. That prerequisite stays promotion-blocking.
 *
 * Everything the procedure requires is taken from ALREADY ACCEPTED source semantics:
 *   - the immutable research contract identity/version surface of `ron-research-v4.ts`
 *     (`RESEARCH_VERSION_V4`, and the seven frozen contract hashes returned by
 *     `v4ContractHashes()`), which are exactly the surfaces determining candidate
 *     generation, state construction, continuity/folds and gate semantics;
 *   - the V4 rule that the holdout is `final_confirmation_only_never_selection_or_tuning`;
 *   - the V4 rule that the gate is `frozen_before_run`.
 * No new methodological semantic is invented.
 *
 * This module MUST NOT import `ron-promotion-readiness.ts` (that module imports this one).
 */
import { sha256 } from "./ron-calibration.ts";
import { PROMOTION_GATE_V4, RESEARCH_VERSION_V4 } from "./ron-research-v4.ts";

export const RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION = 1;

/** The one prerequisite this module resolves. Owned here to avoid a circular import. */
export const RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID = "research_contract_acceptance_procedure";

/** The prerequisite this module explicitly does NOT resolve. */
export const SAMPLE_SUFFICIENCY_PREREQUISITE_ID = "confirmatory_sample_sufficiency_threshold";

/**
 * The frozen research-definition surfaces that must be hash-pinned BEFORE any confirmatory
 * data may be consulted. These names are exactly the keys of `v4ContractHashes()`; a test
 * asserts that equality so this list can never silently drift from accepted source.
 */
export const REQUIRED_FROZEN_SPEC_SURFACES: readonly string[] = [
  "candidate_spec_hash",      // candidate generation
  "continuity_contract_hash", // continuity
  "continuity_source_hash",   // admissible data source identity
  "fold_definition_hash",     // folds / purging
  "promotion_gate_hash",      // gate semantics
  "state_spec_hash",          // state construction
  "venue_calendar_hash",      // venue-time semantics the continuity measure depends on
] as const;

/** How an acceptance artifact may come into existence. Anything else is denied. */
export const ADMISSIBLE_ACCEPTANCE_ORIGIN = "audited_source_change";
export const INADMISSIBLE_ACCEPTANCE_ORIGINS: readonly string[] = [
  "runtime_state", "database_row", "promising_flag", "operator_assertion", "self_asserted",
] as const;

export const RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE = {
  procedure_version: RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
  resolves_prerequisite: RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID,
  does_not_resolve: [SAMPLE_SUFFICIENCY_PREREQUISITE_ID],
  default_decision: "deny",
  /** Only a separately versioned contract NEWER than the frozen V4 negative may be accepted. */
  min_research_version: RESEARCH_VERSION_V4 + 1,
  frozen_negative_research_version: RESEARCH_VERSION_V4,
  acceptance_origin: ADMISSIBLE_ACCEPTANCE_ORIGIN,
  inadmissible_origins: INADMISSIBLE_ACCEPTANCE_ORIGINS,
  required_frozen_spec_surfaces: REQUIRED_FROZEN_SPEC_SURFACES,
  freeze_before_confirmation_rule:
    "every_required_spec_surface_hash_and_contract_identity_frozen_strictly_before_confirmation_start",
  /** Inherited verbatim from the accepted V4 gate; nothing new is invented. */
  inherited_gate_frozen_before_run: PROMOTION_GATE_V4.frozen_before_run,
  inherited_holdout_role: PROMOTION_GATE_V4.holdout_role,
  selection_rule: "confirmatory_data_never_used_for_selection_ranking_or_tuning",
  sufficiency_rule: "no_sample_sufficiency_threshold_is_defined_by_this_procedure",
  statistical_threshold_policy: "none_invented_here",
} as const;

/* --------------------------------------------------------------- validation */

export interface ResearchContractAcceptanceClaim {
  /** Must match this module's version and pinned procedure hash. */
  procedure_version: number;
  procedure_hash: string;
  /** Immutable identity of the research contract being accepted. */
  research_version: number;
  contract_identity: string;
  contract_frozen_at: string;
  /** surface name -> 64-hex frozen hash. Must cover exactly the required surfaces. */
  frozen_spec_hashes: Readonly<Record<string, string>>;
  /** First instant at which confirmatory data may be consulted. */
  confirmation_start: string;
  confirmation_used_for_selection: boolean;
  confirmation_used_for_tuning: boolean;
  acceptance_origin: string;
}

export interface AcceptanceValidation {
  admissible: boolean;
  reasons: string[];
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const instant = (v: unknown): number | null =>
  typeof v === "string" && ISO_UTC.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const hex64 = (v: unknown): boolean => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/**
 * Deny-by-default validation of a hypothetical FUTURE research-contract acceptance claim.
 * Nothing in production supplies such a claim today; no post-V4 contract exists.
 */
export function validateResearchContractAcceptance(
  claim: ResearchContractAcceptanceClaim,
  procedureHash: string = RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
): AcceptanceValidation {
  const reasons: string[] = [];
  if (!claim || typeof claim !== "object") return { admissible: false, reasons: ["missing_claim"] };

  if (claim.procedure_version !== RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION) {
    reasons.push(`procedure_version_mismatch: ${claim.procedure_version}`);
  }
  if (claim.procedure_hash !== procedureHash) reasons.push("procedure_hash_mismatch");

  if (!Number.isInteger(claim.research_version)
    || claim.research_version < RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE.min_research_version) {
    reasons.push(
      `research_version_not_after_frozen_negative: ${claim.research_version} < `
      + `${RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE.min_research_version}`,
    );
  }
  if (!nonEmpty(claim.contract_identity)) reasons.push("missing_contract_identity");

  const hashes = claim.frozen_spec_hashes ?? {};
  for (const s of REQUIRED_FROZEN_SPEC_SURFACES) {
    if (!(s in hashes)) reasons.push(`missing_frozen_spec_surface: ${s}`);
    else if (!hex64(hashes[s])) reasons.push(`malformed_frozen_spec_hash: ${s}`);
  }
  for (const k of Object.keys(hashes)) {
    if (!REQUIRED_FROZEN_SPEC_SURFACES.includes(k)) {
      reasons.push(`unknown_frozen_spec_surface: ${k}`);
    }
  }

  const frozenAt = instant(claim.contract_frozen_at);
  const confStart = instant(claim.confirmation_start);
  if (frozenAt == null) reasons.push("missing_or_malformed_contract_frozen_at");
  if (confStart == null) reasons.push("missing_or_malformed_confirmation_start");
  if (frozenAt != null && confStart != null && confStart <= frozenAt) {
    reasons.push("confirmation_start_not_strictly_after_contract_freeze");
  }

  if (claim.confirmation_used_for_selection !== false) {
    reasons.push("confirmation_data_used_for_selection_or_ranking");
  }
  if (claim.confirmation_used_for_tuning !== false) {
    reasons.push("confirmation_data_used_for_tuning");
  }

  if (claim.acceptance_origin !== ADMISSIBLE_ACCEPTANCE_ORIGIN) {
    reasons.push(`acceptance_origin_not_audited_source_change: ${String(claim.acceptance_origin)}`);
  }

  return { admissible: reasons.length === 0, reasons };
}

/* ----------------------------------------------------------------- payloads */

/** Canonical, input-order-independent payload of the procedure itself. */
export function researchContractAcceptancePayload() {
  const p = RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE as Record<string, unknown>;
  return [
    "ron_research_contract_acceptance_version", RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION,
    "procedure", Object.keys(p).sort().map((k) => [
      k, Array.isArray(p[k]) ? [...(p[k] as unknown[])].map(String).sort() : p[k],
    ]),
  ];
}

export async function researchContractAcceptanceHash() {
  return await sha256(researchContractAcceptancePayload());
}

/**
 * PINNED canonical hash of the procedure above. Synchronous so that registry validation
 * stays pure/sync; a test asserts it equals `await researchContractAcceptanceHash()`, so it
 * can never drift from the contract it pins.
 */
export const RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH =
  "f4a92124555372e2b1e423f0cd6c9370b740be9642bd178ffca09a53e510547e";

/** Stable identity of the accepted prerequisite-resolution artifact for this procedure. */
export const RESEARCH_CONTRACT_ACCEPTANCE_ARTIFACT_ID =
  `prerequisite_resolution.${RESEARCH_CONTRACT_ACCEPTANCE_PREREQUISITE_ID}.v${RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION}`;

/* ------------------------------------------- 2D.2p claim binding (prospective) */
/**
 * RON implementation marker 2D.2p — RESEARCH-CONTRACT ACCEPTANCE ARTIFACT BINDING.
 *
 * Registry validation alone can never prove that a `research_contract_acceptance` artifact
 * corresponds to a claim that actually passed `validateResearchContractAcceptance`: the
 * claim is not present in the registry. So the binding works in two halves:
 *   - `buildResearchContractAcceptanceArtifact(claim)` is the ONLY admissible way to mint
 *     such an artifact. It validates the claim first and fails closed otherwise, and it
 *     computes the canonical claim hash itself.
 *   - the registry then structurally enforces that the artifact carries the full immutable
 *     binding, that the procedure version/hash are exactly the accepted 2D.2o ones, and
 *     that the artifact id is the deterministic function of the binding.
 * Nothing here creates, accepts or persists an artifact in production.
 */
export const RESEARCH_CONTRACT_ACCEPTANCE_CLAIM_PAYLOAD_VERSION = 1;

/** Deterministic, key-order-independent hash of the frozen spec surface map. */
export function frozenSpecMapPayload(hashes: Readonly<Record<string, string>>) {
  return Object.keys(hashes ?? {}).sort().map((k) => [k, hashes[k]]);
}

export async function frozenSpecMapHash(hashes: Readonly<Record<string, string>>) {
  return await sha256(frozenSpecMapPayload(hashes));
}

/**
 * Canonical, input-order-independent payload of a claim. Binds EVERY field that determines
 * procedure admissibility, and nothing else — no probability, execution, user or private data.
 */
export function researchContractAcceptanceClaimPayload(claim: ResearchContractAcceptanceClaim) {
  return [
    "ron_research_contract_acceptance_claim", RESEARCH_CONTRACT_ACCEPTANCE_CLAIM_PAYLOAD_VERSION,
    "procedure_version", claim?.procedure_version ?? null,
    "procedure_hash", claim?.procedure_hash ?? null,
    "research_version", claim?.research_version ?? null,
    "contract_identity", claim?.contract_identity ?? null,
    "contract_frozen_at", claim?.contract_frozen_at ?? null,
    "frozen_spec_hashes", frozenSpecMapPayload(claim?.frozen_spec_hashes ?? {}),
    "confirmation_start", claim?.confirmation_start ?? null,
    "confirmation_used_for_selection", claim?.confirmation_used_for_selection ?? null,
    "confirmation_used_for_tuning", claim?.confirmation_used_for_tuning ?? null,
    "acceptance_origin", claim?.acceptance_origin ?? null,
  ];
}

export async function researchContractAcceptanceClaimHash(claim: ResearchContractAcceptanceClaim) {
  return await sha256(researchContractAcceptanceClaimPayload(claim));
}

/** Immutable binding a future `research_contract_acceptance` artifact MUST carry. */
export interface ResearchContractAcceptanceBinding {
  research_version: number;
  contract_identity: string;
  contract_frozen_at: string;
  claim_hash: string;
  frozen_spec_map_hash: string;
  procedure_version: number;
  procedure_hash: string;
}

/** Deterministic artifact identity derived from the binding. Structurally checkable. */
export function researchContractAcceptanceArtifactId(
  binding: ResearchContractAcceptanceBinding,
): string {
  return `research_contract_acceptance.v${binding.research_version}.`
    + `${binding.contract_identity}.${binding.claim_hash.slice(0, 16)}`;
}

export interface BuiltResearchContractAcceptanceArtifact {
  artifact_id: string;
  artifact_kind: "research_contract_acceptance";
  contract_binding: ResearchContractAcceptanceBinding;
}

export type BuildAcceptanceArtifactResult =
  | { built: true; artifact: BuiltResearchContractAcceptanceArtifact; reasons: [] }
  | { built: false; artifact: null; reasons: string[] };

/**
 * The ONLY admissible way to mint a future research-contract acceptance artifact. Pure and
 * fail-closed: an inadmissible claim yields no artifact. Production never calls this.
 */
export async function buildResearchContractAcceptanceArtifact(
  claim: ResearchContractAcceptanceClaim,
  procedureHash: string = RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH,
): Promise<BuildAcceptanceArtifactResult> {
  const validation = validateResearchContractAcceptance(claim, procedureHash);
  if (!validation.admissible) return { built: false, artifact: null, reasons: validation.reasons };

  const binding: ResearchContractAcceptanceBinding = {
    research_version: claim.research_version,
    contract_identity: claim.contract_identity,
    contract_frozen_at: claim.contract_frozen_at,
    claim_hash: await researchContractAcceptanceClaimHash(claim),
    frozen_spec_map_hash: await frozenSpecMapHash(claim.frozen_spec_hashes),
    procedure_version: claim.procedure_version,
    procedure_hash: claim.procedure_hash,
  };
  return {
    built: true,
    reasons: [],
    artifact: {
      artifact_id: researchContractAcceptanceArtifactId(binding),
      artifact_kind: "research_contract_acceptance",
      contract_binding: binding,
    },
  };
}

/** Pure, structural, deny-by-default validation of an artifact binding. */
export function validateResearchContractAcceptanceBinding(
  binding: ResearchContractAcceptanceBinding | undefined | null,
  artifactId: string,
): AcceptanceValidation {
  const reasons: string[] = [];
  if (!binding || typeof binding !== "object") {
    return { admissible: false, reasons: ["missing_contract_binding"] };
  }
  if (!Number.isInteger(binding.research_version)
    || binding.research_version < RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE.min_research_version) {
    reasons.push("binding_research_version_not_after_frozen_negative");
  }
  if (!nonEmpty(binding.contract_identity)) reasons.push("binding_missing_contract_identity");
  if (instant(binding.contract_frozen_at) == null) {
    reasons.push("binding_missing_or_malformed_contract_frozen_at");
  }
  if (!hex64(binding.claim_hash)) reasons.push("binding_malformed_claim_hash");
  if (!hex64(binding.frozen_spec_map_hash)) reasons.push("binding_malformed_frozen_spec_map_hash");
  if (binding.procedure_version !== RON_RESEARCH_CONTRACT_ACCEPTANCE_VERSION) {
    reasons.push("binding_procedure_version_mismatch");
  }
  if (binding.procedure_hash !== RESEARCH_CONTRACT_ACCEPTANCE_PROCEDURE_HASH) {
    reasons.push("binding_procedure_hash_mismatch");
  }
  if (reasons.length === 0 && artifactId !== researchContractAcceptanceArtifactId(binding)) {
    reasons.push("binding_artifact_id_not_derived_from_binding");
  }
  return { admissible: reasons.length === 0, reasons };
}