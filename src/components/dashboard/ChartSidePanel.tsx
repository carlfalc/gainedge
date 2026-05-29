import { TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import type { Position } from "@/components/dashboard/TradeExecutionPanel";
import type { RonVersion } from "@/components/dashboard/RonVersionSelector";

interface Props {
  symbol: string;
  userId: string | undefined;
  accountId: string | null;
  positions: Position[];
  onClosePosition: (positionId: string) => void;
  closingId: string | null;
  onVersionChange?: (version: RonVersion) => void;
}

export default function ChartSidePanel({ symbol, positions, onClosePosition, closingId }: Props) {
  const priceDec = symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5;
  const filtered = positions.filter(p => p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase()));

  return (
    <div className="flex flex-col h-full bg-card border-l border-border overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold tracking-wider uppercase" style={{ color: "#00CFA5" }}>
              Falconer v7 TP3
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground py-2">
            Strategy controls and live signals live on the{" "}
            <a href="/dashboard/strategy" className="text-[#00CFA5] hover:underline">Strategy page</a>.
          </p>
        </div>

        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold tracking-wider uppercase text-foreground">Open Positions</span>
            <span className="text-[10px] text-muted-foreground ml-auto">({filtered.length})</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">No open positions for {symbol}</p>
          ) : (
            <div className="space-y-2.5">
              {filtered.map(pos => {
                const isBuy = pos.type?.toLowerCase().includes("buy");
                const pnlColor = pos.profit >= 0 ? "#22C55E" : "#EF4444";
                return (
                  <div key={pos.id} className="p-2.5 rounded-lg bg-background/50 border border-border">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {isBuy ? <TrendingUp size={12} style={{ color: "#22C55E" }} /> : <TrendingDown size={12} style={{ color: "#EF4444" }} />}
                        <span className="text-xs font-bold" style={{ color: isBuy ? "#22C55E" : "#EF4444" }}>
                          {isBuy ? "BUY" : "SELL"} {pos.volume}
                        </span>
                      </div>
                      <button
                        onClick={() => onClosePosition(pos.id)}
                        disabled={closingId === pos.id}
                        className="px-2.5 py-1 rounded text-[9px] font-bold bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors disabled:opacity-50"
                      >
                        {closingId === pos.id ? <Loader2 size={10} className="animate-spin" /> : "CLOSE"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground block mb-0.5">Entry</span>
                        <div className="font-mono text-foreground">{pos.openPrice.toFixed(priceDec)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">P&L</span>
                        <div className="font-mono font-bold" style={{ color: pnlColor }}>${pos.profit.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}