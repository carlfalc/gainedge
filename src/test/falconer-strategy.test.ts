import { describe, expect, it } from "vitest";
import {
  buildPineConnectorBreakeven,
  buildPineConnectorClose,
  buildPineConnectorEntry,
  buildPosition,
  DEFAULT_CONFIG,
} from "../../supabase/functions/_shared/falconer-strategy";
import { analyseBullishPatterns } from "../../supabase/functions/_shared/pattern-analysis";

describe("Falconer v7 TP3 position construction", () => {
  it("splits risk 33/33/34 and calculates 1.5R/3R/5R targets", () => {
    const position = buildPosition(100, 90, "tpLong", 1_700_000_000_000, DEFAULT_CONFIG);

    expect(position.tp1).toBe(115);
    expect(position.tp2).toBe(130);
    expect(position.tp3).toBe(150);
    expect(position.beLevel).toBe(110);
    // Pine: qty = max(riskUSD / (riskD * dpu), 1.0) with dpu = 1 → 200/10 = 20 contracts.
    expect(position.qty).toBe(20);
    expect(position.qty1).toBeCloseTo(6.6);
    expect(position.qty2).toBeCloseTo(6.6);
    expect(position.qty3).toBeCloseTo(6.8);
    // documented broker conversion: lots = qty * dpu / pipValuePerLot (gold 100)
    expect(position.lots).toBeCloseTo(0.2);
  });

  it("emits the exact PineConnector contract", () => {
    const position = buildPosition(100, 90, "sqzUp", 1_700_000_000_000, DEFAULT_CONFIG);
    expect(buildPineConnectorEntry("12345", "XAUUSD.a", position, 0.5, DEFAULT_CONFIG))
      .toBe("12345,buy,XAUUSD.a,risk=0.5,sl=90.00,tp1=115.00,tp1size=33,tp2=130.00,tp2size=33,tp3=150.00,tp3size=34,comment=v7TP3_entry");
    expect(buildPineConnectorBreakeven("12345", "XAUUSD.a"))
      .toBe("12345,breakeven,XAUUSD.a,comment=v7TP3_BE");
    expect(buildPineConnectorClose("12345", "XAUUSD.a"))
      .toBe("12345,closelong,XAUUSD.a,comment=v7TP3_HAflip");
  });

  it("uses patterns as evidence without changing the Falconer position contract", () => {
    const candles = Array.from({ length: 25 }, (_, index) => ({
      time: index * 900_000,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100.5 + index,
    }));
    candles[23] = { ...candles[23], open: 124, close: 123, high: 124.5, low: 122.5 };
    candles[24] = { ...candles[24], open: 122.5, close: 125, high: 125.5, low: 122 };
    expect(analyseBullishPatterns(candles).names).toContain("bullish_engulfing");
  });
});
