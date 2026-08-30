import { describe, expect, it } from "vitest";
import { assessVenue } from "../../supabase/functions/_shared/ron-venue-registry-v1.ts";
import {
  assessVenueV2,
  nativeCompletedBarProvesHk50Trading,
  RON_VENUE_REGISTRY_VERSION_V2,
} from "../../supabase/functions/_shared/ron-venue-registry-v2.ts";

const proof = (bar_open: string, timeframe_minutes = 15) => ({ bar_open, timeframe_minutes });

describe("RON venue registry V2 HK50 native-bar proof", () => {
  it("preserves V1 calendar-unavailable truth when no native proof is supplied", () => {
    const anchor = "2026-08-28T02:00:00.000Z"; // 10:00 HKT weekday
    expect(assessVenue("HK50", new Date(anchor)).state).toBe("calendar_unavailable");
    const v2 = assessVenueV2("HK50", anchor, null);
    expect(v2.state).toBe("calendar_unavailable");
    expect(v2.registry_version).toBe(RON_VENUE_REGISTRY_VERSION_V2);
  });

  it("accepts a genuine exact-slot morning-session completed bar as proof trading occurred", () => {
    const anchor = "2026-08-28T02:00:00.000Z"; // close of 09:45-10:00 HKT bar
    const p = proof("2026-08-28T01:45:00.000Z");
    expect(nativeCompletedBarProvesHk50Trading(anchor, p)).toBe(true);
    const v2 = assessVenueV2("HK50", anchor, p);
    expect(v2.state).toBe("open");
    expect(v2.reason).toBe("native_completed_bar_proves_hkex_trading_for_exact_slot");
  });

  it("accepts an afternoon-session exact-slot completed bar", () => {
    const anchor = "2026-08-28T06:00:00.000Z"; // 14:00 HKT close
    const p = proof("2026-08-28T05:45:00.000Z");
    expect(nativeCompletedBarProvesHk50Trading(anchor, p)).toBe(true);
    expect(assessVenueV2("HK50", anchor, p).state).toBe("open");
  });

  it("rejects lunch-break bars even if a caller claims one exists", () => {
    const anchor = "2026-08-28T04:30:00.000Z"; // 12:30 HKT
    const p = proof("2026-08-28T04:15:00.000Z");
    expect(nativeCompletedBarProvesHk50Trading(anchor, p)).toBe(false);
    expect(assessVenueV2("HK50", anchor, p).state).toBe("closed");
  });

  it("rejects weekend bars", () => {
    const anchor = "2026-08-29T02:00:00.000Z"; // Saturday 10:00 HKT
    const p = proof("2026-08-29T01:45:00.000Z");
    expect(nativeCompletedBarProvesHk50Trading(anchor, p)).toBe(false);
    expect(assessVenueV2("HK50", anchor, p).state).toBe("closed");
  });

  it("rejects wrong timeframe, wrong anchor offset, malformed and off-grid proof", () => {
    const anchor = "2026-08-28T02:00:00.000Z";
    expect(nativeCompletedBarProvesHk50Trading(anchor, proof("2026-08-28T01:45:00.000Z", 5))).toBe(false);
    expect(nativeCompletedBarProvesHk50Trading(anchor, proof("2026-08-28T01:30:00.000Z"))).toBe(false);
    expect(nativeCompletedBarProvesHk50Trading(anchor, proof("not-a-date"))).toBe(false);
    expect(nativeCompletedBarProvesHk50Trading(anchor, proof("2026-08-28T01:46:00.000Z"))).toBe(false);
  });

  it("does not change non-HK50 venue states", () => {
    const at = "2026-08-28T02:00:00.000Z";
    for (const instrument of ["XAUUSD", "NAS100", "NZDUSD", "USDCAD"] as const) {
      const v1 = assessVenue(instrument, new Date(at));
      const v2 = assessVenueV2(instrument, at, proof("2026-08-28T01:45:00.000Z"));
      expect(v2.state).toBe(v1.state);
      expect(v2.reason).toBe(v1.reason);
    }
  });
});
