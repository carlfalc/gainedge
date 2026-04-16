import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Zap, TrendingUp, TrendingDown, Loader2, Brain, Mic } from "lucide-react";
import type { Position } from "@/components/dashboard/TradeExecutionPanel";
import AskRonModal from "@/components/dashboard/AskRonModal";

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
}

export default function ChartSidePanel({ symbol, userId, accountId, positions, onClosePosition, closingId }: ChartSidePanelProps) {
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
    <div className="flex flex-col h-full bg-card border-l border-border overflow-y-auto">
      {/* RON Active Signals */}
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={12} style={{ color: "#00CFA5" }} />
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "#00CFA5" }}>
            RON Active Signals
          </span>
        </div>
        {signals.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No active signals for {symbol}</p>
        ) : (
          <div className="space-y-2">
            {signals.map((sig) => {
              const dirColor = sig.direction === "BUY" ? "#22C55E" : "#EF4444";
              return (
                <div key={sig.id} className="p-2 rounded bg-background/50 border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold" style={{ color: dirColor }}>{sig.direction}</span>
                    <span className="text-[10px] text-muted-foreground">Conf: {sig.confidence}/10</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <div>
                      <span className="text-muted-foreground">Entry</span>
                      <div className="font-mono font-bold text-foreground">{sig.entry_price.toFixed(priceDec)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">TP</span>
                      <div className="font-mono" style={{ color: "#4ADE80" }}>{sig.take_profit.toFixed(priceDec)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">SL</span>
                      <div className="font-mono" style={{ color: "#EF4444" }}>{sig.stop_loss.toFixed(priceDec)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Open Positions */}
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-bold tracking-wider uppercase text-foreground">
            Open Positions
          </span>
          <span className="text-[10px] text-muted-foreground">({filteredPositions.length})</span>
        </div>
        {filteredPositions.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No open positions for {symbol}</p>
        ) : (
          <div className="space-y-2">
            {filteredPositions.map((pos) => {
              const isBuy = pos.type?.toLowerCase().includes("buy");
              const pnlColor = pos.profit >= 0 ? "#22C55E" : "#EF4444";
              return (
                <div key={pos.id} className="p-2 rounded bg-background/50 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {isBuy ? <TrendingUp size={11} style={{ color: "#22C55E" }} /> : <TrendingDown size={11} style={{ color: "#EF4444" }} />}
                      <span className="text-[11px] font-bold" style={{ color: isBuy ? "#22C55E" : "#EF4444" }}>
                        {isBuy ? "BUY" : "SELL"} {pos.volume}
                      </span>
                    </div>
                    <button
                      onClick={() => onClosePosition(pos.id)}
                      disabled={closingId === pos.id}
                      className="px-2 py-0.5 rounded text-[9px] font-bold bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors disabled:opacity-50"
                    >
                      {closingId === pos.id ? <Loader2 size={10} className="animate-spin" /> : "CLOSE"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <div>
                      <span className="text-muted-foreground">Entry</span>
                      <div className="font-mono text-foreground">{pos.openPrice.toFixed(priceDec)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">P&L</span>
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

      {/* Ask RON mini */}
      <div className="p-3 flex-1 flex flex-col">
        <button
          onClick={() => setRonOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[11px] font-bold transition-all"
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
        <div className="mt-auto pt-3 text-center">
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
