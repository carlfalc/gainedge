/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — OPPORTUNITY CONTEXT SPEC V2 (forward only).
 *
 * V2 changes EXACTLY three things relative to the frozen V1 producer:
 *
 *   1. INSTRUMENT SCOPE. V1 admits XAUUSD alone. V2 admits the declared pilot set from
 *      the forward instrument binding registry, and only via the additive, validated
 *      `forward_scope` binding — the frozen V1 spec object, its hash and its default
 *      admission behaviour are untouched.
 *   2. VENUE TRUTH IS REQUIRED. V2 will not produce context unless the caller supplies a
 *      venue state that is provably `open` or `closed`. `calendar_unavailable` and
 *      `unregistered` are refused, so HK50 cannot be reasoned about while the HKEX
 *      holiday calendar is not authoritative.
 *   3. THE ORCHESTRATION DECISION IS OPTIONAL, AND ITS ABSENCE IS REPORTED. Only XAUUSD
 *      has an accepted seven-agent orchestration lineage. For every other pilot
 *      instrument there are no sealed specialist envelopes, so every context state is
 *      genuinely `unavailable` and the record says so rather than implying evidence.
 *
 * Everything else — the categorical vocabularies, the lifecycle construction, the
 * material-change derivation, the data-blocked separation — is the frozen V1 logic,
 * reused unmodified. V2 adds no probability, no score, no threshold, no causal claim and
 * no execution intent, and it never claims a base rate for an instrument that has no
 * accepted calibration artifact.
 */
import { hashCanonical } from "./ron-agent-contracts.ts";
import {
  buildHaPatternContextV1, HA_PATTERN_CONTEXT_SPEC_V1,
  type HaPatternContextInputV1, type HaPatternContextResultV1,
} from "./ron-ha-pattern-context-spec-v1.ts";
import {
  buildOpportunityContextV1, OPPORTUNITY_CONTEXT_SPEC_V1,
  opportunityContextSpecHashV1, OpportunityContextAnchorError,
  type OpportunityContextInputV1, type OpportunityContextResultV1,
} from "./ron-opportunity-context-spec-v1.ts";
import {
  calibrationAvailable, FORWARD_CONTEXT_INSTRUMENTS, instrumentBinding,
  relationshipsFor, RON_FORWARD_INSTRUMENT_BINDING_VERSION,
  type ForwardScopeBinding,
} from "./ron-forward-instrument-binding-v1.ts";
import type { VenueState } from "./ron-venue-registry-v1.ts";

export const OPPORTUNITY_CONTEXT_SPEC_VERSION_V2 = 2;

export const OPPORTUNITY_CONTEXT_SPEC_V2 = {
  spec_id: OPPORTUNITY_CONTEXT_SPEC_V1.spec_id,
  spec_version: OPPORTUNITY_CONTEXT_SPEC_VERSION_V2,
  supersedes_spec_version: OPPORTUNITY_CONTEXT_SPEC_V1.spec_version,
  instrument_scope: FORWARD_CONTEXT_INSTRUMENTS,
  timeframe_scope: OPPORTUNITY_CONTEXT_SPEC_V1.timeframe_scope,
  bar_minutes: OPPORTUNITY_CONTEXT_SPEC_V1.bar_minutes,
  forward_instrument_binding_version: RON_FORWARD_INSTRUMENT_BINDING_VERSION,

  deltas_from_v1: [
    "instrument_scope_widened_to_declared_pilot_binding",
    "venue_state_required_and_must_be_open_or_closed",
    "orchestration_decision_optional_and_absence_reported",
  ],

  invariants_inherited_from_v1: [
    "categorical_vocabularies_unchanged",
    "lifecycle_and_material_change_construction_unchanged",
    "data_blocked_reported_separately_from_lifecycle",
    "no_numeric_probability",
    "no_execution_intent",
    "no_causal_claim",
  ],

  calibration_contract: {
    consumed: false,
    base_rate_emitted: false,
    reason:
      "no instrument outside the accepted XAUUSD calibration lineage has a sealed "
      + "calibration artifact, so no base rate may be attached to any context record",
  },
} as const;

export function opportunityContextSpecHashV2(): Promise<string> {
  return hashCanonical(OPPORTUNITY_CONTEXT_SPEC_V2);
}

const HA_FORWARD_SCOPE: ForwardScopeBinding = {
  binding_spec_id: HA_PATTERN_CONTEXT_SPEC_V1.spec_id,
  binding_spec_version: OPPORTUNITY_CONTEXT_SPEC_VERSION_V2,
  instrument_scope: FORWARD_CONTEXT_INSTRUMENTS,
};

const OPP_FORWARD_SCOPE: ForwardScopeBinding = {
  binding_spec_id: OPPORTUNITY_CONTEXT_SPEC_V1.spec_id,
  binding_spec_version: OPPORTUNITY_CONTEXT_SPEC_VERSION_V2,
  instrument_scope: FORWARD_CONTEXT_INSTRUMENTS,
};

export const haForwardScopeV2 = (): ForwardScopeBinding => ({ ...HA_FORWARD_SCOPE });
export const oppForwardScopeV2 = (): ForwardScopeBinding => ({ ...OPP_FORWARD_SCOPE });

export type OpportunityContextV2Rejection =
  | "instrument_not_forward_bound"
  | "venue_state_not_authoritative"
  | "calibration_claim_not_permitted";

export class OpportunityContextV2Error extends Error {
  override readonly name = "OpportunityContextV2Error";
  constructor(readonly reason: OpportunityContextV2Rejection, readonly detail?: string) {
    super(`opportunity_context_v2_rejected: ${reason}${detail ? `:${detail}` : ""}`);
  }
}

export interface OpportunityContextV2Input
  extends Omit<OpportunityContextInputV1, "forward_scope"> {
  /** Venue truth for the evaluation anchor. Must be provably open or closed. */
  venue_state: VenueState;
  /** True when a stored seven-agent orchestration decision backs this anchor. */
  decision_bound: boolean;
}

export interface OpportunityContextResultV2 extends OpportunityContextResultV1 {
  base_spec_version: number;
  base_spec_hash: string;
  venue_state: VenueState;
  decision_bound: boolean;
  orchestration_lineage_available: boolean;
  calibration_artifact_available: boolean;
  declared_cross_asset_references: string[];
}

/** Guard used by both the HA and the Opportunity stage. */
export function assertForwardInstrument(instrument: string, venue_state: VenueState): void {
  if (!FORWARD_CONTEXT_INSTRUMENTS.includes(instrument)) {
    throw new OpportunityContextV2Error("instrument_not_forward_bound", instrument);
  }
  if (venue_state !== "open" && venue_state !== "closed") {
    throw new OpportunityContextV2Error("venue_state_not_authoritative", venue_state);
  }
}

/** HA Pattern Context V1 evaluated under the V2 forward instrument binding. */
export function buildHaPatternContextV2(
  input: Omit<HaPatternContextInputV1, "forward_scope">,
): Promise<HaPatternContextResultV1> {
  return buildHaPatternContextV1({ ...input, forward_scope: haForwardScopeV2() });
}

export async function buildOpportunityContextV2(
  input: OpportunityContextV2Input,
): Promise<OpportunityContextResultV2> {
  assertForwardInstrument(input.instrument, input.venue_state);
  const binding = instrumentBinding(input.instrument);
  if (!binding) {
    throw new OpportunityContextV2Error("instrument_not_forward_bound", input.instrument);
  }

  const { venue_state, decision_bound, ...v1Input } = input;
  const base = await buildOpportunityContextV1({
    ...v1Input, forward_scope: oppForwardScopeV2(),
  });

  const limitations = [...base.limitations];
  if (!binding.orchestration_lineage_available) {
    limitations.push(
      "no accepted seven-agent orchestration lineage exists for this instrument, so no "
      + "sealed specialist evidence backs this record and every context state is reported "
      + "as unavailable rather than assumed",
    );
  }
  if (!decision_bound) {
    limitations.push(
      "no stored orchestration decision is bound to this evaluation anchor",
    );
  }
  if (!calibrationAvailable(input.instrument)) {
    limitations.push(
      "no sealed calibration artifact exists for this instrument, so no base rate, "
      + "probability or historical hit-rate may be attached to this record",
    );
  }
  if (venue_state === "closed") {
    limitations.push("the venue was closed at this evaluation anchor");
  }

  return {
    ...base,
    spec_version: OPPORTUNITY_CONTEXT_SPEC_VERSION_V2,
    spec_hash: await opportunityContextSpecHashV2(),
    base_spec_version: OPPORTUNITY_CONTEXT_SPEC_V1.spec_version,
    base_spec_hash: await opportunityContextSpecHashV1(),
    venue_state,
    decision_bound,
    orchestration_lineage_available: binding.orchestration_lineage_available,
    calibration_artifact_available: binding.calibration_artifact_available,
    declared_cross_asset_references: relationshipsFor(input.instrument)
      .map((r) => (r.subject === input.instrument ? r.reference : r.subject))
      .sort(),
    limitations,
  };
}

export { OpportunityContextAnchorError };
