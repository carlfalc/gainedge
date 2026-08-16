/**
 * States whether the accepted XAUUSD 15m calibration evidence scope applies to
 * this exact instrument + timeframe. Never claims "Calibrated", never shows a
 * percentage, confidence, edge or expected-performance language.
 */
import { C } from "@/lib/mock-data";
import { presentCalibrationScope } from "@/lib/market-provenance-presentation";

interface Props {
  symbol: string | null | undefined;
  timeframe: string | null | undefined;
  /** Compact mode drops the secondary line onto the tooltip only. */
  compact?: boolean;
}

export default function CalibrationScopeBadge({ symbol, timeframe, compact = false }: Props) {
  const scope = presentCalibrationScope(symbol, timeframe);
  const tone = scope.inScope ? C.blue : C.sec;

  return (
    <span
      className="inline-flex max-w-full flex-col items-start gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] leading-tight break-words"
      style={{ background: `${tone}14`, color: tone }}
      data-testid="calibration-scope-badge"
      title={`${scope.label} — ${scope.secondary}`}
    >
      <span className="font-semibold">{scope.label}</span>
      {!compact && (
        <span className="opacity-80" data-testid="calibration-scope-secondary">
          {scope.secondary}
        </span>
      )}
    </span>
  );
}
