import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentPrice } from "@/services/metaapi-client";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Position {
  ticket: string;
  symbol: string;
  type: string;
  openPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  volume: number;
}

interface ActiveTradeInfoProps {
  symbol: string;
  accountId: string | null;
}

export default function ActiveTradeInfo({ symbol, accountId }: ActiveTradeInfoProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const priceDec = symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5;

  useEffect(() => {
    if (!accountId || !symbol) return;

    const fetchPositions = async () => {
      try {
        await supabase.auth.refreshSession();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await supabase.functions.invoke("metaapi-trade", {
          body: { action: "positions", accountId },
        });
        if (res.data?.positions) {
          const matched = (res.data.positions as Position[]).filter(
            (p) => p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase())
          );
          setPositions(matched);
        }
      } catch {
        // silent
      }
    };

    const fetchPrice = async () => {
      try {
        const price = await fetchCurrentPrice(symbol);
        if (price) setCurrentPrice(price);
      } catch {
        // silent
      }
    };

    fetchPositions();
    fetchPrice();
    intervalRef.current = setInterval(() => {
      fetchPositions();
      fetchPrice();
    }, 10000);

    return () => clearInterval(intervalRef.current);
  }, [accountId, symbol]);

  if (positions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1 mt-1">
      {positions.map((pos) => {
        const isBuy = pos.type?.toLowerCase().includes("buy");
        const pnlPips = currentPrice
          ? isBuy
            ? (currentPrice - pos.openPrice) * (symbol.includes("JPY") ? 100 : 10000)
            : (pos.openPrice - currentPrice) * (symbol.includes("JPY") ? 100 : 10000)
          : null;
        const pnlColor = pnlPips === null ? "#888" : pnlPips >= 0 ? "#22C55E" : "#EF4444";

        return (
          <div
            key={pos.ticket}
            className="flex items-center gap-3 px-3 py-1.5 bg-card border border-border rounded-lg text-[11px]"
          >
            {isBuy ? (
              <TrendingUp size={12} style={{ color: "#22C55E" }} />
            ) : (
              <TrendingDown size={12} style={{ color: "#EF4444" }} />
            )}
            <span className="font-bold" style={{ color: isBuy ? "#22C55E" : "#EF4444" }}>
              {isBuy ? "BUY" : "SELL"} {pos.volume}
            </span>
            <span className="text-muted-foreground">Entry</span>
            <span className="font-mono font-bold text-foreground">{pos.openPrice.toFixed(priceDec)}</span>
            {pos.takeProfit ? (
              <>
                <span className="text-muted-foreground">TP</span>
                <span className="font-mono text-foreground">{pos.takeProfit.toFixed(priceDec)}</span>
              </>
            ) : null}
            {pos.stopLoss ? (
              <>
                <span className="text-muted-foreground">SL</span>
                <span className="font-mono text-foreground">{pos.stopLoss.toFixed(priceDec)}</span>
              </>
            ) : null}
            {pnlPips !== null && (
              <>
                <span className="text-muted-foreground">P&L</span>
                <span className="font-mono font-bold" style={{ color: pnlColor }}>
                  {pnlPips >= 0 ? "+" : ""}{pnlPips.toFixed(1)} pips
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
