import { Loader2, TrendingUp, TrendingDown, X as XIcon } from "lucide-react";
import type { Position } from "@/components/dashboard/TradeExecutionPanel";

interface ActiveTradeBarProps {
  symbol: string;
  positions: Position[];
  onClosePosition: (positionId: string) => void;
  closingId: string | null;
}

export default function ActiveTradeBar({ symbol, positions, onClosePosition, closingId }: ActiveTradeBarProps) {
  const filtered = positions.filter(
    (p) => p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase())
  );

  if (filtered.length === 0) return null;

  const priceDec = symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5;

  return (
    <div className="flex flex-wrap gap-1.5 mx-1 mb-1">
      {filtered.map((pos) => {
        const isBuy = pos.type?.toLowerCase().includes("buy");
        const pnlColor = pos.profit >= 0 ? "#22C55E" : "#EF4444";
        return (
          <div key={pos.id} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-[11px]">
            {isBuy ? <TrendingUp size={11} style={{ color: "#22C55E" }} /> : <TrendingDown size={11} style={{ color: "#EF4444" }} />}
            <span className="font-bold" style={{ color: isBuy ? "#22C55E" : "#EF4444" }}>
              {isBuy ? "BUY" : "SELL"} {pos.volume}
            </span>
            <span className="text-muted-foreground">Entry</span>
            <span className="font-mono font-bold text-foreground">{pos.openPrice.toFixed(priceDec)}</span>
            <span className="text-muted-foreground">P&L</span>
            <span className="font-mono font-bold" style={{ color: pnlColor }}>
              ${pos.profit.toFixed(2)}
            </span>
            <button
              onClick={() => onClosePosition(pos.id)}
              disabled={closingId === pos.id}
              className="ml-1 px-2 py-0.5 rounded text-[9px] font-bold bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors disabled:opacity-50"
            >
              {closingId === pos.id ? <Loader2 size={10} className="animate-spin" /> : "CLOSE"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
