import { describe, it, expect } from "vitest";
import {
  HOLIDAY_RULES, RON_VENUE_CALENDAR_VERSION, closedReasonHistogram, expectedClosedReason,
  expectedOpen, expectedOpenMinutes, holidayMap, nyClock, venueCalendarPayload,
} from "../../supabase/functions/_shared/ron-venue-calendar.ts";
import {
  DEFECT_MIN_EXPECTED_OPEN_MINUTES, SPLIT_MIN_EXPECTED_OPEN_MINUTES,
  analyseContinuity, continuityContractPayload,
} from "../../supabase/functions/_shared/ron-research-v3";

const ms = (s: string) => new Date(s).getTime();

describe("Phase 2D.1f — XAUUSD venue calendar v1", () => {
  it("keeps the accepted base weekly schedule", () => {
    expect(RON_VENUE_CALENDAR_VERSION).toBe(1);
    expect(expectedOpen(ms("2026-06-10T14:00:00Z"))).toBe(true);        // Wed London/NY
    expect(expectedOpen(ms("2026-06-13T14:00:00Z"))).toBe(false);       // Saturday
    expect(expectedClosedReason(ms("2026-06-10T21:30:00Z")))
      .toBe("daily_break_1700_1800_ny");                                // 17:00-18:00 NY break
    expect(expectedClosedReason(ms("2026-06-13T14:00:00Z")))
      .toBe("weekly_closure_fri1700_sun1700_ny");
  });

  it("resolves the 2026 observed holiday dates deterministically", () => {
    const y = holidayMap(2026);
    const codes = (m: number, d: number) => y.get(`2026-${m}-${d}`)?.code ?? null;
    expect(codes(5, 25)).toBe("memorial_day");        // last Monday of May
    expect(codes(6, 19)).toBe("juneteenth");          // Friday, no shift
    expect(codes(7, 3)).toBe("independence_day");     // Jul 4 is a Saturday -> observed Fri
    expect(codes(4, 3)).toBe("good_friday");          // Easter Sunday 2026 = Apr 5
    expect(HOLIDAY_RULES.length).toBe(13);
  });

  it("closes the three 2026 US holidays found in 2D.1b at 13:00 NY", () => {
    for (const day of ["2026-05-25", "2026-06-19", "2026-07-03"]) {
      // 12:59 NY open, 13:00 NY closed, resumes 18:00 NY.
      expect(expectedOpen(ms(`${day}T16:59:00Z`))).toBe(true);
      expect(expectedOpen(ms(`${day}T17:00:00Z`))).toBe(false);
      expect(expectedClosedReason(ms(`${day}T18:00:00Z`))).toMatch(/early_close_1300$/);
      expect(expectedOpen(ms(`${day}T22:00:00Z`))).toBe(true);
    }
    // 13:00-17:00 NY = 240 expected-open minutes suppressed per holiday; x3 ~= the 714
    // missing minutes catalogued in Phase 2D.1b.
    const per = (day: string) => 240 - expectedOpenMinutes(ms(`${day}T17:00:00Z`), ms(`${day}T21:00:00Z`));
    expect(["2026-05-25", "2026-06-19", "2026-07-03"].map(per)).toEqual([240, 240, 240]);
  });

  it("treats the Easter 2026 closure as fully expected-closed", () => {
    // Genuine venue break: last bar Thu Apr 2 20:58Z -> resume Sun Apr 5 22:00Z (~73h02m).
    const missing = expectedOpenMinutes(ms("2026-04-02T20:59:00Z"), ms("2026-04-05T22:00:00Z"));
    expect(missing).toBe(1);                       // only the 16:59 NY minute before the break
    expect(missing).toBeLessThan(DEFECT_MIN_EXPECTED_OPEN_MINUTES);
    const reasons = closedReasonHistogram(ms("2026-04-03T00:00:00Z"), ms("2026-04-04T00:00:00Z"));
    expect(Object.keys(reasons).some((k) => k.startsWith("good_friday"))).toBe(true);
  });

  it("is DST-aware on both sides of the year", () => {
    expect(nyClock(new Date(ms("2026-01-14T22:00:00Z"))).minutes).toBe(17 * 60); // EST
    expect(nyClock(new Date(ms("2026-07-14T21:00:00Z"))).minutes).toBe(17 * 60); // EDT
  });

  it("hashes a stable, fully-enumerated contract payload", () => {
    const p = JSON.stringify(venueCalendarPayload());
    expect(p).toBe(JSON.stringify(venueCalendarPayload()));
    for (const h of HOLIDAY_RULES) expect(p).toContain(h.rule);
  });
});

describe("Phase 2D.1f — expected-open continuity contract", () => {
  it("declares an expected-open measure, not a wall-clock threshold", () => {
    const p = JSON.stringify(continuityContractPayload());
    expect(p).toContain("expected_open_venue_minutes_absent_from_accepted_source");
    expect(p).toContain('"wall_clock_threshold_used",false');
    expect(SPLIT_MIN_EXPECTED_OPEN_MINUTES).toBeGreaterThan(DEFECT_MIN_EXPECTED_OPEN_MINUTES);
  });

  it("does NOT split the Easter closure that Research V2 wrongly split", () => {
    const grid: number[] = [];
    for (let t = ms("2026-04-02T12:00:00Z"); t <= ms("2026-04-02T20:45:00Z"); t += 15 * 60_000) grid.push(t);
    for (let t = ms("2026-04-05T22:00:00Z"); t <= ms("2026-04-06T12:00:00Z"); t += 15 * 60_000) grid.push(t);
    const r = analyseContinuity(grid);
    expect(r.defects).toEqual([]);
    expect(r.splitting_defects).toBe(0);
    expect(r.epochs).toHaveLength(1);
    // ...even though the wall-clock gap comfortably exceeds V2's 72h rule.
    expect((grid[grid.length - 15] - ms("2026-04-02T20:45:00Z")) / 3_600_000).toBeGreaterThan(72);
  });

  it("does split a genuine multi-day absence of expected-open minutes", () => {
    const grid: number[] = [];
    for (let t = ms("2026-06-01T08:00:00Z"); t <= ms("2026-06-01T16:00:00Z"); t += 15 * 60_000) grid.push(t);
    for (let t = ms("2026-06-10T08:00:00Z"); t <= ms("2026-06-10T16:00:00Z"); t += 15 * 60_000) grid.push(t);
    const r = analyseContinuity(grid);
    expect(r.splitting_defects).toBe(1);
    expect(r.epochs).toHaveLength(2);
    expect(r.defects[0].missing_expected_open_minutes).toBeGreaterThan(SPLIT_MIN_EXPECTED_OPEN_MINUTES);
  });

  it("never flags an uninterrupted expected-open stretch", () => {
    const grid: number[] = [];
    for (let t = ms("2026-06-08T00:00:00Z"); t <= ms("2026-06-12T20:45:00Z"); t += 15 * 60_000) {
      if (expectedOpen(t)) grid.push(t);
    }
    expect(analyseContinuity(grid).defects).toEqual([]);
  });
});
