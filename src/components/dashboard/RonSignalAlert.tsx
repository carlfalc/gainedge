import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Zap } from "lucide-react";

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

interface RonSignalAlertProps {
  symbol: string;
  userId: string | undefined;
}

export default function RonSignalAlert({ symbol, userId }: RonSignalAlertProps) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !symbol) return;
    supabase
      .from("signals")
      .select("id, symbol, direction, entry_price, take_profit, stop_loss, confidence, created_at")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .eq("result", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0 && data[0].id !== dismissed) {
          setSignal(data[0] as Signal);
        } else {
          setSignal(null);
        }
      });
  }, [userId, symbol, dismissed]);

  if (!signal) return null;

  const dirColor = signal.direction === "BUY" ? "#22C55E" : "#EF4444";
  const priceDec = symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-card border border-border rounded-lg mx-1 mt-1 animate-in slide-in-from-top-2 duration-300">
      <Zap size={14} style={{ color: "#00CFA5" }} />
      <span className="text-[11px] font-bold" style={{ color: "#00CFA5" }}>RON Signal:</span>
      <span className="text-[11px] font-bold text-foreground">{signal.symbol}</span>
      <span className="text-[11px] font-bold" style={{ color: dirColor }}>{signal.direction}</span>
      <span className="text-[11px] text-muted-foreground">at</span>
      <span className="text-[11px] font-mono font-bold text-foreground">{signal.entry_price.toFixed(priceDec)}</span>
      <span className="text-[10px] text-muted-foreground">|</span>
      <span className="text-[10px] text-muted-foreground">TP</span>
      <span className="text-[11px] font-mono text-foreground">{signal.take_profit.toFixed(priceDec)}</span>
      <span className="text-[10px] text-muted-foreground">|</span>
      <span className="text-[10px] text-muted-foreground">SL</span>
      <span className="text-[11px] font-mono text-foreground">{signal.stop_loss.toFixed(priceDec)}</span>
      <span className="text-[10px] text-muted-foreground">|</span>
      <span className="text-[10px] text-muted-foreground">Conf</span>
      <span className="text-[11px] font-mono font-bold" style={{ color: signal.confidence >= 7 ? "#22C55E" : "#F59E0B" }}>
        {signal.confidence}
      </span>
      <button
        onClick={() => setDismissed(signal.id)}
        className="ml-auto p-0.5 rounded hover:bg-white/10 transition-colors"
      >
        <X size={12} className="text-muted-foreground" />
      </button>
    </div>
  );
}
