import { describe, expect, it } from "vitest";
import {
  auditCandles,
  candidateGrid,
  runStrategyLab,
  type LabCandle,
} from "../../supabase/functions/_shared/strategy-lab-engine";

function candles(count = 3_000): LabCandle[] {
  const rows: LabCandle[] = [];
  let close = 2_000;
  for (let i = 0; i < count; i += 1) {
    const drift = i % 360 < 180 ? 0.7 : -0.45;
    const wave = Math.sin(i / 9) * 2.2;
    const open = close;
    close = Math.max(100, open + drift + wave * 0.15);
    rows.push({
      time: 1_700_000_000_000 + i * 900_000,
      open,
      high: Math.max(open, close) + 1.4 + Math.abs(wave) * 0.2,
      low: Math.min(open, close) - 1.4 - Math.abs(wave) * 0.2,
      close,
      volume: 100 + (i % 37) * 4,
    });
  }
  return rows;
}

describe("Strategy Lab V1 deterministic research engine", () => {
  it("audits genuine ordered OHLC rows and reports the sample warning truthfully", () => {
    const audit = auditCandles(candles());
    expect(audit.sourceGatePassed).toBe(true);
    expect(audit.candleCount).toBe(3_000);
    expect(audit.recommendedSampleReached).toBe(false);
    expect(audit.warnings).toContain("recommended_20000_candles_not_reached");
  });

  it("fails the source gate on duplicate and malformed candles", () => {
    const rows = candles(1_100);
    rows[10] = { ...rows[10], time: rows[9].time };
    rows[20] = { ...rows[20], low: rows[20].high + 1 };
    const audit = auditCandles(rows);
    expect(audit.sourceGatePassed).toBe(false);
    expect(audit.duplicateTimestamps).toBe(1);
    expect(audit.invalidOhlcRows).toBe(1);
  });

  it("tests 21 bounded candidates and can never enable execution", () => {
    expect(candidateGrid()).toHaveLength(21);
    const result = runStrategyLab(candles());
    expect(result.executionAllowed).toBe(false);
    expect(result.agentRuns).toHaveLength(8);
    expect(result.candidates).toHaveLength(21);
    expect(result.champion?.rank).toBe(1);
    expect(result.candidates.filter((candidate) => candidate.selected)).toHaveLength(1);
  });

  it("selects on validation data only; changing the holdout cannot change the champion", () => {
    const original = candles();
    const first = runStrategyLab(original);
    const changedHoldout = original.map((candle, index) => {
      if (index < Math.floor(original.length * 0.8)) return candle;
      const shift = Math.sin(index) * 40;
      const open = candle.open + shift;
      const close = candle.close - shift;
      return {
        ...candle,
        open,
        close,
        high: Math.max(open, close) + 5,
        low: Math.min(open, close) - 5,
      };
    });
    const second = runStrategyLab(changedHoldout);
    expect(second.champion?.candidate.id).toBe(first.champion?.candidate.id);
    expect(second.champion?.validationScore).toBe(first.champion?.validationScore);
  });

  it("uses conservative stop-first handling when stop and target share an OHLC bar", () => {
    const source = runStrategyLab(candles());
    for (const trade of source.championTrades) {
      if (trade.exitReason === "stop") expect(trade.resultR).toBeLessThan(-1);
    }
  });
});
