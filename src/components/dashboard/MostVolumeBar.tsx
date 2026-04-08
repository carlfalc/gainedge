import { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";

interface TopInstrument {
  symbol: string;
  score: number;
}

export function MostVolumeBar() {
  const [top, setTop] = useState<TopInstrument[]>([]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("most-volume")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "scan_results" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

    // Get user's watchlist
    const { data: instruments } = await supabase
      .from("user_instruments")
      .select("symbol")
      .eq("user_id", uid);

    if (!instruments || instruments.length === 0) return;
    const symbols = instruments.map((i) => i.symbol);

    // Get latest scan per symbol
    const { data: scans } = await supabase
      .from("scan_results")
      .select("symbol, adx, confidence, scanned_at")
      .eq("user_id", uid)
      .in("symbol", symbols)
      .order("scanned_at", { ascending: false })
      .limit(50);

    if (!scans || scans.length === 0) return;

    // Latest scan per symbol, score = ADX (if available) or confidence
    const latest = new Map<string, TopInstrument>();
    for (const s of scans) {
      if (!latest.has(s.symbol)) {
        latest.set(s.symbol, {
          symbol: s.symbol,
          score: s.adx ?? s.confidence ?? 0,
        });
      }
    }

    const sorted = Array.from(latest.values()).sort((a, b) => b.score - a.score);
    // Show top 1, or top 2 if scores are close (within 15%)
    const result = [sorted[0]];
    if (sorted.length > 1 && sorted[1].score >= sorted[0].score * 0.85) {
      result.push(sorted[1]);
    }
    setTop(result);
  };

  if (top.length === 0) return null;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 18px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <BarChart3 size={16} color={C.text} />
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
        Most Volume Today
      </span>

      <div style={{ display: "flex", gap: 8, marginLeft: 4 }}>
        {top.map((t) => (
          <span
            key={t.symbol}
            style={{
              padding: "4px 14px",
              borderRadius: 20,
              border: "1.5px solid #EAB308",
              color: C.text,
              fontSize: 12,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: 0.5,
              transition: "all 0.4s ease",
            }}
          >
            {t.symbol}
          </span>
        ))}
      </div>
    </div>
  );
}
