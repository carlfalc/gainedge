import { describe, expect, it } from "vitest";
import {
  buildRonSessionContextV4,
  RON_SESSION_CONTEXT_VERSION_V4,
  sessionContextV4Payload,
} from "../../supabase/functions/_shared/ron-session-context-v4.ts";

const proof = (bar_open: string) => ({ bar_open, timeframe_minutes: 15 });

describe("RON Session Context V4 — instrument-aware forward contract", () => {
  it("classifies NAS100 US cash opening in New York local time", () => {
    // 2026-08-28 09:45 EDT = 13:45 UTC.
    const row = buildRonSessionContextV4({ instrument: "NAS100", evaluation_anchor: "2026-08-28T13:45:00.000Z" });
    expect(row.version).toBe(RON_SESSION_CONTEXT_VERSION_V4);
    expect(row.session_family).toBe("us_index");
    expect(row.session_label).toBe("us_cash_opening");
    expect(row.local_timezone).toBe("America/New_York");
    expect(row.local_time_bucket).toBe("09:45");
    expect(row.local_day_name).toBe("Friday");
    expect(row.active_trading_session).toBe(true);
  });

  it("classifies NAS100 cash closing hour", () => {
    // 2026-08-28 15:30 EDT = 19:30 UTC.
    const row = buildRonSessionContextV4({ instrument: "NAS100", evaluation_anchor: "2026-08-28T19:30:00.000Z" });
    expect(row.session_label).toBe("us_cash_closing");
    expect(row.local_time_bucket).toBe("15:30");
  });

  it("uses an exact native HK50 completed bar to establish an active HKEX morning session", () => {
    // 10:00 HKT anchor, proving the completed 09:45-10:00 HKT bar.
    const row = buildRonSessionContextV4({
      instrument: "HK50",
      evaluation_anchor: "2026-08-28T02:00:00.000Z",
      native_completed_bar: proof("2026-08-28T01:45:00.000Z"),
    });
    expect(row.venue.state).toBe("open");
    expect(row.session_family).toBe("hk_index");
    expect(row.session_label).toBe("hkex_morning");
    expect(row.local_time_bucket).toBe("10:00");
    expect(row.active_trading_session).toBe(true);
  });

  it("keeps HK50 in-session truth blocked when no native bar or holiday authority proves trading", () => {
    const row = buildRonSessionContextV4({
      instrument: "HK50",
      evaluation_anchor: "2026-08-28T02:00:00.000Z",
    });
    expect(row.venue.state).toBe("calendar_unavailable");
    expect(row.session_label).toBe("calendar_unavailable");
    expect(row.active_trading_session).toBe(false);
  });

  it("preserves HKEX lunch as an explicit non-trading research regime", () => {
    // 12:30 HKT.
    const row = buildRonSessionContextV4({ instrument: "HK50", evaluation_anchor: "2026-08-28T04:30:00.000Z" });
    expect(row.venue.state).toBe("closed");
    expect(row.session_label).toBe("hkex_lunch_break");
    expect(row.local_time_bucket).toBe("12:30");
    expect(row.active_trading_session).toBe(false);
  });

  it("classifies NZDUSD during the London session using DST-aware local clocks", () => {
    // 10:00 London BST, 05:00 New York EDT. London only.
    const row = buildRonSessionContextV4({ instrument: "NZDUSD", evaluation_anchor: "2026-08-28T09:00:00.000Z" });
    expect(row.session_family).toBe("fx");
    expect(row.session_label).toBe("london");
    expect(row.active_trading_session).toBe(true);
  });

  it("classifies USDCAD during the London/New York overlap using DST-aware local clocks", () => {
    // 14:00 London BST, 09:00 New York EDT. Both active.
    const row = buildRonSessionContextV4({ instrument: "USDCAD", evaluation_anchor: "2026-08-28T13:00:00.000Z" });
    expect(row.session_family).toBe("fx");
    expect(row.session_label).toBe("london_new_york_overlap");
    expect(row.active_trading_session).toBe(true);
  });

  it("classifies an FX Asia-session observation without inheriting XAUUSD session labels", () => {
    // 10:00 Tokyo JST; London/New York inactive.
    const row = buildRonSessionContextV4({ instrument: "NZDUSD", evaluation_anchor: "2026-08-28T01:00:00.000Z" });
    expect(row.session_label).toBe("asia");
    expect(row.session_family).toBe("fx");
  });

  it("carries weekday/session/time as stable cohort dimensions", () => {
    const row = buildRonSessionContextV4({ instrument: "NAS100", evaluation_anchor: "2026-08-28T13:45:00.000Z" });
    expect(row.cohort_dimensions).toEqual({
      weekday: "Friday",
      session: "us_cash_opening",
      local_time_bucket: "09:45",
    });
  });

  it("rejects malformed anchors and unregistered instruments instead of guessing", () => {
    expect(() => buildRonSessionContextV4({ instrument: "NAS100", evaluation_anchor: "bad-time" })).toThrow("invalid_evaluation_anchor");
    expect(() => buildRonSessionContextV4({ instrument: "BTCUSD", evaluation_anchor: "2026-08-28T13:45:00.000Z" })).toThrow("unregistered_instrument:BTCUSD");
  });

  it("publishes descriptive/research semantics only, never trading instructions or probabilities", () => {
    const payload = JSON.stringify(sessionContextV4Payload());
    expect(payload).toContain("cohort_dimensions");
    expect(payload).toContain("trade_instruction");
    expect(payload).not.toMatch(/buy|sell|probability|confidence|target|stop_loss/i);

    const row = buildRonSessionContextV4({ instrument: "USDCAD", evaluation_anchor: "2026-08-28T13:00:00.000Z" });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toMatch(/buy|sell|probability|confidence|target|stop_loss/i);
  });
});
