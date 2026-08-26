/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — FORWARD INSTRUMENT BINDING V1.
 *
 * Pure, deterministic, side-effect free. It declares:
 *
 *   1. WHICH instruments a forward (v2+) context spec is permitted to reason about, and
 *      with what explicit venue binding. There is no wildcard and no inference from
 *      symbol shape: an instrument RON may reason about must be listed here AND be
 *      registered in the venue registry.
 *   2. The EXPLICIT cross-asset relationship registry. A relationship exists only when
 *      it is declared here with a direction-neutral, descriptive purpose. RON may never
 *      infer a pairing from correlation, naming, asset class or convenience.
 *   3. A `ForwardScopeBinding` value that a forward spec version passes to an already
 *      frozen v1 producer to widen ONLY the instrument-scope admission check. The frozen
 *      spec objects, their hashes and their default behaviour are untouched: with no
 *      binding supplied, a v1 producer still admits exactly its own declared scope.
 *
 * It never fabricates a bar, never emits a probability, never proposes an order and
 * never claims predictive edge for any instrument.
 */
import {
  RON_PILOT_INSTRUMENTS, VENUE_REGISTRY, type VenueClass,
} from "./ron-venue-registry-v1.ts";

export const RON_FORWARD_INSTRUMENT_BINDING_VERSION = 1;

export interface InstrumentBinding {
  instrument: string;
  venue_class: VenueClass;
  timeframe_scope: readonly string[];
  /**
   * True only when an accepted, sealed calibration artifact exists for this instrument.
   * Today that is XAUUSD alone, so no other instrument may ever carry a base rate.
   */
  calibration_artifact_available: boolean;
  /** True only when the accepted seven-agent orchestration lineage covers it. */
  orchestration_lineage_available: boolean;
  note: string;
}

const bind = (
  instrument: string,
  calibration_artifact_available: boolean,
  orchestration_lineage_available: boolean,
  note: string,
): InstrumentBinding => ({
  instrument,
  venue_class: VENUE_REGISTRY[instrument].venue_class,
  timeframe_scope: ["15m"],
  calibration_artifact_available,
  orchestration_lineage_available,
  note,
});

/** Deny-by-default. Adding an entry is an explicit, audited change. */
export const FORWARD_INSTRUMENT_BINDINGS: Readonly<Record<string, InstrumentBinding>> =
  Object.freeze({
    XAUUSD: bind("XAUUSD", true, true,
      "Accepted lineage instrument. Sealed calibration artifact and the seven-agent "
      + "orchestration lineage both exist; nothing about it changes in this phase."),
    NAS100: bind("NAS100", false, false,
      "Descriptive context only. No accepted calibration artifact and no orchestration "
      + "lineage exist, so no base rate and no sealed-evidence decision may be claimed."),
    NZDUSD: bind("NZDUSD", false, false,
      "Descriptive context only. No accepted calibration artifact or orchestration lineage."),
    USDCAD: bind("USDCAD", false, false,
      "Descriptive context only. No accepted calibration artifact or orchestration lineage."),
    HK50: bind("HK50", false, false,
      "Descriptive context only, and additionally venue-gated: the HKEX holiday calendar "
      + "is not authoritative in this repo, so in-session instants report "
      + "calendar_unavailable and RON does not reason at all."),
  });

/** Instruments a forward context spec may be asked to evaluate. */
export const FORWARD_CONTEXT_INSTRUMENTS: readonly string[] =
  RON_PILOT_INSTRUMENTS.filter((i) => !!FORWARD_INSTRUMENT_BINDINGS[i]);

export function instrumentBinding(instrument: string): InstrumentBinding | null {
  return FORWARD_INSTRUMENT_BINDINGS[instrument] ?? null;
}

/** No accepted calibration artifact means no base rate may be emitted. Fail closed. */
export function calibrationAvailable(instrument: string): boolean {
  return instrumentBinding(instrument)?.calibration_artifact_available === true;
}

/* -------------------------------------------- cross-asset relationship registry */

export interface CrossAssetRelationship {
  subject: string;
  reference: string;
  /** Descriptive purpose only. Never a causal or predictive statement. */
  purpose: string;
  /** The accepted specialist lineage this relationship is already expressed in, if any. */
  accepted_in: string | null;
}

/**
 * The ONLY cross-asset pairings RON may describe. A pair absent from this list does not
 * exist for RON: it is never inferred, never derived from a correlation scan, and never
 * created on the fly by a runtime.
 */
export const CROSS_ASSET_RELATIONSHIPS: readonly CrossAssetRelationship[] = Object.freeze([
  {
    subject: "XAUUSD",
    reference: "NAS100",
    purpose: "descriptive co-movement context between gold and the US tech index",
    accepted_in: "cross_asset_relationship_context_v3",
  },
  {
    subject: "NZDUSD",
    reference: "USDCAD",
    purpose: "descriptive USD-leg context between two USD-quoted/based FX pairs",
    accepted_in: null,
  },
]);

export function relationshipsFor(instrument: string): readonly CrossAssetRelationship[] {
  return CROSS_ASSET_RELATIONSHIPS.filter(
    (r) => r.subject === instrument || r.reference === instrument,
  );
}

export function relationshipDeclared(subject: string, reference: string): boolean {
  return CROSS_ASSET_RELATIONSHIPS.some(
    (r) => (r.subject === subject && r.reference === reference)
      || (r.subject === reference && r.reference === subject),
  );
}

/* ------------------------------------------------------- forward scope binding */

/**
 * A forward spec version's explicit permission to widen ONLY the instrument-scope check
 * of a frozen v1 producer. Everything else in the frozen producer is unchanged.
 */
export interface ForwardScopeBinding {
  /** MUST equal the frozen producer's own spec id. */
  binding_spec_id: string;
  /** MUST be strictly greater than the frozen producer's spec version. */
  binding_spec_version: number;
  /** MUST be a non-empty subset of FORWARD_CONTEXT_INSTRUMENTS. */
  instrument_scope: readonly string[];
}

/**
 * Returns the admissible instrument scope. With no binding, the frozen scope is returned
 * verbatim. An invalid binding is IGNORED (fail closed to the frozen scope) rather than
 * trusted, so a malformed forward caller can never widen anything.
 */
export function resolveInstrumentScope(
  frozenSpecId: string,
  frozenSpecVersion: number,
  frozenScope: readonly string[],
  binding: ForwardScopeBinding | null | undefined,
): readonly string[] {
  if (!binding || typeof binding !== "object") return frozenScope;
  if (binding.binding_spec_id !== frozenSpecId) return frozenScope;
  if (!Number.isInteger(binding.binding_spec_version)
    || binding.binding_spec_version <= frozenSpecVersion) return frozenScope;
  const scope = Array.isArray(binding.instrument_scope) ? binding.instrument_scope : [];
  if (scope.length === 0) return frozenScope;
  if (!scope.every((i) => FORWARD_CONTEXT_INSTRUMENTS.includes(i))) return frozenScope;
  return scope;
}

export function forwardInstrumentBindingPayload() {
  return [
    "ron_forward_instrument_binding_version", RON_FORWARD_INSTRUMENT_BINDING_VERSION,
    "deny_by_default", true,
    "relationships_never_inferred", true,
    "instruments", Object.keys(FORWARD_INSTRUMENT_BINDINGS).sort().map((k) => {
      const b = FORWARD_INSTRUMENT_BINDINGS[k];
      return [
        b.instrument, b.venue_class, [...b.timeframe_scope],
        b.calibration_artifact_available, b.orchestration_lineage_available,
      ];
    }),
    "cross_asset_relationships", [...CROSS_ASSET_RELATIONSHIPS]
      .sort((a, b) => (`${a.subject}|${a.reference}` < `${b.subject}|${b.reference}` ? -1 : 1))
      .map((r) => [r.subject, r.reference, r.purpose, r.accepted_in]),
  ];
}
