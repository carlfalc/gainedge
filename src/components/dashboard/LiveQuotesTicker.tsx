import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";

interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

export default function LiveQuotesTicker() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    let mounted = true;

    const fetchQuotes = async () => {
      try {
        await supabase.auth.refreshSession();
        const { data, error } = await supabase.functions.invoke("forex-ticker");
        if (!error && data?.quotes?.length && mounted) {
          setQuotes(data.quotes);
        }
      } catch (e) {
        console.warn("Ticker fetch failed:", e);
      }
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (quotes.length === 0) {
    return (
      <div style={{
        width: "100%", height: 32,
        background: C.bg2,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ color: C.muted, fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
          Loading live quotes…
        </span>
      </div>
    );
  }

  const tickerItems = [...quotes, ...quotes];
  const duration = Math.max(quotes.length * 4, 30);

  return (
    <div style={{
      width: "100%", height: 32, overflow: "hidden",
      background: C.bg2,
      borderBottom: `1px solid ${C.border}`,
      position: "relative",
    }}>
      <div style={{
        display: "flex", alignItems: "center", height: "100%",
        animation: `ticker-scroll ${duration}s linear infinite`,
        whiteSpace: "nowrap",
        willChange: "transform",
      }}>
        {tickerItems.map((q, i) => {
          const isUp = q.change > 0;
          const isDown = q.change < 0;
          const color = isUp ? "#22C55E" : isDown ? "#EF4444" : C.sec;
          const arrow = isUp ? "▲" : isDown ? "▼" : "–";
          const decimals = q.symbol.includes("JPY") ? 3 : q.symbol.includes("XAU") ? 2 : 5;

          return (
            <div key={`${q.symbol}-${i}`} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "0 16px",
              flexShrink: 0,
            }}>
              {i > 0 && (
                <span style={{ color: C.jade, fontSize: 6, marginRight: 10 }}>●</span>
              )}
              <span style={{
                color: "#94A3B8", fontSize: 12, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {q.symbol}
              </span>
              <span style={{
                color: "#E2E8F0", fontSize: 12, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {q.price.toFixed(decimals)}
              </span>
              <span style={{ color, fontSize: 9 }}>{arrow}</span>
              <span style={{
                color, fontSize: 11, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {q.change !== 0
                  ? `${isUp ? "+" : ""}${q.change.toFixed(decimals)}`
                  : "0.00"
                }
              </span>
              <span style={{
                color, fontSize: 11, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {q.changePercent !== 0
                  ? `${isUp ? "+" : ""}${q.changePercent.toFixed(2)}%`
                  : "0.00%"
                }
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
