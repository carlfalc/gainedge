import { useState, useEffect } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { isExpired, newsFreshness } from "@/lib/expiry";

interface NewsItem {
  id: string;
  headline: string;
  impact: string | null;
  instruments_affected: string[] | null;
  published_at: string;
  sentiment_direction: string | null;
  ai_reason_short: string | null;
}

interface MappedItem {
  headline: string;
  impacts: { symbol: string; dir: string }[];
  severity: string;
  time: Date;
  aiReason: string | null;
  sentimentDirection: string;
}

const severityColor: Record<string, { bg: string; text: string }> = {
  high: { bg: C.red + "20", text: C.red },
  medium: { bg: C.amber + "20", text: C.amber },
  low: { bg: C.muted + "20", text: C.sec },
};

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}

function getDirectionForInstrument(symbol: string, sentiment: string): string {
  // Gold is inversely correlated in risk-on; otherwise follow sentiment
  if (sentiment === "bullish") return "↑";
  if (sentiment === "bearish") return "↓";
  return "→";
}

export function NewsSentimentPanel() {
  const [items, setItems] = useState<MappedItem[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [userInstruments, setUserInstruments] = useState<string[] | null>(null);

  useEffect(() => {
    loadUserInstruments();
    loadNews();
    const sentimentInterval = setInterval(loadNews, 5 * 60 * 1000);
    const channel = supabase
      .channel("sentiment-news")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news_items" }, () => loadNews())
      .subscribe();
    return () => {
      clearInterval(sentimentInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  // Re-filter when user instruments load
  useEffect(() => {
    if (userInstruments !== null) loadNews();
  }, [userInstruments]);

  const loadUserInstruments = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from("user_instruments")
      .select("symbol")
      .eq("user_id", session.user.id);
    if (data) {
      setUserInstruments(data.map(d => d.symbol));
    }
  };

  const loadNews = async () => {
    const { data } = await supabase
      .from("news_items")
      .select("*")
      .neq("source", "SPIKE_ALERT")
      .order("published_at", { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const fresh = (data as NewsItem[]).filter(n => !isExpired(n.published_at, 720));
      const mapped: MappedItem[] = fresh.map((n) => {
        const sentiment = n.sentiment_direction || "neutral";
        let instrumentList = n.instruments_affected || [];

        // Filter to user's selected instruments if available
        if (userInstruments && userInstruments.length > 0) {
          const filtered = instrumentList.filter(s => userInstruments.includes(s));
          if (filtered.length > 0) instrumentList = filtered;
        }

        const instruments = instrumentList.map(s => ({
          symbol: s,
          dir: getDirectionForInstrument(s, sentiment),
        }));

        return {
          headline: n.headline,
          impacts: instruments.length > 0 ? instruments : [{ symbol: "MARKET", dir: sentiment === "bullish" ? "↑" : sentiment === "bearish" ? "↓" : "→" }],
          severity: n.impact || "medium",
          time: new Date(n.published_at),
          aiReason: n.ai_reason_short || null,
          sentimentDirection: sentiment,
        };
      });
      setItems(mapped);
    } else {
      setItems([]);
    }
  };

  // Safety-net filter: only medium/high impact
  const relevant = items.filter(item =>
    item.severity !== "low" && (
      (item.impacts.length > 0 && item.impacts[0].symbol !== "MARKET") ||
      item.severity === "medium" ||
      item.severity === "high"
    )
  );
  const display = relevant.slice(0, 5);

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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {display.map((item, i) => {
            const sev = severityColor[item.severity] || severityColor.medium;
            const freshness = newsFreshness(item.time);
            const opacity = freshness === "old" ? 0.6 : 1;
            const isExpanded = expandedIdx === i;

            return (
              <div key={i} style={{ opacity }}>
                {/* Main row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 38,
                    animation: "fade-in 0.4s ease-out",
                    cursor: item.aiReason ? "pointer" : "default",
                  }}
                  onClick={() => item.aiReason && setExpandedIdx(isExpanded ? null : i)}
                >
                  <span style={{
                    fontSize: 10,
                    color: C.sec,
                    fontFamily: "'JetBrains Mono', monospace",
                    minWidth: 68,
                    flexShrink: 0,
                  }}>
                    {formatTime(item.time)}
                  </span>

                  {/* Headline */}
                  <span style={{
                    fontSize: 11,
                    color: C.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    flex: "0 1 auto",
                    maxWidth: "35%",
                  }}>
                    {item.headline}
                  </span>

                  {/* AI Reason - middle section */}
                  {item.aiReason && (
                    <span style={{
                      fontSize: 10,
                      color: C.sec,
                      fontStyle: "italic",
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingLeft: 4,
                      paddingRight: 4,
                    }}>
                      {item.aiReason}
                    </span>
                  )}

                  {!item.aiReason && <span style={{ flex: 1 }} />}

                  {freshness === "fresh" && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      background: C.jade + "20", color: C.jade, flexShrink: 0,
                    }}>NEW</span>
                  )}

                  {/* Instrument badges */}
                  <div style={{ display: "flex", gap: 3, flexShrink: 0, flexWrap: "nowrap" }}>
                    {item.impacts.slice(0, 4).map((imp, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 5px",
                          borderRadius: 4,
                          background: imp.dir === "↑" ? C.green + "20" : imp.dir === "↓" ? C.red + "20" : C.muted + "20",
                          color: imp.dir === "↑" ? C.green : imp.dir === "↓" ? C.red : C.sec,
                          fontFamily: "'JetBrains Mono', monospace",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {imp.symbol} {imp.dir}
                      </span>
                    ))}
                    {item.impacts.length > 4 && (
                      <span style={{ fontSize: 9, color: C.sec, padding: "2px 4px" }}>
                        +{item.impacts.length - 4}
                      </span>
                    )}
                  </div>

                  {/* Impact badge */}
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: sev.bg,
                    color: sev.text,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    flexShrink: 0,
                  }}>
                    {item.severity}
                  </span>

                  {/* Expand indicator */}
                  {item.aiReason && (
                    <span style={{ flexShrink: 0, color: C.sec }}>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </span>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && item.aiReason && (
                  <div style={{
                    marginTop: 4,
                    marginBottom: 4,
                    marginLeft: 68,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: C.bg + "80",
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.jade, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                      Why this matters
                    </div>
                    <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>
                      {item.aiReason}
                    </div>
                    {item.impacts.length > 0 && item.impacts[0].symbol !== "MARKET" && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.sec, marginBottom: 3 }}>Instrument effects:</div>
                        {item.impacts.map((imp, j) => (
                          <div key={j} style={{
                            fontSize: 10,
                            color: imp.dir === "↑" ? C.green : imp.dir === "↓" ? C.red : C.sec,
                            paddingLeft: 8,
                            lineHeight: 1.6,
                          }}>
                            {imp.dir} {imp.symbol} — {imp.dir === "↑" ? "may benefit" : imp.dir === "↓" ? "may face pressure" : "mixed outlook"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
