import { MapPin } from "lucide-react";
import {
  buildRonChartAnnotationDisplaysFromFeaturesV1,
  type RonChartAnnotationDisplayV1,
} from "@/lib/ron-chart-annotations";

interface Props {
  features: unknown;
  /** Genuine active quote only. Omit rather than substitute a snapshot close. */
  currentPrice?: number | null;
}

const DIRECTION_CLASS: Record<RonChartAnnotationDisplayV1["direction"], string> = {
  bullish: "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]",
  bearish: "text-red-400 border-red-500/25 bg-red-500/[0.06]",
  contextual: "text-amber-300 border-amber-500/20 bg-amber-500/[0.05]",
  neutral: "text-muted-foreground border-border bg-background/40",
};

/**
 * RON evidence beside the chart. This component never draws over the TradingView iframe.
 * It only renders exact persisted geometry / provenance already validated by the V1
 * annotation contract. When no annotations exist it renders nothing, preserving the
 * current support/resistance fallback elsewhere in the rail.
 */
export default function RonChartAnnotationsPanel({ features, currentPrice = null }: Props) {
  const rows = buildRonChartAnnotationDisplaysFromFeaturesV1(features, currentPrice);
  if (rows.length === 0) return null;

  return (
    <section data-testid="ron-chart-annotations">
      <div className="flex items-center gap-1.5 mb-1.5">
        <MapPin size={12} className="text-muted-foreground/80" aria-hidden />
        <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
          RON levels & zones
        </div>
      </div>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground/75 mb-2">
        Exact RON price geometry beside the chart. These objects are not drawn over the TradingView iframe.
      </p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`rounded border px-2.5 py-2 ${DIRECTION_CLASS[row.direction]}`}
            data-testid={`ron-chart-annotation-${row.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10.5px] uppercase tracking-wide opacity-80">
                  {row.title}
                </div>
                <div className="font-mono text-[12.5px] font-semibold text-foreground mt-0.5">
                  {row.primary}
                </div>
              </div>
              <span className="text-[9.5px] uppercase tracking-wide opacity-70 shrink-0">
                {row.lifecycle}
              </span>
            </div>
            <div className="mt-1.5 space-y-0.5 text-[10.5px] text-muted-foreground">
              <div>{row.originLabel}</div>
              {(row.lastTestLabel || row.retestLabel) && (
                <div>{[row.lastTestLabel, row.retestLabel].filter(Boolean).join(" · ")}</div>
              )}
              {row.liveDistanceLabel && <div>{row.liveDistanceLabel}</div>}
              <div>{row.sourceLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
