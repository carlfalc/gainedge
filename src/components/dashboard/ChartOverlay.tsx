import type { Position } from "@/components/dashboard/TradeExecutionPanel";

// Legacy ChartOverlay — RON signal/pattern overlays were removed in the Falconer wipe.
// Only renders the active position P&L badge now.
interface Props { symbol: string; userId: string | undefined; positions: Position[] }

export default function ChartOverlay({ symbol, positions }: Props) {
  const filtered = positions.filter(p => p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase()));
  const active = filtered[0];
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
      <div
        className="absolute top-3 right-3 pointer-events-auto"
        style={{
          background: active.profit >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          backdropFilter: "blur(12px)",
          border: `1px solid ${active.profit >= 0 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
          borderRadius: 8, padding: "8px 12px",
        }}
      >
        <div className="flex items-center gap-2 text-[11px]">
          <span>{active.profit >= 0 ? "🟢" : "🔴"}</span>
          <span className="font-bold text-foreground">
            {active.type?.toLowerCase().includes("buy") ? "BUY" : "SELL"} {symbol}
          </span>
        </div>
        <div className="text-[11px] font-mono font-bold mt-0.5" style={{ color: active.profit >= 0 ? "#22C55E" : "#EF4444" }}>
          {active.profit >= 0 ? "+" : ""}${active.profit.toFixed(2)}
        </div>
      </div>
    </div>
  );
}