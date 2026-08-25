/**
 * GAINEDGE_RON_OPPORTUNITY_CONTEXT_RUNTIME_V1 — acceptance guards.
 *
 * Covers the pure runtime binding helpers, the UI presentation vocabulary and the
 * opportunity notification derivation. Nothing here reaches the network or the database.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  OPPORTUNITY_CONTEXT_QUALIFIER, isNotifiableMaterialChange, opportunitySummary,
  opportunityTone, presentDirection, presentLifecycle, presentMaterialChange,
} from "@/lib/ron-opportunity-context-presentation";
import {
  applyOpportunityBaseline, createOpportunityNotificationState,
  deriveOpportunityNotification, normaliseTrackedInstruments,
  resetOpportunityNotificationState, viewOpportunityHref,
  type OpportunityNotificationRow,
} from "@/lib/signal-notifications";
import { contextKey, latestByPair, type RonOpportunityContextRecord } from "@/services/ron-opportunity-context";

const FN = path.resolve(__dirname, "../../supabase/functions");
const runtimeSrc = fs.readFileSync(
  path.join(FN, "_shared/ron-opportunity-context-runtime-v1.ts"), "utf8");
const endpointSrc = fs.readFileSync(
  path.join(FN, "ron-opportunity-context/index.ts"), "utf8");
const schedulerSrc = fs.readFileSync(
  path.join(FN, "ron-schedule-orchestration/index.ts"), "utf8");

describe("runtime binding is honest and frozen-artifact safe", () => {
  it("declares exactly which spec deployment fields it supersedes", () => {
    for (const field of [
      "registry_status.persisted",
      "registry_status.ui_bound",
      "registry_status.notification_channel_bound",
    ]) expect(runtimeSrc).toContain(field);
    expect(runtimeSrc).toContain("mutates_frozen_artifacts: false");
    expect(runtimeSrc).toContain("emits_evidence_envelope: false");
    expect(runtimeSrc).toContain("admitted_into_orchestration_decision: false");
  });

  it("never persists probability or execution intent", () => {
    expect(runtimeSrc).toContain("stores_numeric_probability: false");
    expect(runtimeSrc).toContain("stores_execution_intent: false");
    expect(runtimeSrc).toContain("stores_user_identifiable_material: false");
    expect(runtimeSrc).toContain('execution_path: "signal_only"');
  });

  it("takes anchor and trace identity from the stored decision only", () => {
    expect(endpointSrc).toContain("ron_orchestrator_decisions");
    expect(endpointSrc).toContain("stored_decision_missing");
    expect(endpointSrc).toContain("const traceId = String(decisionRow.trace_id)");
    expect(endpointSrc).not.toMatch(/trace_id:\s*String\(body/);
  });

  it("performs zero writes unless persist is explicitly true", () => {
    expect(endpointSrc).toContain("const persist = body.persist === true;");
    expect(endpointSrc).toContain("if (persist) {");
    expect(endpointSrc).toContain("ignoreDuplicates: true");
  });

  it("is scheduled strictly downstream of a persisted decision and cannot break it", () => {
    expect(schedulerSrc).toContain("const orchestrationPersisted = res.ok && out?.persisted === true;");
    expect(schedulerSrc).toContain("if (orchestrationPersisted) {");
    expect(schedulerSrc).toContain("ron-opportunity-context");
    expect(schedulerSrc).toContain("opportunity_context_unreachable");
  });
});

describe("presentation restates stored tokens without inventing meaning", () => {
  it("maps the closed lifecycle vocabulary", () => {
    expect(presentLifecycle("confirmed")).toEqual({ label: "Context confirmed", unknown: false });
    expect(presentLifecycle("none").unknown).toBe(false);
  });

  it("marks unrecognised stored tokens as unknown instead of guessing", () => {
    const p = presentLifecycle("some_future_token");
    expect(p.unknown).toBe(true);
    expect(p.label).toBe("Some future token");
  });

  it("never emits probability, score or instruction language", () => {
    // The qualifier is checked separately: it legitimately NEGATES this vocabulary.
    expect(OPPORTUNITY_CONTEXT_QUALIFIER.toLowerCase())
      .toContain("not a probability, a score, a recommendation or a trade instruction");
    const text = [
      opportunitySummary({
        lifecycle: "strengthening", direction_context: "bullish",
        direction_authority: "session_aligned", setup_family: "ha_trend_continuation",
        data_state: "healthy",
      }),
      presentDirection("bearish").label,
      presentMaterialChange("direction_reversal").label,
    ].join(" ").toLowerCase();
    for (const banned of [
      "%", "probability", "confidence", "odds", "expected value", "edge",
      "buy", "sell", "entry", "stop loss", "take profit", "target",
    ]) expect(text).not.toContain(banned);
  });

  it("derives tone only from stored lifecycle and data tokens", () => {
    expect(opportunityTone("confirmed", "healthy")).toBe("supported");
    expect(opportunityTone("confirmed", "blocked")).toBe("blocked");
    expect(opportunityTone("weakening", "healthy")).toBe("caution");
    expect(opportunityTone("watch", "healthy")).toBe("neutral");
  });
});

describe("latest-record selection never substitutes a pair", () => {
  const row = (instrument: string, anchor: string): RonOpportunityContextRecord => ({
    id: `${instrument}-${anchor}`, instrument, timeframe: "15m",
    evaluation_anchor: anchor, analytical_bar_open: anchor, spec_version: 1, runtime_version: 1,
    decision_id: null, direction_context: "bullish", direction_authority: "session_aligned",
    setup_family: "ha_trend_continuation", lifecycle: "forming", material_change_type: "new_forming",
    data_state: "healthy", data_blocked: false, pattern_context_state: "neutral",
    cross_asset_context_state: "neutral", macro_context_state: "neutral",
    ha_states: null, limitations: null, created_at: anchor,
  });

  it("keeps only the newest anchor per pair", () => {
    const map = latestByPair([
      row("XAUUSD", "2026-08-25T06:00:00.000Z"),
      row("XAUUSD", "2026-08-25T06:15:00.000Z"),
    ]);
    expect(map.size).toBe(1);
    expect(map.get(contextKey("XAUUSD", "15m"))?.evaluation_anchor)
      .toBe("2026-08-25T06:15:00.000Z");
  });

  it("returns nothing for a pair with no stored record", () => {
    expect(latestByPair([]).get(contextKey("NAS100", "15m"))).toBeUndefined();
  });
});

describe("opportunity notifications are event-driven and tightly scoped", () => {
  const base: OpportunityNotificationRow = {
    id: "r1", instrument: "XAUUSD", timeframe: "15m",
    evaluation_anchor: "2026-08-25T06:15:00.000Z",
    lifecycle: "confirmed", direction_context: "bullish",
    material_change_type: "confirmed", data_state: "healthy", data_blocked: false,
  };
  const tracked = normaliseTrackedInstruments(["xauusd", " NAS100 "]);

  it("never notifies before the baseline is taken", () => {
    const state = createOpportunityNotificationState();
    expect(deriveOpportunityNotification(state, base, tracked)).toBeNull();
  });

  it("never re-notifies a row that already existed at first load", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), [base]);
    expect(deriveOpportunityNotification(state, base, tracked)).toBeNull();
  });

  it("notifies once for a genuine new material change", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), []);
    const first = deriveOpportunityNotification(state, { ...base, id: "r2" }, tracked);
    expect(first?.symbol).toBe("XAUUSD");
    expect(first?.changeLabel).toBe("Context confirmed");
    expect(deriveOpportunityNotification(state, { ...base, id: "r2" }, tracked)).toBeNull();
  });

  it("never notifies for material_change_type none or a data condition", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), []);
    expect(deriveOpportunityNotification(
      state, { ...base, id: "r3", material_change_type: "none" }, tracked)).toBeNull();
    expect(deriveOpportunityNotification(
      state, { ...base, id: "r4", material_change_type: "data_blocked" }, tracked)).toBeNull();
    expect(deriveOpportunityNotification(
      state, { ...base, id: "r5", data_blocked: true }, tracked)).toBeNull();
    expect(isNotifiableMaterialChange("data_blocked")).toBe(false);
  });

  it("never notifies for an instrument the user does not track", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), []);
    expect(deriveOpportunityNotification(
      state, { ...base, id: "r6", instrument: "US30" }, tracked)).toBeNull();
    expect(deriveOpportunityNotification(
      state, { ...base, id: "r7" }, new Set<string>())).toBeNull();
  });

  it("clears every dedupe key on sign-out", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), [base]);
    resetOpportunityNotificationState(state);
    expect(state.baselineReady).toBe(false);
    expect(state.seen.size).toBe(0);
  });

  it("deep links into the RON lane, never into an execution surface", () => {
    expect(viewOpportunityHref("XAUUSD")).toBe("/dashboard/signals?tab=ron&symbol=XAUUSD");
  });
});
