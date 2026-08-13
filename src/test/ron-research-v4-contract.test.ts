import { describe, it, expect } from "vitest";
import {
  CONTINUITY_BOUNDARY_MAPPING, CONTINUITY_SOURCE_IDENTITY, CONTINUITY_SOURCE_SPEC,
  FOLD_DEFINITION_VERSION_V4, PROMOTION_GATE_V4, RESEARCH_VERSION_V4,
  analyseContinuityV4, buildVenueAwareFoldsV4, continuityContractPayloadV4,
  evaluateHoldoutGateV4, evaluatePreHoldoutGateV4, finalPromotionV4, mapSplitBoundaries,
  promotionGatePayloadV4, v4ContractHashes,
} from "../../supabase/functions/_shared/ron-research-v4.ts";
import { PROMOTION_GATE } from "../../supabase/functions/_shared/ron-research.ts";
import {
  CONTINUITY_CONTRACT_VERSION, SPLIT_MIN_EXPECTED_OPEN_MINUTES, buildVenueAwareFolds,
} from "../../supabase/functions/_shared/ron-research-v3.ts";
import {
  RON_VENUE_CALENDAR_VERSION_V2, expectedClosedReasonV2, expectedOpenV2, holidayMapV2,
} from "../../supabase/functions/_shared/ron-venue-calendar-v2.ts";
import {
  RON_VENUE_CALENDAR_VERSION, expectedClosedReason, venueCalendarPayload,
} from "../../supabase/functions/_shared/ron-venue-calendar.ts";

const ms = (s: string) => new Date(s).getTime();

describe("2D.1f-a — venue calendar v1 stays frozen, v2 fixes cross-year holidays", () => {
  it("does not disturb frozen v1", () => {
    expect(RON_VENUE_CALENDAR_VERSION).toBe(1);
    expect(JSON.stringify(venueCalendarPayload())).toContain('"ron_venue_calendar_version",1');
  });

  it("v2 places the Saturday-Jan-1 observed closure on Dec 31 of the prior year", () => {
    // Jan 1 2028 is a Saturday -> observed Fri Dec 31 2027.
    expect(holidayMapV2(2027).get("2027-12-31")?.code).toBe("new_years_day");
    expect(expectedClosedReasonV2(ms("2027-12-31T15:00:00Z"))).toBe("new_years_day:full_day");
    // v1 only saw the eve early close on that date.
    expect(expectedClosedReason(ms("2027-12-31T15:00:00Z"))).not.toBe("new_years_day:full_day");
  });

  it("v2 is otherwise identical to v1 on a sample year", () => {
    for (let t = ms("2026-06-01T00:00:00Z"); t < ms("2026-06-15T00:00:00Z"); t += 37 * 60_000) {
      expect(expectedOpenV2(t)).toBe(expectedClosedReason(t) === null);
    }
    expect(RON_VENUE_CALENDAR_VERSION_V2).toBe(2);
  });
});

describe("2D.1f-a — V4 continuity source and boundary mapping", () => {
  it("declares an explicit snapshot-grid continuity source, never label-derived", () => {
    expect(RESEARCH_VERSION_V4).toBe(4);
    expect(CONTINUITY_SOURCE_SPEC.table).toBe("ron_market_snapshots");
    expect(CONTINUITY_SOURCE_SPEC.feature_version).toBe(6);
    expect(CONTINUITY_SOURCE_SPEC.quality_version).toBe(5);
    expect(CONTINUITY_SOURCE_SPEC.label_version).toBe(7);
    expect(CONTINUITY_SOURCE_IDENTITY).toBe("quality_v5_eligible_feature_v6_grid");
    expect(CONTINUITY_SOURCE_SPEC.derived_from_labels).toBe(false);
    const p = JSON.stringify(continuityContractPayloadV4());
    expect(p).toContain(CONTINUITY_SOURCE_IDENTITY);
    expect(p).toContain(CONTINUITY_BOUNDARY_MAPPING);
    expect(p).toContain('"ron_venue_calendar_version",2');
  });

  it("still never splits the genuine Easter closure", () => {
    const grid: number[] = [];
    for (let t = ms("2026-04-02T12:00:00Z"); t <= ms("2026-04-02T20:45:00Z"); t += 15 * 60_000) grid.push(t);
    for (let t = ms("2026-04-05T22:00:00Z"); t <= ms("2026-04-06T12:00:00Z"); t += 15 * 60_000) grid.push(t);
    const r = analyseContinuityV4(grid);
    expect(r.splitting_defects).toBe(0);
    expect(r.epochs).toHaveLength(1);
    expect(r.continuity_contract_version).toBeGreaterThan(CONTINUITY_CONTRACT_VERSION);
  });

  it("maps a defect end that is not itself an eligible anchor to the next eligible anchor", () => {
    const times = [ms("2026-06-01T08:00:00Z"), ms("2026-06-10T09:00:00Z"), ms("2026-06-10T09:15:00Z")];
    expect(mapSplitBoundaries(times, ["2026-06-10T08:00:00.000Z"]))
      .toEqual(["2026-06-10T09:00:00.000Z"]);
    expect(mapSplitBoundaries(times, ["2027-01-01T00:00:00.000Z"])).toEqual([]);
  });

  it("actually splits folds where V3's exact-match mapping would not", () => {
    const mk = (t: number) => ({ t, y: true } as never);
    const times: number[] = [];
    for (let t = ms("2026-06-01T00:00:00Z"); t <= ms("2026-06-05T20:45:00Z"); t += 15 * 60_000) {
      if (expectedOpenV2(t)) times.push(t);
    }
    for (let t = ms("2026-06-15T00:00:00Z"); t <= ms("2026-06-19T20:45:00Z"); t += 15 * 60_000) {
      if (expectedOpenV2(t)) times.push(t);
    }
    const obs = [times.map(mk), times.map(mk)];
    const cont = analyseContinuityV4(times);
    expect(cont.splitting_defects).toBe(1);
    // Shift the declared boundary onto a non-anchor instant, as production data does.
    const shifted = { ...cont, split_boundaries: cont.split_boundaries.map((b) => new Date(new Date(b).getTime() - 60_000).toISOString()) };
    expect(buildVenueAwareFolds(obs, shifted).segments).toHaveLength(1);          // V3 defect
    expect(buildVenueAwareFoldsV4(obs, shifted).segments).toHaveLength(2);        // V4 fix
    expect(buildVenueAwareFoldsV4(obs, shifted).fold_definition_version).toBe(FOLD_DEFINITION_VERSION_V4);
  });
});

describe("2D.1f-a — V4 two-stage promotion gate", () => {
  const agg = { brier: 0.20, ece: 0.010, supported_non_global_coverage: 0.60 };
  const base = { brier: 0.21, ece: 0.011, supported_non_global_coverage: 1 };
  const vs = { aggregate_brier_delta: 0.010, fold_deltas: [0.01, 0.01, 0.01, 0.01], folds_better: 4, worst_fold_degradation: 0.001 };

  it("keeps every V2 numeric threshold byte-identical", () => {
    expect(PROMOTION_GATE_V4.min_aggregate_brier_improvement_vs_baseline).toBe(PROMOTION_GATE.min_aggregate_brier_improvement_vs_baseline);
    expect(PROMOTION_GATE_V4.min_fold_win_fraction).toBe(PROMOTION_GATE.min_fold_win_fraction);
    expect(PROMOTION_GATE_V4.max_fold_degradation_vs_baseline).toBe(PROMOTION_GATE.max_fold_degradation_vs_baseline);
    expect(PROMOTION_GATE_V4.min_non_global_coverage).toBe(PROMOTION_GATE.min_non_global_coverage);
    expect(PROMOTION_GATE_V4.non_global_requires_support_floor).toBe(true);
    expect(JSON.stringify(promotionGatePayloadV4())).toContain("holdout_required");
  });

  it("fails a candidate whose ECE deteriorates even when Brier improves", () => {
    const r = evaluatePreHoldoutGateV4({ ...agg, ece: 0.012 }, base, vs, 4);
    expect(r.pass).toBe(false);
    expect(r.checks.ece_non_deterioration).toBe(false);
    expect(r.reasons.join(" ")).toContain("aggregate_ece");
  });

  it("fails a candidate whose supported non-global coverage is too thin", () => {
    const r = evaluatePreHoldoutGateV4({ ...agg, supported_non_global_coverage: 0.10 }, base, vs, 4);
    expect(r.pass).toBe(false);
    expect(r.checks.supported_non_global_coverage).toBe(false);
  });

  it("never touches the holdout when stage 1 fails", () => {
    let touched = 0;
    const r = finalPromotionV4(evaluatePreHoldoutGateV4({ ...agg, brier: 0.21, ece: 0.02 }, base, vs, 4), () => {
      touched++;
      return { feasible: true, candidate: { brier: 0, ece: 0 }, baseline: { brier: 1, ece: 1 } };
    });
    expect(touched).toBe(0);
    expect(r.holdout_evaluated).toBe(false);
    expect(r.final_promotion_pass).toBe(false);
  });

  it("fails closed when the holdout is infeasible", () => {
    const r = finalPromotionV4(evaluatePreHoldoutGateV4(agg, base, vs, 4), () => ({ feasible: false, reason: "too few observations" }));
    expect(r.pre_holdout_gate_pass).toBe(true);
    expect(r.final_promotion_pass).toBe(false);
    expect(r.final_reasons.join(" ")).toContain("holdout_infeasible");
  });

  it("fails when the holdout reverses the Brier sign or worsens ECE", () => {
    expect(evaluateHoldoutGateV4({ feasible: true, candidate: { brier: 0.23, ece: 0.01 }, baseline: { brier: 0.22, ece: 0.01 } }).pass).toBe(false);
    expect(evaluateHoldoutGateV4({ feasible: true, candidate: { brier: 0.21, ece: 0.02 }, baseline: { brier: 0.22, ece: 0.01 } }).pass).toBe(false);
  });

  it("promotes only when both stages pass, and records auditable evidence", () => {
    const r = finalPromotionV4(evaluatePreHoldoutGateV4(agg, base, vs, 4), () => ({
      feasible: true, candidate: { brier: 0.205, ece: 0.009 }, baseline: { brier: 0.212, ece: 0.011 },
    }));
    expect(r.pre_holdout_gate_pass).toBe(true);
    expect(r.holdout_evaluated).toBe(true);
    expect(r.final_promotion_pass).toBe(true);
    expect(r.gate_version).toBe(2);
  });

  it("hashes a stable, fully-enumerated V4 contract set", async () => {
    const a = await v4ContractHashes();
    const b = await v4ContractHashes();
    expect(a).toEqual(b);
    expect(Object.values(a).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    expect(SPLIT_MIN_EXPECTED_OPEN_MINUTES).toBe(240);
  });
});
