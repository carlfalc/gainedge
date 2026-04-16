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

  const entryPips = Math.abs(signal.take_profit - signal.entry_price);
  const slPips = Math.abs(signal.entry_price - signal.stop_loss);
  const pipMul = symbol.includes("JPY") ? 100 : ["XAUUSD"].includes(symbol) ? 10 : 10000;

  return (
    <div className="relative mx-1 mt-1 animate-in slide-in-from-top-2 duration-300 z-10">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border"
        style={{
          background: "linear-gradient(135deg, rgba(0,207,165,0.08) 0%, rgba(14,165,233,0.08) 100%)",
          borderColor: "rgba(0,207,165,0.3)",
        }}>
        <Zap size={16} style={{ color: "#00CFA5" }} className="shrink-0" />
        <span className="text-xs font-bold" style={{ color: "#00CFA5" }}>🚨 RON Signal:</span>
        <span className="text-xs font-bold" style={{ color: dirColor }}>{signal.direction}</span>
        <span className="text-xs font-bold text-foreground">{signal.symbol}</span>
        <span className="text-[10px] text-muted-foreground">|</span>
        <span className="text-[10px] text-muted-foreground">Entry</span>
        <span className="text-xs font-mono font-bold text-foreground">{signal.entry_price.toFixed(priceDec)}</span>
        <span className="text-[10px] text-muted-foreground">|</span>
        <span className="text-[10px] text-muted-foreground">TP</span>
        <span className="text-xs font-mono" style={{ color: "#4ADE80" }}>
          {signal.take_profit.toFixed(priceDec)}
          <span className="text-[9px] ml-0.5">(+{(entryPips * pipMul).toFixed(1)}p)</span>
        </span>
        <span className="text-[10px] text-muted-foreground">|</span>
        <span className="text-[10px] text-muted-foreground">SL</span>
        <span className="text-xs font-mono" style={{ color: "#EF4444" }}>
          {signal.stop_loss.toFixed(priceDec)}
          <span className="text-[9px] ml-0.5">(-{(slPips * pipMul).toFixed(1)}p)</span>
        </span>
        <span className="text-[10px] text-muted-foreground">|</span>
        <span className="text-[10px] text-muted-foreground">Conf</span>
        <span className="text-xs font-mono font-bold" style={{ color: signal.confidence >= 7 ? "#22C55E" : "#F59E0B" }}>
          {signal.confidence}/10
        </span>
        <button
          onClick={() => setDismissed(signal.id)}
          className="ml-auto p-1 rounded hover:bg-white/10 transition-colors"
        >
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
