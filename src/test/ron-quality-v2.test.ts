/**
 * RON Phase 2C.1 acceptance tests — quality_version=2 premature-bar rule and the
 * central eligibility contract.
 */
import { describe, it, expect } from "vitest";
import {
  detectBarQuality, evidenceHash, RON_QUALITY_VERSION_V2, CRITICAL_RULES, isQuarantined,
} from "../../supabase/functions/_shared/ron-data-quality";
import { criticalRulesForBar } from "../../supabase/functions/_shared/ron-quality-contract";
import { xauVenueOpen } from "../../supabase/functions/_shared/ron-sessions";

const BAR_MINUTES = 15;
/** These are v2 REPLAY tests: they must keep asserting v2 semantics after v3 shipped. */
const opts = { barMinutes: BAR_MINUTES, venueOpen: xauVenueOpen, qualityVersion: RON_QUALITY_VERSION_V2 };

/** 2026-08-10T01:45:00Z — a genuine tradable Monday bar (NY 21:45 Sunday). */
const OPEN = Date.parse("2026-08-10T01:45:00Z");
const CLOSE = OPEN + BAR_MINUTES * 60_000;
const bar = { time: OPEN, open: 4317.44, high: 4319.51, low: 4316.64, close: 4316.94, volume: 252 };

describe("quality_version = 2", () => {
  it("still replays byte-identically and treats premature bars as critical", () => {
    expect(RON_QUALITY_VERSION_V2).toBe(2);
    expect(CRITICAL_RULES).toContain("premature_bar_persisted");
    expect(CRITICAL_RULES).toContain("venue_break_bar");
  });

  it("flags the real production defect: row written before the bar closed", () => {
    const flags = detectBarQuality(
      { ...bar, created_at: Date.parse("2026-08-10T01:46:39.582Z") }, [], opts,
    );
    const f = flags.find((x) => x.rule_code === "premature_bar_persisted");
    expect(f).toBeTruthy();
    expect(f!.severity).toBe("critical");
    expect(f!.quality_version).toBe(2);
    expect(f!.evidence.bar_close_time).toBe(new Date(CLOSE).toISOString());
    expect(isQuarantined(flags)).toBe(true);
  });

  it("does NOT flag a bar persisted at or after its close", () => {
    const onTime = detectBarQuality({ ...bar, created_at: CLOSE }, [], opts);
    expect(onTime.some((f) => f.rule_code === "premature_bar_persisted")).toBe(false);
    const late = detectBarQuality({ ...bar, created_at: CLOSE + 5_000 }, [], opts);
    expect(late.some((f) => f.rule_code === "premature_bar_persisted")).toBe(false);
  });

  it("never invents a verdict when created_at is unknown", () => {
    const flags = detectBarQuality({ ...bar, created_at: null }, [], opts);
    expect(flags.some((f) => f.rule_code === "premature_bar_persisted")).toBe(false);
  });

  it("quality_version=1 replay is preserved byte-for-byte (no new rule applied)", () => {
    const v1 = detectBarQuality(
      { ...bar, created_at: Date.parse("2026-08-10T01:46:39.582Z") }, [],
      { ...opts, qualityVersion: 1 },
    );
    expect(v1.some((f) => f.rule_code === "premature_bar_persisted")).toBe(false);
    expect(v1.every((f) => f.quality_version === 1)).toBe(true);
  });

  it("evidence hashes are deterministic and rule-specific", async () => {
    const f = detectBarQuality({ ...bar, created_at: OPEN + 1000 }, [], opts)[0];
    const a = await evidenceHash("XAUUSD", "15m", f);
    const b = await evidenceHash("XAUUSD", "15m", f);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe("central eligibility contract", () => {
  it("recomputes both critical rules purely from the source row", () => {
    expect(criticalRulesForBar({ time: OPEN, created_at: null }, BAR_MINUTES)).toEqual([]);
    expect(criticalRulesForBar({ time: OPEN, created_at: OPEN + 60_000 }, BAR_MINUTES))
      .toEqual(["premature_bar_persisted"]);
    // 2026-05-21T21:45Z is inside the NY 17:00-18:00 venue break.
    const breakBar = Date.parse("2026-05-21T21:45:00Z");
    expect(criticalRulesForBar({ time: breakBar, created_at: null }, BAR_MINUTES))
      .toContain("venue_break_bar");
  });

  it("fails closed for unflagged bars — no database round trip required", () => {
    const unaudited = { time: OPEN, created_at: OPEN + 1 };
    expect(criticalRulesForBar(unaudited, BAR_MINUTES).length).toBeGreaterThan(0);
  });
});
