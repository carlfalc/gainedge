import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";
import { newsFreshness, isExpired } from "@/lib/expiry";

interface NewsItem {
  id: string;
  headline: string;
  source: string | null;
  impact: string | null;
  instruments_affected: string[] | null;
  published_at: string;
}

type FilterTab = "all" | "high" | "instruments" | "geopolitical" | "economic";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High Impact Only" },
  { key: "instruments", label: "My Instruments" },
  { key: "geopolitical", label: "Geopolitical" },
  { key: "economic", label: "Economic Data" },
];

const GEO_KEYWORDS = ["war", "conflict", "geopolitical", "attack", "sanction", "tariff", "ceasefire", "military", "iran", "russia", "ukraine", "china"];
const ECON_KEYWORDS = ["cpi", "gdp", "nfp", "inflation", "employment", "rate decision", "pmi", "retail sales", "jobs", "housing"];

const BORDER_COLORS: Record<string, string> = { high: "#EF4444", medium: "#F59E0B", low: C.border };
const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  high: { bg: "#EF444420", color: "#EF4444" },
  medium: { bg: "#F59E0B20", color: "#F59E0B" },
  low: { bg: C.muted + "20", color: C.sec },
};

export default function MyNewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [limit, setLimit] = useState(20);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [userInstruments, setUserInstruments] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: inst } = await supabase.from("user_instruments").select("symbol").eq("user_id", session.user.id);
    if (inst) setUserInstruments(inst.map(i => i.symbol));

    const { data } = await supabase
      .from("news_items")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (data) {
      setItems(data as NewsItem[]);
      setLastUpdated(new Date());
    }
  }, [limit]);

  useEffect(() => {
    load();
    const channel = supabase.channel("my-news-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await supabase.functions.invoke("fetch-news", { method: "POST" });
    await load();
    setRefreshing(false);
  };

  const filtered = items.filter(item => {
    const lower = item.headline.toLowerCase();
    if (filter === "high") return item.impact === "high";
    if (filter === "instruments") return (item.instruments_affected || []).some(i => userInstruments.includes(i));
    if (filter === "geopolitical") return GEO_KEYWORDS.some(k => lower.includes(k));
    if (filter === "economic") return ECON_KEYWORDS.some(k => lower.includes(k));
    return true;
  });

  const formatTime = (ts: string) => new Date(ts).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>My News Feed</h1>
          <p style={{ fontSize: 12, color: C.sec }}>
            Filtered by your preferences • Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
            borderRadius: 10, background: C.card, border: `1px solid ${C.border}`,
            color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              background: filter === tab.key ? C.jade : C.card,
              color: filter === tab.key ? "#fff" : C.sec,
              transition: "0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* News Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.sec, fontSize: 13 }}>
            No news matching your current filter. Try "All" or refresh.
          </div>
        )}
        {filtered.map(item => {
          const impact = item.impact || "low";
          const badge = BADGE_STYLES[impact] || BADGE_STYLES.low;
          const freshness = newsFreshness(item.published_at);
          const isOld = isExpired(item.published_at, 720);
          const opacity = freshness === "expired" ? 0.45 : freshness === "old" ? 0.65 : 1;
          return (
            <div
              key={item.id}
              style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: "14px 18px",
                borderLeft: `3px solid ${BORDER_COLORS[impact] || C.border}`,
                transition: "all 0.3s ease",
                opacity,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatTime(item.published_at)}
                    </span>
                    {item.source && (
                      <span style={{ fontSize: 10, color: C.muted }}>• {item.source}</span>
                    )}
                    {freshness === "fresh" && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: C.jade + "20", color: C.jade }}>NEW</span>
                    )}
                    {isOld && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: C.muted }}>12+ hours ago</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6, lineHeight: 1.4 }}>
                    {item.headline}
                  </div>

                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(item.instruments_affected || []).map(inst => (
                      <span
                        key={inst}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                          background: userInstruments.includes(inst) ? C.jade + "20" : C.muted + "20",
                          color: userInstruments.includes(inst) ? C.jade : C.sec,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {inst}
                      </span>
                    ))}
                  </div>
                </div>

                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 4,
                  background: badge.bg, color: badge.color,
                  textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0,
                }}>
                  {impact}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {filtered.length >= limit && (
        <button
          onClick={() => setLimit(l => l + 20)}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 10, marginTop: 12,
            background: C.card, border: `1px solid ${C.border}`,
            color: C.sec, fontSize: 12, fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Load More
        </button>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
