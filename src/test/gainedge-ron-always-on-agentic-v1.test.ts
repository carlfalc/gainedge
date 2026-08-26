/**
 * GAINEDGE_RON_ALWAYS_ON_AGENTIC_V1 — venue registry + data-health watchdog.
 *
 * Proves: instrument-aware venue truth (never XAUUSD semantics by default), honest
 * failure when a holiday calendar is unavailable, closure is not ingestion failure,
 * no synthetic candles, no probability, no execution language, and no browser
 * dependence in the server-side modules.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  RON_DATA_INSTRUMENTS, RON_PILOT_INSTRUMENTS, RON_VENUE_REGISTRY_VERSION, VENUE_REGISTRY,
  assessVenue, localClock, nextExpectedOpen, venueRegistryPayload, venueReasoningAllowed,
} from "../../supabase/functions/_shared/ron-venue-registry-v1.ts";
import {
  assessDataHealth, isMaterialHealthChange,
} from "../../supabase/functions/_shared/ron-data-health-v1.ts";

const registrySrc = readFileSync("supabase/functions/_shared/ron-venue-registry-v1.ts", "utf8");
const healthSrc = readFileSync("supabase/functions/_shared/ron-data-health-v1.ts", "utf8");

/** Wed 2026-08-26 10:00 UTC — 18:00 HKT (HKEX shut), inside the FX/CFD week. */
const WED_1000Z = Date.parse("2026-08-26T10:00:00.000Z");
/** Wed 2026-08-26 03:00 UTC — 11:00 HKT, inside the HKEX morning session. */
const WED_0300Z = Date.parse("2026-08-26T03:00:00.000Z");
/** Sat 2026-08-29 10:00 UTC — every venue shut. */
const SAT_1000Z = Date.parse("2026-08-29T10:00:00.000Z");

describe("venue registry — explicit, never inferred", () => {
  it("registers every pilot and data instrument with an explicit venue class", () => {
    expect([...RON_PILOT_INSTRUMENTS]).toEqual(["XAUUSD", "NAS100", "NZDUSD", "USDCAD", "HK50"]);
    for (const i of RON_DATA_INSTRUMENTS) expect(VENUE_REGISTRY[i]?.instrument).toBe(i);
    expect(RON_DATA_INSTRUMENTS).toContain("USOUSD");
    expect(RON_DATA_INSTRUMENTS).toContain("UKOUSD");
  });

  it("refuses unknown instruments instead of applying XAUUSD semantics", () => {
    const a = assessVenue("EURJPY", WED_1000Z);
    expect(a.state).toBe("unregistered");
    expect(venueReasoningAllowed(a)).toBe(false);
  });

  it("does not give non-gold instruments the gold holiday calendar", () => {
    expect(VENUE_REGISTRY.XAUUSD.holiday_calendar_available).toBe(true);
    for (const i of ["NAS100", "NZDUSD", "USDCAD", "HK50", "USOUSD", "UKOUSD"]) {
      expect(VENUE_REGISTRY[i].holiday_calendar_available).toBe(false);
    }
  });

  it("has a stable, hashable payload", () => {
    expect(JSON.stringify(venueRegistryPayload())).toBe(JSON.stringify(venueRegistryPayload()));
    expect(RON_VENUE_REGISTRY_VERSION).toBe(1);
  });
});

describe("venue state — closure is assertable, openness is not guessed", () => {
  it("treats weekends as closed for every registered venue", () => {
    for (const i of RON_DATA_INSTRUMENTS) {
      expect(assessVenue(i, SAT_1000Z).state).toBe("closed");
    }
  });

  it("reports FX/CFD venues open inside the weekly broker schedule", () => {
    for (const i of ["NZDUSD", "USDCAD", "NAS100"]) {
      const a = assessVenue(i, WED_1000Z);
      expect(a.state).toBe("open");
      expect(a.reason).toBe("broker_weekly_schedule_open");
    }
  });

  it("fails honestly for HK50 inside the cash session (no HK holiday calendar)", () => {
    const hk = localClock(WED_0300Z, "Asia/Hong_Kong");
    expect(hk.dow).toBe(3);
    expect(hk.minutes).toBe(11 * 60);
    const a = assessVenue("HK50", WED_0300Z);
    expect(a.state).toBe("calendar_unavailable");
    expect(a.reason).toBe("hkex_holiday_calendar_unavailable");
    expect(venueReasoningAllowed(a)).toBe(false);
    expect(a.next_expected_open).toBeNull();
  });

  it("still asserts HK50 lunch break and after-hours closures", () => {
    const lunch = Date.parse("2026-08-26T04:30:00.000Z");   // 12:30 HKT
    expect(assessVenue("HK50", lunch).reason).toBe("hkex_lunch_break_1200_1300_hkt");
    expect(assessVenue("HK50", WED_1000Z).reason).toBe("hkex_outside_cash_session_hkt");
  });

  it("derives a next expected open only where the calendar can justify it", () => {
    expect(nextExpectedOpen("NZDUSD", SAT_1000Z)).toMatch(/^2026-08-30T22:00/);
    expect(nextExpectedOpen("HK50", SAT_1000Z)).toBeNull();
    expect(nextExpectedOpen("XAUUSD", SAT_1000Z)).not.toBeNull();
  });
});

describe("data-health watchdog", () => {
  const H = (o: Partial<Parameters<typeof assessDataHealth>[0]>) => assessDataHealth({
    instrument: "NZDUSD", timeframe: "15m", now_ms: WED_1000Z,
    latest_bar_time: new Date(WED_1000Z - 16 * 60_000).toISOString(),
    bar_minutes: 15, critical_flag_count: 0, ...o,
  });

  it("calls fresh data current and allows evaluation", () => {
    const h = H({});
    expect(h.status).toBe("current");
    expect(h.evaluation_allowed).toBe(true);
    expect(h.age_minutes).toBe(16);
  });

  it("separates legitimate venue closure from ingestion failure", () => {
    const closed = H({ now_ms: SAT_1000Z, latest_bar_time: "2026-08-28T20:45:00.000Z" });
    expect(closed.status).toBe("closed_waiting");
    expect(closed.reason.startsWith("venue_closed:")).toBe(true);
    const failing = H({ latest_bar_time: new Date(WED_1000Z - 6 * 60 * 60_000).toISOString() });
    expect(failing.status).toBe("provider_failure");
    expect(failing.evaluation_allowed).toBe(false);
  });

  it("grades intermediate lag without crying failure", () => {
    expect(H({ latest_bar_time: new Date(WED_1000Z - 50 * 60_000).toISOString() }).status)
      .toBe("provider_lag");
  });

  it("never invents a bar when none exists", () => {
    const h = H({ latest_bar_time: null });
    expect(h.status).toBe("no_data");
    expect(h.latest_bar_time).toBeNull();
    expect(h.age_minutes).toBeNull();
    expect(h.evaluation_allowed).toBe(false);
  });

  it("blocks evaluation when the venue calendar is unavailable", () => {
    const h = H({ instrument: "HK50", now_ms: WED_0300Z });
    expect(h.status).toBe("calendar_unavailable");
    expect(h.evaluation_allowed).toBe(false);
  });

  it("persists only material transitions", () => {
    const h = H({});
    expect(isMaterialHealthChange(null, h)).toBe(true);
    expect(isMaterialHealthChange({ status: h.status, reason: h.reason, latest_bar_time: "x" }, h))
      .toBe(false);
    expect(isMaterialHealthChange({ status: "provider_lag", reason: h.reason, latest_bar_time: null }, h))
      .toBe(true);
  });
});

describe("safety surface", () => {
  it("contains no execution, probability or browser dependence", () => {
    for (const src of [registrySrc, healthSrc]) {
      const s = src.toLowerCase();
      for (const banned of ["metaapi", "place_order", "createorder", "buy signal", "sell signal",
        "probability:", "window.", "localstorage", "document."]) {
        expect(s.includes(banned)).toBe(false);
      }
    }
  });
});
