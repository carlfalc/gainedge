import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C as CBase } from "@/lib/mock-data";
import { Eye, Move, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ronDecisionRecordHref } from "@/lib/ron-decision-explorer";
import { askRonContextHref } from "@/lib/ask-ron-context";
import { useLiveMarketData } from "@/services/broker-data";
import { useLiveQuotes } from "@/services/live-quotes";
import InstrumentCard, { type InstrumentScanRow } from "@/components/dashboard/InstrumentCard";
import {
  useRonSnapshots, useRonOutcomeStats, useRonDataQuality, useRonRebuildStatus,
} from "@/services/ron-snapshots";

const C = { ...CBase, text: "#FFFFFF", sec: "#FFFFFF" };

type ScanResult = InstrumentScanRow;


interface InstrumentTrackingPanelProps {
  /** When true, renders the "Pop Out" button. Hide it on the popout page itself. */
  showPopOutButton?: boolean;
}

export default function InstrumentTrackingPanel({ showPopOutButton = true }: InstrumentTrackingPanelProps) {
  const navigate = useNavigate();
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [instrumentTfs, setInstrumentTfs] = useState<Map<string, string>>(new Map());
  const [userId, setUserId] = useState<string>();
  const [, setTick] = useState(0);
  const [hiddenPanes, setHiddenPanes] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("hidden-panes"); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem("card-order"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Per-tile disclosure: the compact glance state is the default so the grid stays scannable.
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleExpanded = (symbol: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      return next;
    });
  };

  const { data: liveData } = useLiveMarketData(userId);
  const { snapshots } = useRonSnapshots();
  const outcomeStats = useRonOutcomeStats();
  const dataQuality = useRonDataQuality();
  const rebuild = useRonRebuildStatus();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  // 1-second tick for live countdowns
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Cross-tab/window sync for hidden panes & card order (so popout window stays in sync with main dashboard)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hidden-panes") {
        try { setHiddenPanes(e.newValue ? new Set(JSON.parse(e.newValue)) : new Set()); } catch { /* ignore */ }
      }
      if (e.key === "card-order") {
        try { setCardOrder(e.newValue ? JSON.parse(e.newValue) : []); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;

    const { data: instData } = await supabase
      .from("user_instruments")
      .select("symbol, timeframe")
      .eq("user_id", uid);
    if (instData) {
      const tfMap = new Map<string, string>();
      instData.forEach((i: any) => tfMap.set(i.symbol, i.timeframe || "15m"));
      setInstrumentTfs(tfMap);
    }

    // scan_results was removed in the Falconer wipe. Build a card per tracked
    // instrument, overlaying the latest Falconer trade (if any) for direction/levels.
    const { data: tradeData } = await supabase
      .from("falconer_trades")
      .select("*")
      .eq("user_id", uid)
      .eq("mode", "live")
      .order("opened_at", { ascending: false });

    const latestTrade = new Map<string, any>();
    (tradeData || []).forEach((t: any) => {
      if (!latestTrade.has(t.symbol)) latestTrade.set(t.symbol, t);
    });

    const rows: ScanResult[] = [];
    (instData || []).forEach((i: any) => {
      const t = latestTrade.get(i.symbol);
      rows.push({
        id: t?.id ?? `placeholder-${i.symbol}`,
        symbol: i.symbol,
        direction: t?.direction ?? null,
        entry_price: t?.entry_price ?? null,
        take_profit: t?.tp3_price ?? null,
        stop_loss: t?.sl_price ?? null,
        risk_reward: t && t.entry_price != null && t.sl_price != null && t.tp3_price != null && t.entry_price !== t.sl_price
          ? `1:${(Math.abs(t.tp3_price - t.entry_price) / Math.abs(t.entry_price - t.sl_price)).toFixed(2)}`
          : null,
        reasoning: t ? `Falconer v7 ${t.trigger_type}` : "",

        verdict: t?.status ?? "PENDING",
        // Truthfulness: never manufacture a scan time. No signal row ⇒ null.
        scanned_at: t?.opened_at ?? null,
        status: t?.status ?? null,
        closed_at: t?.closed_at ?? null,
      });
    });
    setScans(rows);
  };

  useEffect(() => {
    loadData();
    // Re-load whenever auth state changes (critical for popout windows that may
    // initialise before the Supabase session is hydrated from localStorage).
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        loadData();
      }
    });
    const channel = supabase.channel(`instrument-tracking-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'falconer_trades' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_instruments' }, () => loadData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
    };
  }, []);

  // Re-fetch when userId is established (covers slow session hydration in popout windows)
  useEffect(() => {
    if (userId) loadData();
  }, [userId]);

  const hidePane = (symbol: string) => {
    setHiddenPanes(prev => {
      const next = new Set(prev);
      next.add(symbol);
      localStorage.setItem("hidden-panes", JSON.stringify([...next]));
      return next;
    });
  };

  const showAllPanes = () => {
    setHiddenPanes(new Set());
    localStorage.removeItem("hidden-panes");
  };

  const visibleScans = scans
    .filter(s => !hiddenPanes.has(s.symbol))
    .sort((a, b) => {
      const ai = cardOrder.indexOf(a.symbol);
      const bi = cardOrder.indexOf(b.symbol);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  // Genuine broker quotes for the visible tiles only (single bounded poll loop).
  const { quotes: liveQuotes } = useLiveQuotes(visibleScans.map(s => s.symbol));

  /** Open the existing GainEdge chart page with this symbol selected. */
  const openChart = (symbol: string) => {
    // In the popout window there is no router history for /dashboard — open a tab.
    if (window.opener || window.location.pathname === "/instruments-popout") {
      window.open(`/dashboard/charts?symbol=${encodeURIComponent(symbol)}`, "_blank", "noopener");
      return;
    }
    navigate(`/dashboard/charts?symbol=${encodeURIComponent(symbol)}`);
  };

  /**
   * Deep-link to the read-only RON decision explorer for this exact tracked
   * symbol+timeframe. Navigation only: no computation, no fetch, no write.
   */
  const openRonRecord = (symbol: string, timeframe: string) => {
    const href = ronDecisionRecordHref(symbol, timeframe);
    if (window.opener || window.location.pathname === "/instruments-popout") {
      window.open(href, "_blank", "noopener");
      return;
    }
    navigate(href);
  };

  /**
   * Ask RON about this exact stored {symbol, timeframe} pair. Navigation only —
   * the pair is the sole context that travels, exactly as the V1 bridge allows.
   */
  const openAskRon = (symbol: string, timeframe: string) => {
    const href = askRonContextHref(symbol, timeframe);
    if (window.opener || window.location.pathname === "/instruments-popout") {
      window.open(href, "_blank", "noopener");
      return;
    }
    navigate(href);
  };


  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };
  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIdx) { setDragIndex(null); setDragOverIndex(null); return; }
    const ordered = visibleScans.map(s => s.symbol);
    const [moved] = ordered.splice(dragIndex, 1);
    ordered.splice(dropIdx, 0, moved);
    const allSymbols = [...ordered, ...scans.map(s => s.symbol).filter(s => !ordered.includes(s))];
    setCardOrder(allSymbols);
    localStorage.setItem("card-order", JSON.stringify(allSymbols));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: C.jade, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
            CURRENT INSTRUMENT TRACKING
          </span>
          <span style={{ color: C.text, fontWeight: 400, fontSize: 12 }}>
            {visibleScans.length}/{scans.length} visible
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.text,
              background: "transparent", border: "none", cursor: "grab",
              fontWeight: 500, opacity: 0.7,
            }}
            title="Drag cards to reorder"
          >
            <Move size={13} color={C.text} /> Move
          </button>
          <button
            onClick={showAllPanes}
            style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.jade,
              background: hiddenPanes.size > 0 ? C.jade + "15" : "transparent",
              border: hiddenPanes.size > 0 ? `1px solid ${C.jade}30` : "1px solid transparent",
              borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600,
              opacity: hiddenPanes.size > 0 ? 1 : 0.5,
            }}
          >
            <Eye size={12} /> Show All
          </button>
          {showPopOutButton && (
            <button
              onClick={() => window.open("/instruments-popout", "_blank", "noopener,width=1400,height=900")}
              style={{
                display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.jade,
                background: "transparent", border: `1px solid ${C.jade}30`,
                borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600,
              }}
              title="Pop this section out into a separate window — perfect for multi-monitor setups"
            >
              <ExternalLink size={12} /> Pop Out ↗
            </button>
          )}
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 20 }}>
        {visibleScans.map((inst, idx) => {
          const tf = instrumentTfs.get(inst.symbol) || "15m";
          return (
            <InstrumentCard
              key={inst.symbol}
              inst={inst}
              tf={tf}
              snap={snapshots.get(inst.symbol)}
              live={liveData.get(inst.symbol)}
              quote={liveQuotes.get(inst.symbol)}
              dataQuality={dataQuality}
              outcomeStats={outcomeStats}
              rebuild={rebuild}
              expanded={expandedCards.has(inst.symbol)}
              onToggleExpanded={() => toggleExpanded(inst.symbol)}
              onHide={() => hidePane(inst.symbol)}
              onOpenChart={() => openChart(inst.symbol)}
              onOpenRonRecord={() => openRonRecord(inst.symbol, tf)}
              onAskRon={() => openAskRon(inst.symbol, tf)}
              isDragOver={dragOverIndex === idx && dragIndex !== idx}
              isDragging={dragIndex === idx}
              dragHandlers={{
                onDragStart: (e) => handleDragStart(e, idx),
                onDragOver: (e) => handleDragOver(e, idx),
                onDrop: (e) => handleDrop(e, idx),
                onDragEnd: handleDragEnd,
              }}
            />
          );
        })}

      </div>
    </>
  );
}
