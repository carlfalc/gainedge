/**
 * RON Falconer Signal Source — ENDPOINT REQUEST VERSION SELECTOR V1.
 *
 * Pure, dependency-free request-shape helper. It selects nothing but the already
 * existing V1 contract: it exists solely so a caller can EXPLICITLY replay V1.
 *
 * It is NOT a spec, carries NO spec hash, mutates NO spec object, and creates NO V2.
 * It must be evaluated BEFORE any database read so unsupported versions fail closed
 * without touching candle_history, falconer_engine_events or falconer_trades.
 */
export const FALCONER_SUPPORTED_SPEC_VERSIONS = [1] as const;

export type FalconerSpecVersionSelection =
  | { ok: true; spec_version: 1; selector: "default_omitted" | "explicit" }
  | {
    ok: false;
    error: "unsupported_spec_version";
    requested_spec_version: number | string | null;
    supported_spec_versions: readonly number[];
  };

/** Deterministic selector. Omitted => V1. Explicit numeric 1 => V1. Everything else => reject. */
export function resolveFalconerSpecVersion(
  body: Record<string, unknown>,
): FalconerSpecVersionSelection {
  if (!("spec_version" in body)) {
    return { ok: true, spec_version: 1, selector: "default_omitted" };
  }
  const raw = body.spec_version;
  if (raw === 1) return { ok: true, spec_version: 1, selector: "explicit" };
  return {
    ok: false,
    error: "unsupported_spec_version",
    requested_spec_version:
      typeof raw === "number" || typeof raw === "string" ? raw : null,
    supported_spec_versions: FALCONER_SUPPORTED_SPEC_VERSIONS,
  };
}
