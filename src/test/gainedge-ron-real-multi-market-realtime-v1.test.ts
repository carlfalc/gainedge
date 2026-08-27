/**
 * GAINEDGE_RON_REAL_MULTI_MARKET_AND_REALTIME_SIGNAL_DELIVERY_V1 — guards.
 *
 * Two claims are protected here:
 *   1. The unattended scheduler drives the REAL specialist/orchestration chain for every
 *      eligible pilot market, and never uses Opportunity Context as a stand-in for it.
 *   2. RON popups are a view onto a DURABLE stored event, deduped by the server's own
 *      event identity, with no invented frequency.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyOpportunityBaseline, bufferOpportunityRow, createOpportunityNotificationState,
  deriveOpportunityNotification, drainBufferedOpportunities, normaliseTrackedInstruments,
  opportunityEventKey, type OpportunityNotificationRow,
} from "@/lib/signal-notifications";

const SCHEDULER = readFileSync("supabase/functions/ron-context-scheduler/index.ts", "utf8");
const ROSTER = readFileSync("supabase/functions/_shared/ron-native-roster-v1.ts", "utf8");

const evt = (over: Partial<OpportunityNotificationRow> = {}): OpportunityNotificationRow => ({
  id: "e1", event_key: "ron_opp_ctx|NAS100|15m|2026-08-27T09:00:00Z|spec2|rt2|confirmed",
  instrument: "NAS100", timeframe: "15m", evaluation_anchor: "2026-08-27T09:00:00Z",
  lifecycle: "confirmed", direction_context: "long", material_change_type: "confirmed",
  popup_capable: true, data_state: "ok", data_blocked: false, ...over,
});

const tracked = normaliseTrackedInstruments(["NAS100", "XAUUSD"]);

describe("real multi-market RON chain", () => {
  it("orchestration V10 is attempted before any context write", () => {
    expect(SCHEDULER).toContain("ron-orchestrate-run");
    expect(SCHEDULER).toContain("RON_ORCHESTRATION_RUN_VERSION_V10");
    expect(SCHEDULER.indexOf("functions/v1/ron-orchestrate-run"))
      .toBeLessThan(SCHEDULER.indexOf("functions/v1/ron-opportunity-context"));
  });

  it("an anchor already decided is never re-run", () => {
    expect(SCHEDULER).toContain("ron_orchestrator_decisions");
    expect(SCHEDULER).toContain("already_decided");
  });

  it("a completed bar awaiting its snapshot is deferred, not called a data fault", () => {
    expect(ROSTER).toContain('| "deferred"');
    expect(SCHEDULER).toContain("deferred_awaiting_accepted_snapshot");
    expect(SCHEDULER).toContain("SNAPSHOT_GRACE_MS");
  });

  it("nothing in the scheduler places or implies an order", () => {
    expect(SCHEDULER).toContain('execution_allowed: false');
    expect(SCHEDULER).not.toMatch(/place_order|broker_execute/i);
  });
});

describe("durable event popups", () => {
  it("dedupes on the server event identity, not the row id", () => {
    expect(opportunityEventKey(evt())).toBe(
      "event:ron_opp_ctx|NAS100|15m|2026-08-27T09:00:00Z|spec2|rt2|confirmed",
    );
    const s = createOpportunityNotificationState();
    applyOpportunityBaseline(s, []);
    expect(deriveOpportunityNotification(s, evt(), tracked)).not.toBeNull();
    // Same event re-delivered under a different row id must stay silent.
    expect(deriveOpportunityNotification(s, evt({ id: "e2" }), tracked)).toBeNull();
  });

  it("honours the server's popup_capable decision and blocks data conditions", () => {
    const s = createOpportunityNotificationState();
    applyOpportunityBaseline(s, []);
    expect(deriveOpportunityNotification(s, evt({ popup_capable: false }), tracked)).toBeNull();
    expect(deriveOpportunityNotification(
      s, evt({ id: "e3", event_key: "k3", data_blocked: true }), tracked,
    )).toBeNull();
  });

  it("only tracked instruments notify", () => {
    const s = createOpportunityNotificationState();
    applyOpportunityBaseline(s, []);
    expect(deriveOpportunityNotification(
      s, evt({ instrument: "USDCAD", event_key: "k4" }), tracked,
    )).toBeNull();
  });

  it("events racing the baseline are buffered and replayed exactly once", () => {
    const s = createOpportunityNotificationState();
    bufferOpportunityRow(s, evt());
    expect(deriveOpportunityNotification(s, evt(), tracked)).toBeNull();
    applyOpportunityBaseline(s, []);
    const drained = drainBufferedOpportunities(s, tracked);
    expect(drained).toHaveLength(1);
    expect(drained[0].symbol).toBe("NAS100");
    expect(drainBufferedOpportunities(s, tracked)).toHaveLength(0);
    expect(deriveOpportunityNotification(s, evt(), tracked)).toBeNull();
  });

  it("events already stored at first load never pop up", () => {
    const s = createOpportunityNotificationState();
    applyOpportunityBaseline(s, [evt()]);
    expect(deriveOpportunityNotification(s, evt(), tracked)).toBeNull();
  });
});
