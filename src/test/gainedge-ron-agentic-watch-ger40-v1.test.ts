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

  it("watches GER40 before European cash open when the broker venue is open", () => {
    // Monday 07:00 Berlin in summer: CFD venue open, European cash not yet open.
    const row = buildRonSessionContextV5({
      instrument: "GER40",
      evaluation_anchor: "2026-08-31T05:00:00.000Z",
    });
    expect(row.venue.state).toBe("open");
    expect(row.session_label).toBe("europe_pre_cash");
    expect(row.active_trading_session).toBe(true);
    expect(row.session_gates_agentic_watch).toBe(false);
  });

  it("watches GER40 after European cash close when the broker venue remains open", () => {
    // Monday 20:00 Berlin: after Xetra cash hours but before the broker weekly/daily break.
    const row = buildRonSessionContextV5({
      instrument: "GER40",
      evaluation_anchor: "2026-08-31T18:00:00.000Z",
    });
    expect(row.venue.state).toBe("open");
    expect(row.session_label).toBe("europe_after_cash");
    expect(row.active_trading_session).toBe(true);
    expect(row.session_gates_agentic_watch).toBe(false);
  });

  it("still stops watch reasoning during a proven broker closure", () => {
    const venue = assessVenueV3("GER40", "2026-08-29T12:00:00.000Z"); // Saturday
    expect(venue.state).toBe("closed");
  });

  it("does not encode a London/New York gate anywhere in the watch contract", () => {
    const watch = JSON.stringify(ronAgenticWatchPayload());
    const session = JSON.stringify(sessionContextV5Payload());
    expect(watch).toContain('"london_or_new_york_gate",false');
    expect(watch).toContain('"evaluate_every_eligible_completed_bar",true');
    expect(session).toContain('"all_open_sessions_watched",true');
    expect(session).toContain('"session_gate",false');
  });

  it("keeps the selected scope explicit rather than wildcarding all broker symbols", () => {
    expect([...RON_SELECTED_WATCH_INSTRUMENTS]).toEqual([
      "XAUUSD", "NAS100", "NZDUSD", "USDCAD", "HK50", "GER40",
    ]);
  });
});
