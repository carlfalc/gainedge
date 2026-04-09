import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { isExpired, newsFreshness } from "@/lib/expiry";

interface NewsItem {
  id: string;
  headline: string;
  impact: string | null;
  instruments_affected: string[] | null;
  published_at: string;
}

const severityColor: Record<string, { bg: string; text: string }> = {
  high: { bg: C.red + "20", text: C.red },
  medium: { bg: C.amber + "20", text: C.amber },
  low: { bg: C.muted + "20", text: C.sec },
};

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}

export function NewsSentimentPanel() {
  const [items, setItems] = useState<{ headline: string; impacts: { symbol: string; dir: string }[]; severity: string; time: Date }[]>([]);

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
      .neq("source", "SPIKE_ALERT")
      .order("published_at", { ascending: false })
      .limit(10);

    if (data && data.length > 0) {
      // Filter to last 12 hours only
      const fresh = (data as NewsItem[]).filter(n => !isExpired(n.published_at, 720));
      const mapped = fresh.map((n) => {
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
      setItems([]);
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
          No recent market-moving events in the last 12 hours.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {display.map((item, i) => {
            const sev = severityColor[item.severity] || severityColor.medium;
            const freshness = newsFreshness(item.time);
            const opacity = freshness === "old" ? 0.6 : 1;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 38,
                  animation: "fade-in 0.4s ease-out",
                  opacity,
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

                {freshness === "fresh" && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: C.jade + "20", color: C.jade,
                  }}>NEW</span>
                )}

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
