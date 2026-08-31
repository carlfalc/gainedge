import { describe, expect, it } from "vitest";
import { brokerVariantsFor } from "../../supabase/functions/_shared/broker-symbol-variants.ts";
import {
  RON_SELECTED_WATCH_INSTRUMENTS,
  RON_DATA_INSTRUMENTS_V2,
  ronAgenticWatchPayload,
} from "../../supabase/functions/_shared/ron-agentic-watch-universe-v1.ts";
import {
  assessVenueV3,
  VENUE_REGISTRY_V3,
} from "../../supabase/functions/_shared/ron-venue-registry-v3.ts";
import {
  buildRonSessionContextV5,
  sessionContextV5Payload,
} from "../../supabase/functions/_shared/ron-session-context-v5.ts";

describe("RON agentic watch V1 — GER40 + all sessions", () => {
  it("includes GER40 in the selected RON watch universe", () => {
    expect(RON_SELECTED_WATCH_INSTRUMENTS).toContain("GER40");
    expect(RON_DATA_INSTRUMENTS_V2).toContain("GER40");
    expect(VENUE_REGISTRY_V3.GER40.instrument).toBe("GER40");
    expect(VENUE_REGISTRY_V3.GER40.timezone).toBe("Europe/Berlin");
  });

  it("uses the existing Eightcap/MetaApi GER40 aliases", () => {
    expect(brokerVariantsFor("GER40")).toEqual(["GER40", "DAX40", "DE40", "GER40.i"]);
  });

  it("watches GER40 before European cash open when the Eightcap venue is open", () => {
    // Monday 07:00 Berlin in summer: Eightcap GER40 is open, Xetra cash is not yet open.
    const row = buildRonSessionContextV5({
      instrument: "GER40",
      evaluation_anchor: "2026-08-31T05:00:00.000Z",
    });
    expect(row.venue.state).toBe("open");
    expect(row.session_label).toBe("europe_pre_cash");
    expect(row.active_trading_session).toBe(true);
    expect(row.session_gates_agentic_watch).toBe(false);
  });

  it("watches GER40 after European cash close while Eightcap still trades it", () => {
    // Monday 20:00 Berlin: after Xetra cash hours but before Eightcap's 23:00 broker close.
    const row = buildRonSessionContextV5({
      instrument: "GER40",
      evaluation_anchor: "2026-08-31T18:00:00.000Z",
    });
    expect(row.venue.state).toBe("open");
    expect(row.session_label).toBe("europe_after_cash");
    expect(row.active_trading_session).toBe(true);
    expect(row.session_gates_agentic_watch).toBe(false);
  });

  it("closes at Eightcap's published 23:00 broker-time boundary", () => {
    // On 31 Aug 2026 the published GMT+3 session closes at 20:00 UTC.
    const lastOpenAnchor = assessVenueV3("GER40", "2026-08-31T19:59:00.000Z");
    const closeAnchor = assessVenueV3("GER40", "2026-08-31T20:00:00.000Z");
    expect(lastOpenAnchor.state).toBe("open");
    expect(closeAnchor.state).toBe("closed");
    expect(closeAnchor.reason).toBe("eightcap_ger40_daily_close_1600_2015_ny");
    expect(closeAnchor.next_expected_open).toBe("2026-09-01T00:15:00.000Z");
  });

  it("reopens at Eightcap's published 03:15 broker-time boundary", () => {
    const before = assessVenueV3("GER40", "2026-09-01T00:14:00.000Z");
    const open = assessVenueV3("GER40", "2026-09-01T00:15:00.000Z");
    expect(before.state).toBe("closed");
    expect(open.state).toBe("open");
    expect(open.reason).toBe("eightcap_ger40_published_session_open");
  });

  it("still stops watch reasoning during the weekend closure", () => {
    const venue = assessVenueV3("GER40", "2026-08-29T12:00:00.000Z"); // Saturday
    expect(venue.state).toBe("closed");
    expect(venue.reason).toBe("eightcap_ger40_weekend_close");
  });

  it("does not encode a London/New York gate anywhere in the watch contract", () => {
    const watch = JSON.stringify(ronAgenticWatchPayload());
    const session = JSON.stringify(sessionContextV5Payload());
    expect(watch).toContain('\"london_or_new_york_gate\",false');
    expect(watch).toContain('\"evaluate_every_eligible_completed_bar\",true');
    expect(session).toContain('\"all_open_sessions_watched\",true');
    expect(session).toContain('\"session_gate\",false');
  });

  it("keeps the selected scope explicit rather than wildcarding all broker symbols", () => {
    expect([...RON_SELECTED_WATCH_INSTRUMENTS]).toEqual([
      "XAUUSD", "NAS100", "NZDUSD", "USDCAD", "HK50", "GER40",
    ]);
  });
});
