import { describe, expect, it } from "vitest";
import {
  ACCEPTED_PROMOTION_MANIFEST, PROMOTION_READINESS_SPEC_V1, RON_PROMOTION_READINESS_VERSION,
  UNRESOLVED_PROMOTION_PREREQUISITES, derivePromotedStateVariables, promotionManifestHash,
  promotionManifestPayload, validatePromotionEntry, validatePromotionManifest,
  type AcceptedPromotionEntry,
} from "../../supabase/functions/_shared/ron-promotion-readiness";
import {
  PROMOTED_STATE_VARIABLES, agenticArchitectureHash, evaluateClaim,
} from "../../supabase/functions/_shared/ron-agentic-architecture";
import { PROMOTION_GATE_V4, RESEARCH_VERSION_V4 } from "../../supabase/functions/_shared/ron-research-v4";

const HASH64 = "a".repeat(64);

/** A hypothetical FUTURE entry. Nothing here is accepted or persisted. */
function futureEntry(over: Partial<AcceptedPromotionEntry> = {}): AcceptedPromotionEntry {
  return {
    research_version: RESEARCH_VERSION_V4 + 1,
    research_run_id: "future-run-0001",
    research_run_identity_hash: HASH64,
    research_contract_accepted: true,
    acceptance_artifact_id: "hypothetical_acceptance_artifact",
    acceptance_manifest_version: RON_PROMOTION_READINESS_VERSION,
    candidate_id: "cand_future_1",
    candidate_spec_hash: "b".repeat(64),
    state_spec_version: 2,
    state_spec_hash: "c".repeat(64),
    direction: "long",
    state_variables: ["adx_regime"],
    gate_version: PROMOTION_GATE_V4.gate_version,
    pre_holdout_gate_pass: true,
    holdout_gate_pass: true,
    final_promotion_pass: true,
    holdout_used_for_selection: false,
    spec_frozen_at: "2026-09-01T00:00:00Z",
    discovery_window: { start: "2026-01-01T00:00:00Z", end: "2026-08-31T00:00:00Z" },
    confirmation_window: { start: "2026-09-02T00:00:00Z", end: "2026-11-01T00:00:00Z" },
    confirmation_source_identity: "post_freeze_native_15m_grid",
    discovery_source_cutoff: "2026-08-31T00:00:00Z",
    confirmation_source_cutoff: "2026-11-01T00:00:00Z",
    prerequisite_resolutions: Object.fromEntries(
      UNRESOLVED_PROMOTION_PREREQUISITES.map((p) => [p, `resolved_by_${p}_artifact`]),
    ),
    ...over,
  };
}

describe("2D.2n — promotion readiness foundation", () => {
  it("accepted manifest is empty and promotes exactly zero state variables", () => {
    expect(ACCEPTED_PROMOTION_MANIFEST).toEqual([]);
    expect(derivePromotedStateVariables()).toEqual([]);
    expect(PROMOTED_STATE_VARIABLES).toEqual([]);
    expect(validatePromotionManifest(ACCEPTED_PROMOTION_MANIFEST).admissible).toBe(true);
  });

  it("architecture derives its empty list without changing its hash", async () => {
    expect(await agenticArchitectureHash()).toBe(await agenticArchitectureHash());
    const decision = evaluateClaim({
      role: "researcher", claim_class: "conditional_edge",
      cites: ["research_v4"], conditions_on: ["adx_regime"],
    });
    expect(decision.admissible).toBe(false);
    expect(decision.reasons.join(" ")).toContain("state_variable_not_promoted");
  });

  it("the frozen Research V4 negative artifact can never produce a promotion", () => {
    const v4 = futureEntry({ research_version: RESEARCH_VERSION_V4, final_promotion_pass: false });
    const r = validatePromotionEntry(v4);
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" ")).toContain("research_version_not_separately_versioned");
    expect(r.reasons.join(" ")).toContain("final_promotion_gate_not_passed");
    expect(derivePromotedStateVariables([v4])).toEqual([]);
  });

  it("a fully qualified hypothetical future entry validates and derives its variables", () => {
    const e = futureEntry();
    expect(validatePromotionEntry(e)).toEqual({ admissible: true, reasons: [] });
    expect(derivePromotedStateVariables([e])).toEqual(["adx_regime"]);
  });

  const failures: Array<[string, Partial<AcceptedPromotionEntry>, string]> = [
    ["same-cutoff replay", { confirmation_source_cutoff: "2026-08-31T00:00:00Z" }, "same-data replay"],
    ["overlapping confirmation window",
      { confirmation_window: { start: "2026-06-01T00:00:00Z", end: "2026-11-01T00:00:00Z" } },
      "confirmation_window_overlaps_discovery_window"],
    ["pre-freeze confirmation",
      { spec_frozen_at: "2026-10-01T00:00:00Z" }, "confirmation_window_starts_before_spec_freeze"],
    ["missing final gate", { final_promotion_pass: false }, "final_promotion_gate_not_passed"],
    ["missing holdout confirmation", { holdout_gate_pass: false }, "holdout_confirmation_gate_not_passed"],
    ["holdout used for selection", { holdout_used_for_selection: true }, "holdout_used_for_selection_or_tuning"],
    ["missing immutable identity hash", { research_run_identity_hash: "nope" }, "research_run_identity_hash"],
    ["unaccepted research contract", { research_contract_accepted: false }, "research_contract_not_accepted"],
    ["duplicate variable in entry",
      { state_variables: ["adx_regime", "adx_regime"] }, "duplicate_state_variable_in_entry"],
    ["unresolved prerequisite", { prerequisite_resolutions: {} }, "unresolved_prerequisite"],
  ];

  it.each(failures)("fails closed: %s", (_label, over, expected) => {
    const e = futureEntry(over);
    const r = validatePromotionEntry(e);
    expect(r.admissible).toBe(false);
    expect(r.reasons.join(" | ")).toContain(expected);
    expect(derivePromotedStateVariables([e])).toEqual([]);
  });

  it("a promising_for_2d2-style flag alone never promotes", () => {
    const flagOnly = futureEntry({
      pre_holdout_gate_pass: false, holdout_gate_pass: false, final_promotion_pass: false,
    });
    expect(validatePromotionEntry(flagOnly).admissible).toBe(false);
    expect(derivePromotedStateVariables([flagOnly])).toEqual([]);
  });

  it("rejects contradictory or duplicated variables across entries", () => {
    const a = futureEntry();
    const b = futureEntry({ candidate_id: "cand_future_2", direction: "short" });
    const m = validatePromotionManifest([a, b]);
    expect(m.admissible).toBe(false);
    expect(m.reasons.join(" ")).toContain("contradictory_variable_direction");
    expect(derivePromotedStateVariables([a, b])).toEqual([]);
  });

  it("manifest hash is deterministic and independent of input order", async () => {
    const a = futureEntry();
    const b = futureEntry({ candidate_id: "cand_future_2", state_variables: ["rsi_regime"] });
    expect(await promotionManifestHash([a, b])).toBe(await promotionManifestHash([b, a]));
    expect(await promotionManifestHash()).toBe(await promotionManifestHash());
  });

  it("contract carries no probability, geometry, execution or private fields", () => {
    const e = futureEntry({ candidate_id: "x" }) as unknown as Record<string, unknown>;
    e.win_probability = 0.7;
    expect(validatePromotionEntry(e as unknown as AcceptedPromotionEntry).reasons.join(" "))
      .toContain("forbidden_field");
    // Only the accepted-entry surface is scanned: the policy block legitimately NAMES
    // these prohibitions ("probability_policy": "no_probability_in_contract").
    const payload = promotionManifestPayload([futureEntry()]);
    const entriesIdx = payload.indexOf("accepted_entries");
    const text = JSON.stringify(payload[entriesIdx + 1]).toLowerCase();
    for (const bad of ["probability", "execution", "user_id", "balance", "stop_loss", "token"]) {
      expect(text).not.toContain(bad);
    }
    expect(PROMOTION_READINESS_SPEC_V1.default_decision).toBe("deny");
  });
});