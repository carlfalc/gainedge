/**
 * GAINEDGE_RON_REAL_MULTI_MARKET_AND_REALTIME_SIGNAL_DELIVERY_V1 — MULTI-MARKET SCOPE V1.
 *
 * Pure, deterministic, side-effect free. It is the ONLY mechanism by which an already
 * frozen RON specialist producer may admit an instrument other than the one in its own
 * frozen `instrument_scope`.
 *
 * Rules:
 *   • DENY BY DEFAULT. With no explicit `multi_market_scope: 1` in the request body, every
 *     frozen producer admits exactly its own frozen scope. Nothing changes for replay.
 *   • NO WIDENING BEYOND THE DECLARED BINDING. The widened scope is exactly
 *     `FORWARD_CONTEXT_INSTRUMENTS` from the audited forward instrument binding registry.
 *     A symbol absent from that registry is never admitted, whatever the caller claims.
 *   • NO SPEC MUTATION. No frozen spec object is modified, so no spec hash changes and
 *     every historical XAUUSD artifact stays byte-identically replayable.
 *   • NO SUBSTITUTION. Widening admission does NOT supply data: a specialist with no
 *     genuine source data for the requested instrument still fails or reports a truthful
 *     settled state. XAUUSD data is never substituted for another market.
 */
import {
  FORWARD_CONTEXT_INSTRUMENTS, resolveInstrumentScope, type ForwardScopeBinding,
} from "./ron-forward-instrument-binding-v1.ts";

export const RON_MULTI_MARKET_SCOPE_VERSION = 1;

export interface ScopedSpecLike {
  spec_id: string;
  spec_version: number;
  instrument_scope: readonly string[];
}

/** True only for an explicit, exact opt-in. Anything else is the frozen behaviour. */
export function multiMarketRequested(body: Record<string, unknown> | null | undefined): boolean {
  const raw = (body ?? {})["multi_market_scope"];
  return Number(raw) === RON_MULTI_MARKET_SCOPE_VERSION;
}

/** The forward binding a frozen producer is handed. Never invented per-call. */
export function multiMarketBinding(spec: ScopedSpecLike): ForwardScopeBinding {
  return {
    binding_spec_id: spec.spec_id,
    binding_spec_version: spec.spec_version + 1,
    instrument_scope: FORWARD_CONTEXT_INSTRUMENTS,
  };
}

/** Frozen scope when disabled; the audited pilot binding when explicitly enabled. */
export function admissibleInstrumentScope(
  spec: ScopedSpecLike, enabled: boolean,
): readonly string[] {
  return resolveInstrumentScope(
    spec.spec_id, spec.spec_version, spec.instrument_scope,
    enabled ? multiMarketBinding(spec) : null,
  );
}

export function instrumentAdmitted(
  spec: ScopedSpecLike, instrument: string, enabled: boolean,
): boolean {
  return admissibleInstrumentScope(spec, enabled).includes(instrument);
}

export function multiMarketScopePayload() {
  return [
    "ron_multi_market_scope_version", RON_MULTI_MARKET_SCOPE_VERSION,
    "deny_by_default", true,
    "widened_scope", [...FORWARD_CONTEXT_INSTRUMENTS].sort(),
    "data_substitution_permitted", false,
    "frozen_spec_objects_mutated", false,
  ];
}
