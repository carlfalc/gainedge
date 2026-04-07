import { useState, useEffect, useRef } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";

interface NewsItem {
  id: string;
  headline: string;
  published_at: string;
  impact: string;
}

export function BreakingNewsTicker() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("news_items")
        .select("id, headline, published_at, impact")
        .order("published_at", { ascending: false })
        .limit(20);
      if (data) setNews(data as NewsItem[]);
    };
    load();

    const channel = supabase.channel("news-ticker")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "news_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const tickerContent = news.map(n => `${formatTime(n.published_at)} — ${n.headline}`).join("   •••   ");

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 16px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 12,
        overflow: "hidden",
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Red dot + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: "nowrap", letterSpacing: 0.5 }}>
          Breaking News
        </span>
      </div>

      <div style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />

      {/* Scrolling ticker */}
      <div style={{ overflow: "hidden", flex: 1, position: "relative" }} ref={scrollRef}>
        <div
          style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            animation: `tickerScroll ${Math.max(news.length * 8, 30)}s linear infinite`,
            animationPlayState: paused ? "paused" : "running",
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <span style={{ color: C.sec }}>{tickerContent}</span>
          <span style={{ color: C.sec }}>&nbsp;&nbsp;&nbsp;•••&nbsp;&nbsp;&nbsp;{tickerContent}</span>
        </div>
      </div>

      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
