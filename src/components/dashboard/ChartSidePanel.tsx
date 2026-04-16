import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Zap, TrendingUp, TrendingDown, Loader2, Brain, Mic } from "lucide-react";
import type { Position } from "@/components/dashboard/TradeExecutionPanel";
import AskRonModal from "@/components/dashboard/AskRonModal";
import RonVersionSelector, { type RonVersion } from "@/components/dashboard/RonVersionSelector";

interface Signal {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  take_profit: number;
  stop_loss: number;
  confidence: number;
  created_at: string;
}

interface ChartSidePanelProps {
  symbol: string;
  userId: string | undefined;
  accountId: string | null;
  positions: Position[];
  onClosePosition: (positionId: string) => void;
  closingId: string | null;
  onVersionChange?: (version: RonVersion) => void;
}

export default function ChartSidePanel({ symbol, userId, accountId, positions, onClosePosition, closingId, onVersionChange }: ChartSidePanelProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [ronOpen, setRonOpen] = useState(false);

  const priceDec = symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5;

  useEffect(() => {
    if (!userId || !symbol) return;
    supabase
      .from("signals")
      .select("id, symbol, direction, entry_price, take_profit, stop_loss, confidence, created_at")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .eq("result", "pending")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setSignals(data as Signal[]);
      });
  }, [userId, symbol]);

  const filteredPositions = positions.filter(
    (p) => p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase())
  );

  return (
    <div className="flex flex-col h-full bg-card border-l border-border overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* RON Version Selector */}
        <RonVersionSelector userId={userId} onVersionChange={onVersionChange} />

        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} style={{ color: "#00CFA5" }} />
            <span className="text-xs font-bold tracking-wider uppercase" style={{ color: "#00CFA5" }}>
              RON Active Signals
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">({signals.length})</span>
          </div>
          {signals.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">No active signals for {symbol}</p>
          ) : (
            <div className="space-y-2.5">
              {signals.map((sig) => {
                const dirColor = sig.direction === "BUY" ? "#22C55E" : "#EF4444";
                return (
                  <div key={sig.id} className="p-2.5 rounded-lg bg-background/50 border border-border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold" style={{ color: dirColor }}>{sig.direction}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">Conf: {sig.confidence}/10</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground block mb-0.5">Entry</span>
                        <div className="font-mono font-bold text-foreground">{sig.entry_price.toFixed(priceDec)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">TP</span>
                        <div className="font-mono font-semibold" style={{ color: "#4ADE80" }}>{sig.take_profit.toFixed(priceDec)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">SL</span>
                        <div className="font-mono font-semibold" style={{ color: "#EF4444" }}>{sig.stop_loss.toFixed(priceDec)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Open Positions */}
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold tracking-wider uppercase text-foreground">
              Open Positions
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">({filteredPositions.length})</span>
          </div>
          {filteredPositions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">No open positions for {symbol}</p>
          ) : (
            <div className="space-y-2.5">
              {filteredPositions.map((pos) => {
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
                        <div className="font-mono font-bold" style={{ color: pnlColor }}>
                          ${pos.profit.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Ask RON — pinned at bottom */}
      <div className="p-4 border-t border-border shrink-0">
        <button
          onClick={() => setRonOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-xs font-bold transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(0,207,165,0.15) 0%, rgba(14,165,233,0.15) 100%)",
            border: "1px solid rgba(0,207,165,0.3)",
            color: "#00CFA5",
          }}
        >
          <Brain size={14} />
          Ask RON
          <Mic size={12} style={{ opacity: 0.7 }} />
        </button>
        <div className="mt-2 text-center">
          <span className="text-[10px] font-medium" style={{ color: "#00CFA5" }}>Powered by RON</span>
        </div>
      </div>

      <AskRonModal
        open={ronOpen}
        onClose={() => setRonOpen(false)}
        context={{ page: "TradingView Chart", instrument: symbol, userId }}
      />
    </div>
  );
}
