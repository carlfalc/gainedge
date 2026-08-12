import { describe, it, expect } from "vitest";
import { deriveFalconerSignalState } from "@/lib/falconer-signal-state";

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

describe("Falconer badge truthfulness (Dashboard Intelligence 1a)", () => {
  it("A. open + fresh => active FALCONER LONG", () => {
    const s = deriveFalconerSignalState({ direction: "long", opened_at: iso(5), status: "open" }, "15m");
    expect(s.isOpenFalconerSignal).toBe(true);
    expect(s.ageExpired).toBe(false);
    expect(s.isActive).toBe(true);
    expect(s.badgeText).toBe("FALCONER LONG");
    expect(s.badgeTone).toBe("active-long");
  });

  it("B. closed_sl 5m ago => never active, renders CLOSED", () => {
    const s = deriveFalconerSignalState(
      { direction: "long", opened_at: iso(5), status: "closed_sl", closed_at: iso(1) }, "15m");
    expect(s.isOpenFalconerSignal).toBe(false);
    expect(s.isActive).toBe(false);
    expect(s.badgeText).toBe("CLOSED LONG");
    expect(s.badgeTone).toBe("muted");
    expect(s.status).toBe("closed_sl");
    expect(s.closedMeta).toMatch(/^closed .+ · .+/);
  });

  it("B2. every closed_* status is inactive regardless of age", () => {
    for (const st of ["closed_sl", "closed_tp3", "closed_ha_flip", "closed_future_thing"]) {
      const s = deriveFalconerSignalState({ direction: "short", opened_at: iso(1), status: st }, "15m");
      expect(s.isActive).toBe(false);
      expect(s.badgeText).toBe("CLOSED SHORT");
    }
  });

  it("C. open but 2 days old => historical due to age expiry", () => {
    const s = deriveFalconerSignalState({ direction: "long", opened_at: iso(2880), status: "open" }, "15m");
    expect(s.isOpenFalconerSignal).toBe(true);
    expect(s.ageExpired).toBe(true);
    expect(s.isActive).toBe(false);
    expect(s.badgeText).toBe("HISTORICAL LONG");
  });

  it("D. no row => NO SIGNAL with no fabricated timestamp", () => {
    const s = deriveFalconerSignalState(null, "15m");
    expect(s.hasSignal).toBe(false);
    expect(s.badgeText).toBe("NO SIGNAL");
    expect(s.status).toBeNull();
    expect(s.closedMeta).toBeNull();
    expect(s.isActive).toBe(false);
  });

  it("no closed_at => no closed metadata", () => {
    const s = deriveFalconerSignalState({ direction: "long", opened_at: iso(5), status: "open" }, "15m");
    expect(s.closedMeta).toBeNull();
  });
});
