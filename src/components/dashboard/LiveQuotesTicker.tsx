import { useState, useEffect, useRef } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    const interval = setInterval(fetchQuotes, 30_000); // refresh every 30s
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

  // Duplicate for seamless loop
  const tickerItems = [...quotes, ...quotes];

  return (
    <div style={{
      width: "100%", height: 32, overflow: "hidden",
      background: C.bg2,
      borderBottom: `1px solid ${C.border}`,
      position: "relative",
    }}>
      <div
        ref={scrollRef}
        style={{
          display: "flex", alignItems: "center", height: "100%",
          animation: `ticker-scroll ${quotes.length * 3}s linear infinite`,
          whiteSpace: "nowrap",
        }}
      >
        {tickerItems.map((q, i) => {
          const isUp = q.change >= 0;
          const color = isUp ? "#22C55E" : "#EF4444";
          const arrow = isUp ? "▲" : "▼";
          const decimals = q.symbol.includes("JPY") ? 3 : q.symbol.includes("XAU") ? 2 : 5;

          return (
            <div key={`${q.symbol}-${i}`} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "0 20px",
              flexShrink: 0,
            }}>
              {/* Delimiter dot */}
              {i > 0 && (
                <span style={{ color: C.jade, fontSize: 8, marginRight: 8 }}>●</span>
              )}
              {/* Symbol */}
              <span style={{
                color: C.sec, fontSize: 12, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                {q.symbol}
              </span>
              {/* Price */}
              <span style={{
                color: C.text, fontSize: 12, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {q.price.toFixed(decimals)}
              </span>
              {/* Arrow */}
              <span style={{ color, fontSize: 9 }}>{arrow}</span>
              {/* Change */}
              <span style={{
                color, fontSize: 11, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {isUp ? "+" : ""}{q.change.toFixed(decimals)}
              </span>
              {/* Change % */}
              <span style={{
                color, fontSize: 11, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {isUp ? "+" : ""}{q.changePercent.toFixed(2)}%
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
