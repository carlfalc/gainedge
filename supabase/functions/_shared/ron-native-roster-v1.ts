/**
 * GAINEDGE_RON_ALWAYS_ON_RUNTIME_COMPLETION_V1 — RON-NATIVE RUNTIME ROSTER V1.
 *
 * Pure, deterministic, side-effect free. It answers exactly one question truthfully:
 * for a given instrument and evaluation anchor, WHICH RON-native components are
 * applicable, which of those are REQUIRED before Opportunity Context may be treated as
 * evidence-complete, and which observed component runs actually settled.
 *
 * Truthfulness rules encoded here:
 *   • `falconer_signal_source` is NOT a RON-native component. It is a legacy, explicitly
 *     non-authoritative strategy adjunct. It is never required, never counted toward
 *     completeness and never gates Opportunity Context. Its data stays intact.
 *   • No component is invented to preserve a headline number. The roster is exactly the
 *     set of RON components that genuinely exist in this repo today: FOUR analytical
 *     specialists plus TWO governance/construction gates.
 *   • Conditional components declare their applicability predicate explicitly, so an
 *     inapplicable component is reported as `not_applicable` — never as a silent absence
 *     and never as a failure.
 *   • Absence is never inferred as success. A required component with no observed run is
 *     `missing`, and the cycle is `incomplete`.
 */
import { relationshipsFor } from "./ron-forward-instrument-binding-v1.ts";

export const RON_NATIVE_ROSTER_VERSION = 1;

/** What a component is for. Analytical market evidence vs governance/readiness gating. */
export type ComponentClass =
  | "analytical_specialist"
  | "governance_gate"
  | "opportunity_construction";

/** When a component applies to a cycle. */
export type Applicability = "always" | "conditional";

export interface RonNativeComponent {
  component_id: string;
  component_class: ComponentClass;
  applicability: Applicability;
  /** Required components must settle before a cycle is evidence-complete. */
  required: boolean;
  purpose: string;
}

/**
 * The complete RON-native roster. SIX members. Extending it is an audited change and
 * must be backed by a component that genuinely exists and genuinely runs.
 */
export const RON_NATIVE_ROSTER: readonly RonNativeComponent[] = Object.freeze([
  {
    component_id: "session_market_structure",
    component_class: "analytical_specialist",
    applicability: "always",
    required: true,
    purpose: "Deterministic session/venue and market-structure observations from genuine bars.",
  },
  {
    component_id: "pattern_context",
    component_class: "analytical_specialist",
    applicability: "always",
    required: true,
    purpose: "Qualitative pattern and structure context. Never a predictive claim.",
  },
  {
    component_id: "macro_news_geopolitics",
    component_class: "analytical_specialist",
    applicability: "always",
    required: true,
    purpose:
      "Scheduled/observed macro event context. A cycle with no relevant event must report "
      + "an explicit no-material-event state, never absence.",
  },
  {
    component_id: "cross_asset_correlation",
    component_class: "analytical_specialist",
    applicability: "conditional",
    required: true,
    purpose:
      "Descriptive co-movement context. Applies ONLY when a cross-asset relationship is "
      + "explicitly declared for the instrument; otherwise not applicable.",
  },
  {
    component_id: "calibration_model_validation",
    component_class: "governance_gate",
    applicability: "always",
    required: true,
    purpose:
      "Readiness/staleness gate over the accepted calibration and research lineage. A gate, "
      + "NOT a market-analysis specialist.",
  },
  {
    component_id: "opportunity_risk",
    component_class: "opportunity_construction",
    applicability: "always",
    required: true,
    purpose:
      "Assembles the qualitative opportunity context under the evidence-compatibility "
      + "contract. Construction/gating, NOT independent market analysis.",
  },
]);

/**
 * Legacy strategy adjuncts. Present in the registry and in stored history, but explicitly
 * outside the RON-native roster for this phase.
 */
export const RON_OPTIONAL_ADJUNCTS: readonly string[] = Object.freeze([
  "falconer_signal_source",
]);

export const RON_NATIVE_COMPONENT_IDS: readonly string[] =
  RON_NATIVE_ROSTER.map((c) => c.component_id);

export const RON_ANALYTICAL_COMPONENT_IDS: readonly string[] = RON_NATIVE_ROSTER
  .filter((c) => c.component_class === "analytical_specialist").map((c) => c.component_id);

export const RON_GATE_COMPONENT_IDS: readonly string[] = RON_NATIVE_ROSTER
  .filter((c) => c.component_class !== "analytical_specialist").map((c) => c.component_id);

export function isRonNativeComponent(id: unknown): boolean {
  return RON_NATIVE_COMPONENT_IDS.includes(String(id ?? ""));
}

export function isOptionalAdjunct(id: unknown): boolean {
  return RON_OPTIONAL_ADJUNCTS.includes(String(id ?? ""));
}

/** Deterministic applicability. Conditional members resolve against declared evidence. */
export function componentApplicable(
  component: RonNativeComponent, instrument: string,
): boolean {
  if (component.applicability === "always") return true;
  if (component.component_id === "cross_asset_correlation") {
    return relationshipsFor(instrument).length > 0;
  }
  // Deny by default: an unknown conditional predicate is never silently applicable.
  return false;
}

/** The applicable RON-native components for one instrument, in stable roster order. */
export function expectedComponentsFor(instrument: string): readonly string[] {
  return RON_NATIVE_ROSTER
    .filter((c) => componentApplicable(c, instrument))
    .map((c) => c.component_id);
}

export function notApplicableComponentsFor(instrument: string): readonly string[] {
  return RON_NATIVE_ROSTER
    .filter((c) => !componentApplicable(c, instrument))
    .map((c) => c.component_id);
}

/* --------------------------------------------------------- cycle completeness */

export type CycleStatus =
  | "complete"            // every applicable required component settled
  | "incomplete"          // at least one applicable required component missing
  | "blocked_data"        // source/quality condition prevented evaluation
  | "blocked_market"      // venue closed / no tradable completed bar yet
  | "blocked_venue"       // venue calendar not authoritative for this instrument
  /**
   * GAINEDGE_RON_REAL_MULTI_MARKET_AND_REALTIME_SIGNAL_DELIVERY_V1: ordinary pipeline
   * latency, NOT an error. A genuine completed bar exists but its accepted snapshot has
   * not landed yet. The unattended scheduler retries the same anchor on a later tick, so
   * this state must never be recorded as a lasting data failure.
   */
  | "deferred";

export interface CycleCompletenessInput {
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  /** Component ids observed as settled for THIS exact anchor. */
  observed_components: readonly string[];
  context_written: boolean;
  material_event_written: boolean;
  /** Non-null forces a blocked status and short-circuits completeness. */
  blocked?: { status: Exclude<CycleStatus, "complete" | "incomplete">; reason: string } | null;
}

export interface CycleCompleteness {
  roster_version: number;
  instrument: string;
  timeframe: string;
  evaluation_anchor: string;
  cycle_status: CycleStatus;
  reason: string;
  expected_components: string[];
  completed_components: string[];
  missing_components: string[];
  not_applicable_components: string[];
  /** Observed ids that are outside the RON-native roster (e.g. the Falconer adjunct). */
  adjunct_components: string[];
  context_written: boolean;
  material_event_written: boolean;
}

/**
 * Deterministic completeness verdict. Adjunct components are reported separately and can
 * never make an incomplete cycle look complete.
 */
export function evaluateCycleCompleteness(
  input: CycleCompletenessInput,
): CycleCompleteness {
  const expected = [...expectedComponentsFor(input.instrument)];
  const observed = new Set(
    (input.observed_components ?? []).map((c) => String(c ?? "").trim()).filter(Boolean),
  );
  const completed = expected.filter((c) => observed.has(c));
  const missing = expected.filter((c) => !observed.has(c));
  const adjunct = [...observed].filter((c) => !isRonNativeComponent(c)).sort();

  const blocked = input.blocked ?? null;
  const cycle_status: CycleStatus = blocked
    ? blocked.status
    : (missing.length === 0 ? "complete" : "incomplete");
  const reason = blocked
    ? blocked.reason
    : (missing.length === 0
      ? "all_applicable_ron_native_components_settled"
      : `missing_required_components:${missing.join(",")}`);

  return {
    roster_version: RON_NATIVE_ROSTER_VERSION,
    instrument: input.instrument,
    timeframe: input.timeframe,
    evaluation_anchor: input.evaluation_anchor,
    cycle_status,
    reason,
    expected_components: expected,
    completed_components: completed,
    missing_components: missing,
    not_applicable_components: [...notApplicableComponentsFor(input.instrument)],
    adjunct_components: adjunct,
    context_written: input.context_written === true,
    material_event_written: input.material_event_written === true,
  };
}

export function ronNativeRosterPayload() {
  return [
    "ron_native_roster_version", RON_NATIVE_ROSTER_VERSION,
    "falconer_is_native", false,
    "components", [...RON_NATIVE_ROSTER]
      .sort((a, b) => (a.component_id < b.component_id ? -1 : 1))
      .map((c) => [c.component_id, c.component_class, c.applicability, c.required]),
    "optional_adjuncts", [...RON_OPTIONAL_ADJUNCTS].sort(),
  ];
}
