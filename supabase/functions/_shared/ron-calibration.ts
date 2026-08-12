/**
 * RON Phase 2B — empirical calibration foundation (PURE functions only).
 *
 * SCOPE (deliberately narrow and frozen)
 * --------------------------------------
 * XAUUSD / 15m / feature_version=2 / label_version=3 / horizon=60 clock minutes /
 * symmetric ±1.0 ATR first-touch directional barrier event.
 *
 * WHAT THIS IS
 *   - Empirical base rates measured on GENUINE stored 1m outcomes, with Wilson 95%
 *     intervals, a strict chronological fit/holdout split, and holdout scoring
 *     (Brier vs naive Brier, reliability bins, ECE).
 * WHAT THIS IS NOT
 *   - Not a model, not a trading signal, not a displayed probability. Nothing in this
 *     module may be surfaced as a RON probability until a separate review gate passes.
 *
 * HARD RULES
 *   - Ineligible outcomes NEVER contribute: same_bar_ambiguous, missing ATR, any
 *     coverage failure (session boundary, genuine gap, mixed gap, off-grid, duplicate,
 *     horizon-not-elapsed) are dropped before any counting.
 *   - No randomisation anywhere. Split is by snapshot time only.
 *   - No leakage: holdout rows can never contribute to any fit cell.
 *   - Deterministic: identical inputs (including frozen source_as_of) produce
 *     byte-identical cell payloads and hashes.
 */

export const CALIBRATION_EVENT = "atr_barrier_first_hit_60m";
export const CALIBRATION_EVENT_VERSION = 1;
export const CALIBRATION_FEATURE_VERSION = 2;
export const CALIBRATION_LABEL_VERSION = 3;
export const CALIBRATION_HORIZON_MINUTES = 60;
export const CALIBRATION_BARRIER_ATR_MULT = 1.0;
export const CALIBRATION_BARRIER_VERSION = 1;
export const HOLDOUT_FRACTION = 0.3;

/**
 * Runner/input-contract version.
 *   v1 (historical, preserved in the DB): row membership frozen by mutable `labelled_at`,
 *       partial hash coverage, market_closed anchors could enter the sample.
 *   v2 (canonical): membership frozen by immutable market time (`source_bar_cutoff`),
 *       full deterministic hash coverage, market_closed anchors always ineligible.
 */
export const CALIBRATION_VERSION = 2;

/**
 * Phase 2C.1 — calibration contracts.
 *   v2 (frozen, canonical for audit): feature_version=2, label_version=3.
 *   v3: feature_version=3 (quarantine-free input windows) + label_version=4.
 * The v2 payload shape is byte-identical to the previously stored runs: the contract is
 * only threaded through as an explicit parameter that DEFAULTS to v2.
 */
export interface CalibrationContract {
  calibration_version: number;
  feature_version: number;
  label_version: number;
}
export const CALIBRATION_CONTRACT_V2: CalibrationContract = {
  calibration_version: 2, feature_version: 2, label_version: 3,
};
export const CALIBRATION_CONTRACT_V3: CalibrationContract = {
  calibration_version: 3, feature_version: 3, label_version: 4,
};
/** Phase 2C.2 clean lineage: quality v3 + feature v4 + label v5. */
export const CALIBRATION_CONTRACT_V4: CalibrationContract = {
  calibration_version: 4, feature_version: 4, label_version: 5,
};
/**
 * Phase 2B.1 auditability corrections (same clean lineage as v4: quality v3 + feature v4
 * + label v5) but materially changed calibration MECHANICS:
 *   - ONE common chronological split cutoff shared by LONG and SHORT,
 *   - definition hash covers every actual run parameter (quality version, ADX bucket
 *     boundaries, sample floors, hierarchy/fallback policy version, frozen source cut).
 * A new calibration_version is mandatory so v4 history can never be overwritten.
 */
export const CALIBRATION_CONTRACT_V5: CalibrationContract = {
  calibration_version: 5, feature_version: 4, label_version: 5,
};
export const CALIBRATION_CONTRACTS: Record<number, CalibrationContract> = {
  2: CALIBRATION_CONTRACT_V2,
  3: CALIBRATION_CONTRACT_V3,
  4: CALIBRATION_CONTRACT_V4,
  5: CALIBRATION_CONTRACT_V5,
};

/** Exact ADX bucket boundaries — part of the definition hash, never implicit. */
export const ADX_BUCKET_BOUNDS: readonly number[] = [20, 30];
/** Hierarchy/fallback resolution policy: deepest floor-qualifying cell, else broader, else null. */
export const HIERARCHY_POLICY_VERSION = 1;

/** A market-closed anchor can never be a user opportunity, so it can never be evidence. */
export const INELIGIBLE_ANCHOR_SESSIONS: readonly string[] = ["market_closed"];

/**
 * Phase 2C fail-closed source clock (calibration_version = 2).
 *
 * The frozen research instant may ONLY come from:
 *   - an explicit `source_as_of` (frozen replay), or
 *   - the latest GENUINE stored 1m market candle.
 * Wall clock, labelled_at, created_at and updated_at are mutable write timestamps and are
 * never acceptable. With no genuine clock available the runner must refuse to produce a
 * result rather than silently invent provenance.
 */
export class NoGenuineSourceClockError extends Error {
  readonly code = "NO_GENUINE_SOURCE_CLOCK";
  constructor() {
    super("NO_GENUINE_SOURCE_CLOCK: no genuine 1m market candle available to freeze source_as_of");
  }
}

export function resolveSourceClockV2(
  explicitSourceAsOf: string | null | undefined,
  latestGenuine1mTimestamp: string | null | undefined,
): { source_as_of: string; source_clock: "explicit" | "market_1m_candle" } {
  if (typeof explicitSourceAsOf === "string" && explicitSourceAsOf.length) {
    return { source_as_of: new Date(explicitSourceAsOf).toISOString(), source_clock: "explicit" };
  }
  if (typeof latestGenuine1mTimestamp === "string" && latestGenuine1mTimestamp.length) {
    return { source_as_of: new Date(latestGenuine1mTimestamp).toISOString(), source_clock: "market_1m_candle" };
  }
  throw new NoGenuineSourceClockError();
}

export function anchorSessionEligible(session: string | null | undefined): boolean {
  return !INELIGIBLE_ANCHOR_SESSIONS.includes(normSession(session));
}

/** Conservative floors: deeper cells must be better evidenced, not just present. */
export const SAMPLE_FLOORS: Record<number, number> = { 0: 200, 1: 200, 2: 300, 3: 400 };

export type Direction = "long" | "short";

export interface CalibrationInputRow {
  bar_time: string;
  session: string | null;
  regime: string | null;
  adx: number | null;
  long_event_eligible: boolean;
  long_success: boolean | null;
  short_event_eligible: boolean;
  short_success: boolean | null;
  coverage_ok: boolean;
  coverage_class: string;
  atr_at_anchor: number | null;
}

export interface EligibleObs {
  bar_time: string;
  t: number;
  session: string;
  regime: string;
  adx_bucket: string;
  success: boolean;
}

/** Coarse ADX buckets — three levels only, no sparse-cell theatre. */
export function adxBucket(adx: number | null | undefined): string {
  if (adx == null || !Number.isFinite(adx)) return "unknown";
  if (adx < 20) return "adx_lt20";
  if (adx < 30) return "adx_20_30";
  return "adx_gte30";
}

export function normSession(s: string | null | undefined): string {
  return s && s.length ? s : "unknown";
}

export function normRegime(r: string | null | undefined): string {
  return r && r.length ? r : "unknown";
}

/**
 * Strict eligibility gate for ONE direction. Anything ambiguous, uncovered or
 * unmeasurable is dropped — never coerced to false.
 */
export function eligibleFor(row: CalibrationInputRow, dir: Direction): EligibleObs | null {
  if (!row.coverage_ok) return null;
  if (row.coverage_class !== "complete") return null;
  if (row.atr_at_anchor == null) return null;
  if (!anchorSessionEligible(row.session)) return null;   // market_closed anchors never count
  const ok = dir === "long" ? row.long_event_eligible : row.short_event_eligible;
  const success = dir === "long" ? row.long_success : row.short_success;
  if (ok !== true) return null;
  if (success !== true && success !== false) return null;
  return {
    bar_time: row.bar_time,
    t: new Date(row.bar_time).getTime(),
    session: normSession(row.session),
    regime: normRegime(row.regime),
    adx_bucket: adxBucket(row.adx),
    success,
  };
}

/** Deterministic cell key. Level 0 = direction only. */
export function cellKey(level: number, dir: Direction, o: Pick<EligibleObs, "session" | "regime" | "adx_bucket">): string {
  const parts = [`dir=${dir}`];
  if (level >= 1) parts.push(`session=${o.session}`);
  if (level >= 2) parts.push(`regime=${o.regime}`);
  if (level >= 3) parts.push(`adx=${o.adx_bucket}`);
  return parts.join("|");
}

/** Wilson score interval at 95% (z = 1.959963985). */
export function wilson95(successes: number, n: number): { low: number; high: number } | null {
  if (n <= 0) return null;
  const z = 1.959963985;
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: round6(Math.max(0, (centre - margin) / d)), high: round6(Math.min(1, (centre + margin) / d)) };
}

export const round6 = (v: number): number => Number(v.toFixed(6));

export function brier(preds: { p: number; y: boolean }[]): number | null {
  if (!preds.length) return null;
  let s = 0;
  for (const q of preds) s += (q.p - (q.y ? 1 : 0)) ** 2;
  return round6(s / preds.length);
}

export interface ReliabilityBin { lo: number; hi: number; n: number; mean_pred: number | null; observed: number | null; }

/** Fixed 10 equal-width bins over [0,1]; upper edge inclusive on the last bin only. */
export function reliabilityBins(preds: { p: number; y: boolean }[], nBins = 10): ReliabilityBin[] {
  const bins: ReliabilityBin[] = Array.from({ length: nBins }, (_, i) => ({
    lo: round6(i / nBins), hi: round6((i + 1) / nBins), n: 0, mean_pred: null, observed: null,
  }));
  const sumP = new Array(nBins).fill(0);
  const sumY = new Array(nBins).fill(0);
  for (const q of preds) {
    let i = Math.floor(q.p * nBins);
    if (i >= nBins) i = nBins - 1;
    if (i < 0) i = 0;
    bins[i].n++; sumP[i] += q.p; sumY[i] += q.y ? 1 : 0;
  }
  for (let i = 0; i < nBins; i++) {
    if (bins[i].n > 0) {
      bins[i].mean_pred = round6(sumP[i] / bins[i].n);
      bins[i].observed = round6(sumY[i] / bins[i].n);
    }
  }
  return bins;
}

/** Expected calibration error over the same fixed bins. */
export function ece(preds: { p: number; y: boolean }[], nBins = 10): number | null {
  if (!preds.length) return null;
  const bins = reliabilityBins(preds, nBins);
  let e = 0;
  for (const b of bins) if (b.n > 0) e += (b.n / preds.length) * Math.abs((b.mean_pred ?? 0) - (b.observed ?? 0));
  return round6(e);
}

export interface CellStat {
  level: number;
  cell_key: string;
  direction: Direction;
  dim_session: string | null;
  dim_regime: string | null;
  dim_adx_bucket: string | null;
  n_fit: number;
  successes_fit: number;
  empirical_rate: number | null;
  wilson_low: number | null;
  wilson_high: number | null;
  sample_floor: number;
  meets_sample_floor: boolean;
  n_holdout: number;
  successes_holdout: number;
  holdout_rate: number | null;
}

/** Aggregate fit observations into the L0..L3 hierarchy. Deterministic key order. */
export function buildCells(dir: Direction, fit: EligibleObs[], holdout: EligibleObs[]): CellStat[] {
  const acc = new Map<string, CellStat>();
  const touch = (level: number, o: EligibleObs): CellStat => {
    const key = cellKey(level, dir, o);
    let c = acc.get(key);
    if (!c) {
      c = {
        level, cell_key: key, direction: dir,
        dim_session: level >= 1 ? o.session : null,
        dim_regime: level >= 2 ? o.regime : null,
        dim_adx_bucket: level >= 3 ? o.adx_bucket : null,
        n_fit: 0, successes_fit: 0, empirical_rate: null, wilson_low: null, wilson_high: null,
        sample_floor: SAMPLE_FLOORS[level], meets_sample_floor: false,
        n_holdout: 0, successes_holdout: 0, holdout_rate: null,
      };
      acc.set(key, c);
    }
    return c;
  };
  for (const o of fit) for (const level of [0, 1, 2, 3]) {
    const c = touch(level, o);
    c.n_fit++; if (o.success) c.successes_fit++;
  }
  for (const o of holdout) for (const level of [0, 1, 2, 3]) {
    const key = cellKey(level, dir, o);
    const c = acc.get(key);
    if (!c) continue;                       // holdout-only cells are never invented
    c.n_holdout++; if (o.success) c.successes_holdout++;
  }
  for (const c of acc.values()) {
    if (c.n_fit > 0) {
      c.empirical_rate = round6(c.successes_fit / c.n_fit);
      const w = wilson95(c.successes_fit, c.n_fit);
      c.wilson_low = w?.low ?? null; c.wilson_high = w?.high ?? null;
    }
    c.meets_sample_floor = c.n_fit >= c.sample_floor;
    if (c.n_holdout > 0) c.holdout_rate = round6(c.successes_holdout / c.n_holdout);
  }
  return [...acc.values()].sort((a, b) => a.level - b.level || (a.cell_key < b.cell_key ? -1 : a.cell_key > b.cell_key ? 1 : 0));
}

export interface Resolution { p: number | null; level: number | null; cell_key: string | null; }

/** Deepest cell that meets its floor; else broader; else global; else null. Never guesses. */
export function resolvePrediction(cells: Map<string, CellStat>, dir: Direction, o: EligibleObs): Resolution {
  for (const level of [3, 2, 1, 0]) {
    const c = cells.get(cellKey(level, dir, o));
    if (c && c.meets_sample_floor && c.empirical_rate != null) {
      return { p: c.empirical_rate, level, cell_key: c.cell_key };
    }
  }
  return { p: null, level: null, cell_key: null };
}

/**
 * Chronological split by snapshot time. The cutoff is the FIRST holdout bar_time, so no
 * bar can straddle the boundary and no fit row can be at or after the cutoff.
 */
export function chronoSplit(obs: EligibleObs[], holdoutFraction = HOLDOUT_FRACTION): {
  cutoff: string | null; fit: EligibleObs[]; holdout: EligibleObs[];
} {
  const sorted = [...obs].sort((a, b) => a.t - b.t || (a.bar_time < b.bar_time ? -1 : 1));
  if (!sorted.length) return { cutoff: null, fit: [], holdout: [] };
  const times = [...new Set(sorted.map((o) => o.t))].sort((a, b) => a - b);
  const idx = Math.max(1, Math.min(times.length - 1, Math.floor(times.length * (1 - holdoutFraction))));
  const cutoffT = times[idx];
  return {
    cutoff: new Date(cutoffT).toISOString(),
    fit: sorted.filter((o) => o.t < cutoffT),
    holdout: sorted.filter((o) => o.t >= cutoffT),
  };
}

export interface DirectionReport {
  direction: Direction;
  n_eligible: number;
  n_fit: number;
  n_holdout: number;
  fit_range: [string, string] | null;
  holdout_range: [string, string] | null;
  global_fit_rate: number | null;
  holdout_observed_rate: number | null;
  n_predicted: number;
  n_unpredicted: number;
  brier: number | null;
  naive_brier: number | null;
  ece: number | null;
  reliability: ReliabilityBin[];
  fallback_levels: Record<string, number>;
  session_counts: Record<string, number>;
  cells: CellStat[];
}

export function calibrateDirection(dir: Direction, obs: EligibleObs[], holdoutFraction = HOLDOUT_FRACTION): DirectionReport {
  const { cutoff, fit, holdout } = chronoSplit(obs, holdoutFraction);
  const cells = buildCells(dir, fit, holdout);
  const map = new Map(cells.map((c) => [c.cell_key, c]));
  const global = map.get(cellKey(0, dir, { session: "", regime: "", adx_bucket: "" }));
  const naive = global?.empirical_rate ?? null;

  const preds: { p: number; y: boolean }[] = [];
  const naivePreds: { p: number; y: boolean }[] = [];
  const fallback: Record<string, number> = { L3: 0, L2: 0, L1: 0, L0: 0, none: 0 };
  const sessions: Record<string, number> = {};
  let successHold = 0;
  for (const o of holdout) {
    sessions[o.session] = (sessions[o.session] ?? 0) + 1;
    if (o.success) successHold++;
    const r = resolvePrediction(map, dir, o);
    if (r.p == null) { fallback.none++; continue; }
    fallback[`L${r.level}`]++;
    preds.push({ p: r.p, y: o.success });
    if (naive != null) naivePreds.push({ p: naive, y: o.success });
  }

  void cutoff;
  return {
    direction: dir,
    n_eligible: obs.length,
    n_fit: fit.length,
    n_holdout: holdout.length,
    fit_range: fit.length ? [fit[0].bar_time, fit[fit.length - 1].bar_time] : null,
    holdout_range: holdout.length ? [holdout[0].bar_time, holdout[holdout.length - 1].bar_time] : null,
    global_fit_rate: naive,
    holdout_observed_rate: holdout.length ? round6(successHold / holdout.length) : null,
    n_predicted: preds.length,
    n_unpredicted: fallback.none,
    brier: brier(preds),
    naive_brier: brier(naivePreds),
    ece: ece(preds),
    reliability: reliabilityBins(preds),
    fallback_levels: fallback,
    session_counts: sessions,
    cells,
  };
}

/** Stable SHA-256 over an ordered payload. */
export async function sha256(payload: unknown): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Version-pinned definition hash — changes whenever the frozen event definition changes. */
export function definitionPayload(sourceAsOf: string, cutoff: string | null) {
  return [
    CALIBRATION_EVENT, CALIBRATION_EVENT_VERSION,
    "XAUUSD", "15m",
    CALIBRATION_FEATURE_VERSION, CALIBRATION_LABEL_VERSION,
    CALIBRATION_HORIZON_MINUTES, CALIBRATION_BARRIER_ATR_MULT, CALIBRATION_BARRIER_VERSION,
    HOLDOUT_FRACTION, SAMPLE_FLOORS[0], SAMPLE_FLOORS[1], SAMPLE_FLOORS[2], SAMPLE_FLOORS[3],
    sourceAsOf, cutoff,
  ];
}

export function cellPayload(c: CellStat) {
  return [
    c.direction, c.level, c.cell_key, c.dim_session, c.dim_regime, c.dim_adx_bucket,
    c.n_fit, c.successes_fit, c.empirical_rate, c.wilson_low, c.wilson_high,
    c.sample_floor, c.meets_sample_floor, c.n_holdout, c.successes_holdout, c.holdout_rate,
  ];
}

/* ------------------------------------------------------------------------- *
 * calibration_version = 2 canonical hash payloads.
 *
 * Every deterministic value persisted for a run/cell that could change an audit
 * reading is hashed. Only volatile DB metadata (id, run_id, created_at, updated_at)
 * is excluded. Ordering is fixed and map keys are sorted, so the digest is stable.
 * ------------------------------------------------------------------------- */

const sortedEntries = (m: Record<string, number>) =>
  Object.keys(m).sort().map((k) => [k, m[k]]);

export interface RunIdentityV2 {
  symbol: string;
  timeframe: string;
  source_as_of: string;
  /** Immutable market-time boundary; row membership is derived from this, never labelled_at. */
  source_bar_cutoff: string | null;
  holdout_fraction: number;
  split_cutoff: string | null;
  canonical_rows: number;
  eligible_long: number;
  eligible_short: number;
  excluded_rows: number;
  exclusion_breakdown: Record<string, number>;
}

export function definitionPayloadV2(id: RunIdentityV2, ctx: CalibrationContract = CALIBRATION_CONTRACT_V2) {
  return [
    "calibration_version", ctx.calibration_version,
    CALIBRATION_EVENT, CALIBRATION_EVENT_VERSION,
    id.symbol, id.timeframe,
    ctx.feature_version, ctx.label_version,
    CALIBRATION_HORIZON_MINUTES, CALIBRATION_BARRIER_ATR_MULT, CALIBRATION_BARRIER_VERSION,
    id.holdout_fraction,
    SAMPLE_FLOORS[0], SAMPLE_FLOORS[1], SAMPLE_FLOORS[2], SAMPLE_FLOORS[3],
    [...INELIGIBLE_ANCHOR_SESSIONS].sort(),
    id.source_as_of, id.source_bar_cutoff, id.split_cutoff,
  ];
}

/** Full deterministic report payload — reliability, fallback and session counts included. */
export function reportPayloadV2(r: DirectionReport) {
  return [
    r.direction, r.n_eligible, r.n_fit, r.n_holdout,
    r.fit_range, r.holdout_range,
    r.global_fit_rate, r.holdout_observed_rate,
    r.n_predicted, r.n_unpredicted,
    r.brier, r.naive_brier, r.ece,
    r.reliability.map((b) => [b.lo, b.hi, b.n, b.mean_pred, b.observed]),
    sortedEntries(r.fallback_levels),
    sortedEntries(r.session_counts),
    r.cells.map(cellPayload),
  ];
}

export function runPayloadV2(id: RunIdentityV2, defHash: string, long: DirectionReport, short: DirectionReport) {
  return [
    defHash,
    id.canonical_rows, id.eligible_long, id.eligible_short, id.excluded_rows,
    sortedEntries(id.exclusion_breakdown),
    reportPayloadV2(long), reportPayloadV2(short),
  ];
}

export interface CellPersistedV2 {
  source_as_of: string;
  source_bar_cutoff: string | null;
  split_cutoff: string | null;
  fit_start: string | null;
  fit_end: string | null;
  holdout_start: string | null;
  holdout_end: string | null;
  prediction_rate: number | null;
  brier: number | null;
  naive_brier: number | null;
}

/** Canonical cell payload covering every deterministic persisted column. */
export function cellPayloadV2(c: CellStat, p: CellPersistedV2, ctx: CalibrationContract = CALIBRATION_CONTRACT_V2) {
  return [
    ctx.calibration_version, CALIBRATION_EVENT, CALIBRATION_EVENT_VERSION,
    ctx.feature_version, ctx.label_version, CALIBRATION_HORIZON_MINUTES,
    CALIBRATION_BARRIER_ATR_MULT, CALIBRATION_BARRIER_VERSION,
    c.direction, c.level, c.cell_key, c.dim_session, c.dim_regime, c.dim_adx_bucket,
    p.source_as_of, p.source_bar_cutoff, p.split_cutoff,
    p.fit_start, p.fit_end, p.holdout_start, p.holdout_end,
    c.n_fit, c.successes_fit, c.empirical_rate, c.wilson_low, c.wilson_high,
    c.sample_floor, c.meets_sample_floor,
    c.n_holdout, c.successes_holdout, c.holdout_rate,
    p.prediction_rate, p.brier, p.naive_brier,
  ];
}
