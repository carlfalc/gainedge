import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

interface NewsItem {
  id: string;
  headline: string;
  impact: string | null;
  instruments_affected: string[] | null;
  published_at: string;
}

const mockSentiments = [
  { headline: "US inflation data above expectations", impacts: [{ symbol: "XAUUSD", dir: "↑" }, { symbol: "NAS100", dir: "↓" }, { symbol: "US30", dir: "↓" }, { symbol: "USD", dir: "↑" }], severity: "high", time: new Date(Date.now() - 15 * 60000) },
  { headline: "RBNZ holds rates at 4.25% — dovish tone", impacts: [{ symbol: "NZDUSD", dir: "↓" }, { symbol: "AUDUSD", dir: "↓" }], severity: "medium", time: new Date(Date.now() - 28 * 60000) },
  { headline: "Trump announces new tariffs on China", impacts: [{ symbol: "NAS100", dir: "↓" }, { symbol: "AUDUSD", dir: "↓" }, { symbol: "XAUUSD", dir: "↑" }], severity: "high", time: new Date(Date.now() - 42 * 60000) },
  { headline: "OPEC+ considers output increase", impacts: [{ symbol: "OIL", dir: "↓" }], severity: "medium", time: new Date(Date.now() - 65 * 60000) },
  { headline: "Strong UK GDP data released", impacts: [{ symbol: "GBP", dir: "↑" }, { symbol: "XAUUSD", dir: "↓" }], severity: "low", time: new Date(Date.now() - 79 * 60000) },
];

const severityColor: Record<string, { bg: string; text: string }> = {
  high: { bg: C.red + "20", text: C.red },
  medium: { bg: C.amber + "20", text: C.amber },
  low: { bg: C.muted + "20", text: C.sec },
};

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}

export function NewsSentimentPanel() {
  const [items, setItems] = useState<typeof mockSentiments>([]);

  useEffect(() => {
    loadNews();
    const channel = supabase
      .channel("sentiment-news")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news_items" }, () => loadNews())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadNews = async () => {
    const { data } = await supabase
      .from("news_items")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(5);

    if (data && data.length > 0) {
      const mapped = data.map((n: NewsItem) => {
        const instruments = (n.instruments_affected || []).map(s => {
          const bullish = ["XAUUSD", "GBP", "USD"].includes(s);
          return { symbol: s, dir: bullish ? "↑" : "↓" };
        });
        return {
          headline: n.headline,
          impacts: instruments.length > 0 ? instruments : [{ symbol: "MARKET", dir: "↑" }],
          severity: n.impact || "medium",
          time: new Date(n.published_at),
        };
      });
      setItems(mapped);
    } else {
      setItems(mockSentiments);
    }
  };

  const display = items.slice(0, 3);

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "14px 18px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Activity size={16} color={C.jade} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.jade, letterSpacing: 1.5, textTransform: "uppercase" }}>
          Market Sentiment
        </span>
      </div>

      {display.length === 0 ? (
        <div style={{ fontSize: 12, color: C.sec, padding: "8px 0" }}>
          Monitoring global news feeds for market-moving events...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {display.map((item, i) => {
            const sev = severityColor[item.severity] || severityColor.medium;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 38,
                  animation: "fade-in 0.4s ease-out",
                }}
              >
                <span style={{
                  fontSize: 10,
                  color: C.sec,
                  fontFamily: "'JetBrains Mono', monospace",
                  minWidth: 72,
                  flexShrink: 0,
                }}>
                  {formatTime(item.time)}
                </span>

                <span style={{
                  fontSize: 11,
                  color: C.text,
                  flex: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}>
                  {item.headline}
                </span>

                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {item.impacts.map((imp, j) => (
                    <span
                      key={j}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: imp.dir === "↑" ? C.green + "20" : C.red + "20",
                        color: imp.dir === "↑" ? C.green : C.red,
                        fontFamily: "'JetBrains Mono', monospace",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {imp.symbol} {imp.dir}
                    </span>
                  ))}
                </div>

                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: sev.bg,
                  color: sev.text,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  flexShrink: 0,
                }}>
                  {item.severity}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
