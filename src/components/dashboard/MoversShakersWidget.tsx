import { useState } from "react";
import { C } from "@/lib/mock-data";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Mover {
  symbol: string;
  displayName: string;
  change: number;
  price: string;
}

const GAINERS: Mover[] = [
  { symbol: "XAU/XAG", displayName: "XAU/XAG", change: 0.57, price: "61.097" },
  { symbol: "NOK/ILS", displayName: "NOK/ILS", change: 0.28, price: "0.3194" },
  { symbol: "XAU/USD", displayName: "Gold", change: 0.24, price: "3,241.50" },
  { symbol: "EUR/NZD", displayName: "EUR/NZD", change: 0.21, price: "1.9142" },
  { symbol: "GBP/NZD", displayName: "GBP/NZD", change: 0.19, price: "2.2371" },
  { symbol: "EUR/AUD", displayName: "EUR/AUD", change: 0.17, price: "1.7685" },
  { symbol: "XAU/EUR", displayName: "XAU/EUR", change: 0.15, price: "2,854.20" },
  { symbol: "GBP/AUD", displayName: "GBP/AUD", change: 0.14, price: "2.0653" },
  { symbol: "CHF/JPY", displayName: "CHF/JPY", change: 0.12, price: "173.42" },
  { symbol: "EUR/JPY", displayName: "EUR/JPY", change: 0.10, price: "162.18" },
];

const LOSERS: Mover[] = [
  { symbol: "NZD/CHF", displayName: "NZD/CHF", change: -0.31, price: "0.4982" },
  { symbol: "NZD/CAD", displayName: "NZD/CAD", change: -0.27, price: "0.8214" },
  { symbol: "AUD/CHF", displayName: "AUD/CHF", change: -0.22, price: "0.5297" },
  { symbol: "NZD/USD", displayName: "NZD/USD", change: -0.18, price: "0.5912" },
  { symbol: "AUD/CAD", displayName: "AUD/CAD", change: -0.16, price: "0.8731" },
  { symbol: "AUD/USD", displayName: "AUD/USD", change: -0.14, price: "0.6354" },
  { symbol: "GBP/CHF", displayName: "GBP/CHF", change: -0.11, price: "1.0994" },
  { symbol: "USD/JPY", displayName: "USD/JPY", change: -0.09, price: "142.35" },
  { symbol: "CAD/JPY", displayName: "CAD/JPY", change: -0.07, price: "101.82" },
  { symbol: "EUR/USD", displayName: "EUR/USD", change: -0.05, price: "1.1362" },
];

export default function MoversShakersWidget() {
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");
  const data = tab === "gainers" ? GAINERS : LOSERS;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={16} style={{ color: C.jade }} />
          <span style={{
            color: C.jade, fontSize: 12, fontWeight: 700, letterSpacing: 1.2,
            textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif",
          }}>
            Movers & Shakers
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["gainers", "losers"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                background: tab === t
                  ? (t === "gainers" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)")
                  : "transparent",
                color: tab === t
                  ? (t === "gainers" ? "#22C55E" : "#EF4444")
                  : C.sec,
                transition: "all 0.2s",
              }}
            >
              {t === "gainers" ? "▲ Gainers" : "▼ Losers"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["#", "Instrument", "Change", "Price"].map(h => (
                <th key={h} style={{
                  padding: "10px 20px", textAlign: h === "#" ? "center" : "left",
                  color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                  textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif",
                  whiteSpace: "nowrap",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => {
              const isGainer = item.change > 0;
              const changeColor = isGainer ? "#22C55E" : "#EF4444";
              return (
                <tr
                  key={item.symbol}
                  style={{
                    borderBottom: i < data.length - 1 ? `1px solid rgba(255,255,255,0.03)` : "none",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{
                    padding: "10px 20px", textAlign: "center",
                    color: C.muted, fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "10px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: changeColor, opacity: 0.7,
                      }} />
                      <span style={{
                        color: C.text, fontSize: 13, fontWeight: 600,
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {item.symbol}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isGainer
                        ? <TrendingUp size={13} style={{ color: changeColor }} />
                        : <TrendingDown size={13} style={{ color: changeColor }} />
                      }
                      <span style={{
                        color: changeColor, fontSize: 13, fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {isGainer ? "+" : ""}{item.change.toFixed(2)}%
                      </span>
                    </div>
                  </td>
                  <td style={{
                    padding: "10px 20px",
                    color: C.sec, fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {item.price}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 20px",
        borderTop: `1px solid ${C.border}`,
        display: "flex", justifyContent: "flex-end",
      }}>
        <span style={{
          color: C.muted, fontSize: 10, fontFamily: "'DM Sans', sans-serif",
        }}>
          Source: Dukascopy • Updated live
        </span>
      </div>
    </div>
  );
}
