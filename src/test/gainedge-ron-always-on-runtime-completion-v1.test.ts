/**
 * GAINEDGE_RON_ALWAYS_ON_RUNTIME_COMPLETION_V1 — contract tests.
 *
 * Proves the RON-native roster is truthful (Falconer excluded), that cycle completeness
 * is deny-by-default and never inferred from silence, that lifecycle transition start
 * times are derived only from stored records with an explicit window qualifier, and that
 * the scheduler records every cycle outcome server-side.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  RON_ANALYTICAL_COMPONENT_IDS, RON_GATE_COMPONENT_IDS, RON_NATIVE_COMPONENT_IDS,
  RON_NATIVE_ROSTER, RON_NATIVE_ROSTER_VERSION, RON_OPTIONAL_ADJUNCTS,
  evaluateCycleCompleteness, expectedComponentsFor, isOptionalAdjunct, isRonNativeComponent,
  ronNativeRosterPayload,
} from "../../supabase/functions/_shared/ron-native-roster-v1.ts";
import {
  deriveStateSince, presentStateSince, sortHistoryNewestFirst,
} from "@/lib/ron-lifecycle-since";
import {
  applyOpportunityBaseline, createOpportunityNotificationState,
  deriveOpportunityNotification, normaliseTrackedInstruments,
} from "@/lib/signal-notifications";

const SCHEDULER = "supabase/functions/ron-context-scheduler/index.ts";
const schedulerSrc = readFileSync(SCHEDULER, "utf8");

const ANCHOR = "2026-08-21T06:00:00.000Z";

describe("RON-native runtime roster", () => {
  it("declares exactly six RON-native components", () => {
    expect(RON_NATIVE_ROSTER).toHaveLength(6);
    expect(RON_NATIVE_ROSTER_VERSION).toBe(1);
  });

  it("splits four analytical specialists from two governance/construction gates", () => {
    expect(RON_ANALYTICAL_COMPONENT_IDS).toEqual([
      "session_market_structure", "pattern_context",
      "macro_news_geopolitics", "cross_asset_correlation",
    ]);
    expect(RON_GATE_COMPONENT_IDS).toEqual([
      "calibration_model_validation", "opportunity_risk",
    ]);
  });

  it("excludes Falconer from the RON-native roster and treats it as an adjunct", () => {
    expect(RON_NATIVE_COMPONENT_IDS).not.toContain("falconer_signal_source");
    expect(isRonNativeComponent("falconer_signal_source")).toBe(false);
    expect(isOptionalAdjunct("falconer_signal_source")).toBe(true);
    expect(RON_OPTIONAL_ADJUNCTS).toContain("falconer_signal_source");
  });

  it("never marks an adjunct as required", () => {
    for (const id of RON_OPTIONAL_ADJUNCTS) {
      expect(RON_NATIVE_ROSTER.some((c) => c.component_id === id)).toBe(false);
    }
  });

  it("declares cross-asset as conditional and everything else as always-on", () => {
    for (const c of RON_NATIVE_ROSTER) {
      expect(c.applicability).toBe(c.component_id === "cross_asset_correlation" ? "conditional" : "always");
    }
  });

  it("hashable payload states Falconer is not native", () => {
    const payload = ronNativeRosterPayload();
    expect(payload[payload.indexOf("falconer_is_native") + 1]).toBe(false);
  });
});

describe("applicability is declared, never guessed", () => {
  it("includes cross-asset only where a relationship is declared", () => {
    const xau = expectedComponentsFor("XAUUSD");
    expect(xau).toContain("cross_asset_correlation");
    const unrelated = expectedComponentsFor("NOT_A_REAL_SYMBOL");
    expect(unrelated).not.toContain("cross_asset_correlation");
    expect(unrelated).toHaveLength(5);
  });

  it("reports an inapplicable component as not_applicable rather than missing", () => {
    const r = evaluateCycleCompleteness({
      instrument: "NOT_A_REAL_SYMBOL", timeframe: "15m", evaluation_anchor: ANCHOR,
      observed_components: expectedComponentsFor("NOT_A_REAL_SYMBOL"),
      context_written: true, material_event_written: false,
    });
    expect(r.cycle_status).toBe("complete");
    expect(r.missing_components).toEqual([]);
    expect(r.not_applicable_components).toEqual(["cross_asset_correlation"]);
  });
});

describe("cycle completeness never infers success from silence", () => {
  it("is incomplete when no component ran", () => {
    const r = evaluateCycleCompleteness({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
      observed_components: [], context_written: false, material_event_written: false,
    });
    expect(r.cycle_status).toBe("incomplete");
    expect(r.completed_components).toEqual([]);
    expect(r.missing_components).toEqual([...expectedComponentsFor("XAUUSD")]);
    expect(r.reason).toContain("missing_required_components:");
  });

  it("is complete only when every applicable required component settled", () => {
    const expected = [...expectedComponentsFor("XAUUSD")];
    expect(evaluateCycleCompleteness({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
      observed_components: expected.slice(0, -1),
      context_written: true, material_event_written: false,
    }).cycle_status).toBe("incomplete");

    expect(evaluateCycleCompleteness({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
      observed_components: expected, context_written: true, material_event_written: true,
    }).cycle_status).toBe("complete");
  });

  it("a Falconer run can never complete a cycle or be counted as native", () => {
    const r = evaluateCycleCompleteness({
      instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
      observed_components: ["falconer_signal_source"],
      context_written: false, material_event_written: false,
    });
    expect(r.cycle_status).toBe("incomplete");
    expect(r.completed_components).toEqual([]);
    expect(r.adjunct_components).toEqual(["falconer_signal_source"]);
  });

  it("blocked states are explicit and never masquerade as complete", () => {
    for (const status of ["blocked_data", "blocked_market", "blocked_venue"] as const) {
      const r = evaluateCycleCompleteness({
        instrument: "XAUUSD", timeframe: "15m", evaluation_anchor: ANCHOR,
        observed_components: [...expectedComponentsFor("XAUUSD")],
        context_written: false, material_event_written: false,
        blocked: { status, reason: `${status}_reason` },
      });
      expect(r.cycle_status).toBe(status);
      expect(r.reason).toBe(`${status}_reason`);
    }
  });

  it("is deterministic and order-independent", () => {
    const expected = [...expectedComponentsFor("NAS100")];
    const a = evaluateCycleCompleteness({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      observed_components: expected, context_written: true, material_event_written: false,
    });
    const b = evaluateCycleCompleteness({
      instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
      observed_components: [...expected].reverse(),
      context_written: true, material_event_written: false,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("lifecycle transition start time", () => {
  const row = (anchor: string, lifecycle: string) =>
    ({ evaluation_anchor: anchor, lifecycle });

  it("returns null for empty or unusable history", () => {
    expect(deriveStateSince([])).toBeNull();
    expect(deriveStateSince([row("not-a-date", "forming")])).toBeNull();
  });

  it("uses the oldest contiguous record in the current state", () => {
    const since = deriveStateSince([
      row("2026-08-21T06:00:00.000Z", "forming"),
      row("2026-08-21T05:45:00.000Z", "forming"),
      row("2026-08-21T05:30:00.000Z", "forming"),
      row("2026-08-21T05:15:00.000Z", "dormant"),
    ])!;
    expect(since.lifecycle).toBe("forming");
    expect(since.state_since).toBe("2026-08-21T05:30:00.000Z");
    expect(since.observed_records).toBe(3);
    expect(since.bounded_by_window).toBe(false);
  });

  it("is order-independent", () => {
    const rows = [
      row("2026-08-21T05:15:00.000Z", "dormant"),
      row("2026-08-21T06:00:00.000Z", "forming"),
      row("2026-08-21T05:45:00.000Z", "forming"),
    ];
    expect(deriveStateSince(rows)!.state_since).toBe("2026-08-21T05:45:00.000Z");
    expect(sortHistoryNewestFirst(rows)[0].evaluation_anchor).toBe("2026-08-21T06:00:00.000Z");
  });

  it("qualifies the claim when the run reaches the window edge", () => {
    const since = deriveStateSince([
      row("2026-08-21T06:00:00.000Z", "forming"),
      row("2026-08-21T05:45:00.000Z", "forming"),
    ])!;
    expect(since.bounded_by_window).toBe(true);
    expect(presentStateSince(since).label).toBe("In this state at least since");
    expect(presentStateSince(since).qualified).toBe(true);
  });

  it("never treats a single observation as a proven transition", () => {
    const since = deriveStateSince([row("2026-08-21T06:00:00.000Z", "forming")])!;
    expect(since.bounded_by_window).toBe(true);
    expect(since.state_since).toBe("2026-08-21T06:00:00.000Z");
  });

  it("never invents a value when there is no history", () => {
    expect(presentStateSince(null)).toEqual({
      label: "No stored history", value: null, qualified: true,
    });
  });
});

describe("material event -> popup pipeline", () => {
  const tracked = normaliseTrackedInstruments(["NAS100"]);
  const base = {
    id: "row-1", instrument: "NAS100", timeframe: "15m", evaluation_anchor: ANCHOR,
    lifecycle: "forming", direction_context: "long_context",
    material_change_type: "confirmed", data_state: "ok", data_blocked: false,
  };

  it("pops for a genuine stored material change on a tracked instrument", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), []);
    expect(deriveOpportunityNotification(state, base, tracked)).not.toBeNull();
  });

  it("never pops twice for the same stored record", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), []);
    expect(deriveOpportunityNotification(state, base, tracked)).not.toBeNull();
    expect(deriveOpportunityNotification(state, base, tracked)).toBeNull();
  });

  it("never pops for rows that already existed at first load", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), [base]);
    expect(deriveOpportunityNotification(state, base, tracked)).toBeNull();
  });

  it("never pops for an untracked instrument or a data-blocked row", () => {
    const state = applyOpportunityBaseline(createOpportunityNotificationState(), []);
    expect(deriveOpportunityNotification(state, base, normaliseTrackedInstruments(["XAUUSD"])))
      .toBeNull();
    expect(deriveOpportunityNotification(
      state, { ...base, id: "row-2", data_blocked: true }, tracked,
    )).toBeNull();
  });

  it("never pops before the baseline is established", () => {
    expect(deriveOpportunityNotification(
      createOpportunityNotificationState(), base, tracked,
    )).toBeNull();
  });
});

describe("server-side scheduler observability", () => {
  it("evaluates cycle completeness against the RON-native roster", () => {
    expect(schedulerSrc).toContain("ron-native-roster-v1.ts");
    expect(schedulerSrc).toContain("evaluateCycleCompleteness");
  });

  it("reads genuinely settled component runs for the exact anchor", () => {
    expect(schedulerSrc).toContain('db.from("ron_agent_runs")');
    expect(schedulerSrc).toContain('.eq("as_of", anchorIso)');
  });

  it("records blocked venue, blocked market and blocked data cycles explicitly", () => {
    for (const s of ["blocked_venue", "blocked_market", "blocked_data"]) {
      expect(schedulerSrc).toContain(s);
    }
    expect(schedulerSrc).toContain('db.from("ron_data_health_events")');
  });

  it("never lets observability failures break the runtime", () => {
    expect(schedulerSrc).toContain("Observability must never break the runtime.");
  });

  it("remains execution-free and probability-free", () => {
    expect(schedulerSrc).toContain("execution_allowed: false");
    expect(schedulerSrc).toContain("numeric_probability: null");
    for (const banned of ["metaapi-trade", "place_order", "createOrder"]) {
      expect(schedulerSrc.includes(banned)).toBe(false);
    }
  });

  it("has no browser or session dependency", () => {
    for (const banned of ["window", "localStorage", "@/integrations"]) {
      expect(schedulerSrc.includes(banned)).toBe(false);
    }
  });
});
