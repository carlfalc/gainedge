import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import ChartTabPane from "@/components/dashboard/ChartTabPane";
import ChartSidePanel from "@/components/dashboard/ChartSidePanel";
import AddChartTabModal, { type ChartMode } from "@/components/dashboard/AddChartTabModal";
import { ExternalLink, Cpu, Plus, X, Zap, User, AlertTriangle, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Position } from "@/components/dashboard/TradeExecutionPanel";
import { useRonSnapshots } from "@/services/ron-snapshots";
import { classifyRonSession } from "@/lib/ron-sessions";
import {
  describeFeedVsAccount,
  buildChartContextSegments,
  RON_CONTEXT_TIMEFRAME,
  type TradingAccountInfo,
} from "@/lib/charts-context";

const BROKERS = ["Eightcap", "Pepperstone", "IC Markets", "OANDA"] as const;

interface ChartTab {
  id: string;
  symbol: string;
  mode: ChartMode;
}

const STORAGE_KEY = "ge_chart_tabs_v1";
const ACTIVE_KEY = "ge_chart_tabs_active_v1";

function loadTabs(): { tabs: ChartTab[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const active = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      const tabs = JSON.parse(raw) as ChartTab[];
      if (Array.isArray(tabs) && tabs.length > 0) {
        const activeId = active && tabs.some((t) => t.id === active) ? active : tabs[0].id;
        return { tabs, activeId };
      }
    }
  } catch { /* fallthrough */ }
  const def: ChartTab = { id: "default-us30", symbol: "US30", mode: "manual" };
  return { tabs: [def], activeId: def.id };
}

export default function TradingViewChartPage() {
  const { userId, profile } = useProfile();
  const [selectedBroker, setSelectedBroker] = useState<string>("Pepperstone");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [tradingAccount, setTradingAccount] = useState<TradingAccountInfo | null>(null);
  /** Single source of truth: mirrored from the ACTIVE ChartTabPane, never re-polled. */
  const [paneState, setPaneState] = useState<{
    positions: Position[];
    livePrice: number | null;
    livePriceTime: string | null;
    closingId: string | null;
    closePosition: (id: string) => void;
  }>({ positions: [], livePrice: null, livePriceTime: null, closingId: null, closePosition: () => {} });
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "live" | "demo">("disconnected");
  const [showAdd, setShowAdd] = useState(false);

  const initial = loadTabs();
  const [tabs, setTabs] = useState<ChartTab[]>(initial.tabs);
  const [activeId, setActiveId] = useState<string>(initial.activeId);
  const [searchParams, setSearchParams] = useSearchParams();

  /* Deep link: /dashboard/charts?symbol=XAUUSD focuses (or opens) that symbol's tab. */
  const requestedSymbol = searchParams.get("symbol");
  useEffect(() => {
    if (!requestedSymbol) return;
    setTabs((prev) => {
      const existing = prev.find((t) => t.symbol === requestedSymbol);
      if (existing) { setActiveId(existing.id); return prev; }
      const id = `${requestedSymbol}-manual-${Date.now()}`;
      setActiveId(id);
      return [...prev, { id, symbol: requestedSymbol, mode: "manual" as ChartMode }];
    });
    // Consume the param so a later manual tab switch isn't overridden, while
    // keeping this a normal history entry so browser Back works.
    setSearchParams({}, { replace: true });
  }, [requestedSymbol, setSearchParams]);

  /* persist */
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)); }, [tabs]);
  useEffect(() => { localStorage.setItem(ACTIVE_KEY, activeId); }, [activeId]);

  useEffect(() => {
    if (profile?.broker) {
      const match = BROKERS.find((b) => b.toLowerCase() === profile.broker.toLowerCase());
      if (match) setSelectedBroker(match);
    }
  }, [profile]);

  useEffect(() => {
    if (!userId) return;
    setConnectionStatus("connecting");
    supabase.from("broker_connections")
      .select("metaapi_account_id,account_type,status,broker_name")
      .eq("user_id", userId)
      .eq("is_default", true)
      .limit(1)
      .then(({ data }) => {
        const broker = data?.[0];
        if (broker?.metaapi_account_id && broker.status === "connected") {
          setAccountId(broker.metaapi_account_id);
          setConnectionStatus(broker.account_type === "demo" ? "demo" : "live");
          setTradingAccount({
            brokerName: broker.broker_name,
            accountType: broker.account_type,
            status: broker.status,
            accountId: broker.metaapi_account_id,
          });
        } else {
          setConnectionStatus("disconnected");
          setTradingAccount(null);
        }
      });
  }, [userId]);

  const handleAddTab = useCallback((symbol: string, mode: ChartMode) => {
    const id = `${symbol}-${mode}-${Date.now()}`;
    const newTab: ChartTab = { id, symbol, mode };
    setTabs((prev) => [...prev, newTab]);
    setActiveId(id);
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev; // keep at least one tab
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId) {
        setActiveId(next[0].id);
      }
      return next;
    });
  }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const { snapshots } = useRonSnapshots();
  const activeSnapshot = activeTab ? snapshots.get(activeTab.symbol) ?? null : null;
  const feedVsAccount = describeFeedVsAccount(selectedBroker, tradingAccount);
  const session = classifyRonSession(new Date());
  const contextSegments = activeTab
    ? buildChartContextSegments({
        symbol: activeTab.symbol,
        chartFeed: selectedBroker,
        tradingLabel: feedVsAccount.connected ? feedVsAccount.tradingLabel.replace("Trading: ", "Trading ") : null,
        sessionLabel: session.label,
        marketOpen: session.market_open,
        quoteTimestamp: paneState.livePriceTime,
        ronBarTime: activeSnapshot?.bar_time ?? null,
        ronTimeframe: activeSnapshot?.timeframe ?? RON_CONTEXT_TIMEFRAME,
      })
    : [];

  const handlePaneState = useCallback((state: {
    positions: Position[]; livePrice: number | null; livePriceTime: string | null;
    closingId: string | null; closePosition: (id: string) => void;
  }) => {
    setPaneState((prev) =>
      prev.positions === state.positions &&
      prev.livePrice === state.livePrice &&
      prev.livePriceTime === state.livePriceTime &&
      prev.closingId === state.closingId
        ? prev
        : state,
    );
  }, []);

  const handlePopOut = () => {
    if (!activeTab) return;
    window.open(`/chart-popout?type=tradingview&symbol=${activeTab.symbol}`, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-[#080B12] shrink-0">
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            const modeColor = tab.mode === "auto" ? "#00CFA5" : "#3B82F6";
            return (
              <div
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={`group flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-t-md text-[11px] font-bold cursor-pointer border border-b-0 transition-all ${
                  isActive
                    ? "bg-[#0D1117] border-white/15 text-white"
                    : "bg-[#0a0e16] border-transparent text-white/50 hover:text-white/80"
                }`}
                style={isActive ? { borderTopColor: modeColor, borderTopWidth: 2 } : undefined}
              >
                {tab.mode === "auto" ? (
                  <Zap className="w-3 h-3" style={{ color: modeColor }} />
                ) : (
                  <User className="w-3 h-3" style={{ color: modeColor }} />
                )}
                <span className="font-mono">{tab.symbol}</span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: modeColor }}>
                  {tab.mode}
                </span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                    className="ml-1 w-4 h-4 flex items-center justify-center rounded text-white/30 hover:bg-white/10 hover:text-white/80 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-white/[0.04] border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Chart
          </button>
        </div>

        {/* Instrument intelligence strip — occupies the previously empty central gap. */}
        <div
          className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-1.5 px-3"
          data-testid="instrument-intelligence-strip"
        >
          <span className="font-mono text-[12px] font-bold text-white shrink-0">{strip.symbol}</span>
          {strip.available && strip.state ? (
            <>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider shrink-0"
                style={{ background: `${ronStateColor(strip.state)}22`, color: ronStateColor(strip.state) }}
              >
                {strip.state}
              </span>
              {strip.chips.map((chip) => (
                <span
                  key={chip.id}
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white/[0.04] border border-white/10 text-white/70 whitespace-nowrap ${
                    chip.priority === 3 ? "hidden 2xl:inline" : chip.priority === 2 ? "hidden xl:inline" : ""
                  }`}
                  data-testid={`strip-chip-${chip.id}`}
                >
                  {chip.label}
                </span>
              ))}
            </>
          ) : (
            <span className="text-[11px] text-white/40" data-testid="strip-data-building">
              {strip.message}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">

          <div className="h-4 w-px bg-border" />
          <span className="text-[11px] font-semibold text-muted-foreground" data-testid="chart-feed-label">
            Chart feed
          </span>
          {BROKERS.map((broker) => (
            <button
              key={broker}
              onClick={() => setSelectedBroker(broker)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide transition-all border ${
                selectedBroker === broker
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                  : "bg-card border-border text-muted-foreground hover:text-amber-300 hover:border-amber-500/20"
              }`}
            >
              {broker}
            </button>
          ))}
          <div className="h-4 w-px bg-border mx-1" />
          {feedVsAccount.connected ? (
            <span
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-card border-border text-foreground"
              data-testid="trading-account-pill"
              title={tradingAccount?.accountId ? `Account ${tradingAccount.accountId}` : undefined}
            >
              {feedVsAccount.tradingLabel}
            </span>
          ) : (
            <Link
              to="/dashboard/settings"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-border bg-card text-muted-foreground hover:text-foreground"
              data-testid="trading-account-pill"
            >
              <Link2 className="w-3 h-3" /> Trading account: Not connected
            </Link>
          )}
          {feedVsAccount.mismatch && (
            <span
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-400"
              title={feedVsAccount.mismatchNote}
              data-testid="feed-account-mismatch"
            >
              <AlertTriangle className="w-3 h-3" /> {feedVsAccount.mismatchNote}
            </span>
          )}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold tracking-wide ml-1"
            style={{ background: "rgba(0,207,165,0.1)", border: "1px solid rgba(0,207,165,0.3)", color: "#00CFA5" }}
            title="Falconer is one strategy context. RON is the market-intelligence layer."
          >
            <Cpu className="w-3 h-3" />
            Falconer v7 • Strategy
          </div>
          <button
            onClick={handlePopOut}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-card border border-border text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Pop Out
          </button>
        </div>
      </div>

      {/* Instrument context / freshness strip — genuine source values only. */}
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 border-b border-border bg-[#0a0e16] shrink-0 text-[12px] text-muted-foreground"
        data-testid="chart-context-strip"
      >
        {contextSegments.map((seg, i) => (
          <span key={seg} className="flex items-center gap-2">
            {i > 0 && <span className="opacity-40">•</span>}
            <span className={i === 0 ? "font-bold text-foreground" : ""}>{seg}</span>
          </span>
        ))}
        <span className="ml-auto text-[11px] opacity-70">
          Technical indicators are available in the TradingView Indicators menu.
        </span>
      </div>

      {/* Main content: chart panes + sidebar */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 relative">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${tab.id === activeId ? "" : "hidden"}`}
            >
              <ChartTabPane
                symbol={tab.symbol}
                mode={tab.mode}
                broker={selectedBroker}
                userId={userId}
                accountId={accountId}
                connectionStatus={connectionStatus}
                active={tab.id === activeId}
                onPaneState={handlePaneState}
              />
            </div>
          ))}
        </div>

        <div className="w-[340px] shrink-0 hidden lg:block overflow-y-auto border-l border-border">
          {activeTab && (
            <ChartSidePanel
              symbol={activeTab.symbol}
              userId={userId}
              accountId={accountId}
              positions={paneState.positions}
              onClosePosition={paneState.closePosition}
              closingId={paneState.closingId}
              snapshot={activeSnapshot}
              tradingConnected={feedVsAccount.connected}
            />
          )}
        </div>
      </div>

      <AddChartTabModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAddTab} />
    </div>
  );
}
