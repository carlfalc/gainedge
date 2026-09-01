import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  buildChartLevelMarks,
  LEVEL_OVERLAY_NOTE,
  type ChartLevelKind,
} from "@/lib/chart-levels";

interface Props {
  symbol: string;
  patterns: unknown;
  features: unknown;
}

const KIND_STYLE: Record<ChartLevelKind, { color: string; border: string; bg: string }> = {
  support: { color: "#00CFA5", border: "rgba(0,207,165,0.45)", bg: "rgba(0,207,165,0.10)" },
  resistance: { color: "#FF4D4D", border: "rgba(255,77,77,0.45)", bg: "rgba(255,77,77,0.10)" },
  pivot: { color: "#FFFFFF", border: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.10)" },
};

/**
 * Auto-loading level markup over the Charts iframe.
 * Support (jade), Resistance (red) and Pivot (white) prices from the current RON
 * snapshot are shown the moment a chart opens. Because TradingView runs in an iframe
 * we render exact price rows rather than fabricated pixel-aligned lines. Pivots are
 * RON's own traditional levels from the last completed session — no third-party study.
 */
export default function ChartLevelsOverlay({ symbol, patterns, features }: Props) {
  const [open, setOpen] = useState(true);
  const marks = buildChartLevelMarks(symbol, patterns, features);
  if (marks.length === 0) return null;

  return (
    <div className="absolute top-3 left-3 z-[16] pointer-events-none" data-testid="chart-levels-overlay">
      <div
        className="pointer-events-auto rounded-lg border border-white/15 backdrop-blur-md"
        style={{ background: "rgba(10,14,22,0.78)", width: open ? 208 : "auto" }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
          data-testid="chart-levels-toggle"
        >
          <span>Levels & pivots</span>
          {open ? <EyeOff className="w-3 h-3 opacity-70" /> : <Eye className="w-3 h-3 opacity-70" />}
        </button>

        {open && (
          <div className="px-2 pb-2 space-y-1">
            {marks.map((m) => {
              const s = KIND_STYLE[m.kind];
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded px-1.5 py-1 border"
                  style={{ borderColor: s.border, background: s.bg }}
                  title={m.source}
                  data-testid={`chart-level-${m.id}`}
                >
                  <span
                    className="shrink-0"
                    style={{
                      width: 18,
                      borderTop: `2px ${m.kind === "pivot" ? "dotted" : "dashed"} ${s.color}`,
                    }}
                  />
                  <span
                    className="text-[10px] uppercase tracking-wide font-bold shrink-0"
                    style={{ color: s.color }}
                  >
                    {m.label}
                  </span>
                  <span className="ml-auto font-mono text-[11.5px] font-bold" style={{ color: s.color }}>
                    {m.priceText}
                  </span>
                </div>
              );
            })}
            <p className="text-[9.5px] leading-snug text-white/55 pt-0.5">{LEVEL_OVERLAY_NOTE}</p>
          </div>
        )}
      </div>
    </div>
  );
}
