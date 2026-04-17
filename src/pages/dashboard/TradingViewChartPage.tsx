import { useState, useEffect, useCallback } from "react";
import { useProfile } from "@/hooks/use-profile";
import { provisionAccount } from "@/services/metaapi-client";
import ChartTabPane from "@/components/dashboard/ChartTabPane";
import ChartSidePanel from "@/components/dashboard/ChartSidePanel";
import AddChartTabModal, { type ChartMode } from "@/components/dashboard/AddChartTabModal";
import type { RonVersion } from "@/components/dashboard/RonVersionSelector";
import { ExternalLink, Cpu, Plus, X, Zap, User } from "lucide-react";

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
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "live" | "demo">("disconnected");
  const [ronVersion] = useState<RonVersion>("v1");
  const [showAdd, setShowAdd] = useState(false);

  const initial = loadTabs();
  const [tabs, setTabs] = useState<ChartTab[]>(initial.tabs);
  const [activeId, setActiveId] = useState<string>(initial.activeId);

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
    provisionAccount()
      .then(({ accountId: aid }) => { setAccountId(aid); setConnectionStatus("live"); })
      .catch(() => setConnectionStatus("demo"));
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

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="h-4 w-px bg-border" />
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
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide ml-1"
            style={{ background: "rgba(0,207,165,0.1)", border: "1px solid rgba(0,207,165,0.3)", color: "#00CFA5" }}
          >
            <Cpu className="w-3 h-3" />
            {ronVersion === "v1" ? "RON V1" : ronVersion === "v2" ? "RON V2" : "V1+V2"}
          </div>
          <button
            onClick={handlePopOut}
            className="px-2.5 py-1 rounded text-[10px] font-semibold bg-card border border-border text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Pop Out
          </button>
        </div>
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
              />
            </div>
          ))}
        </div>

        <div className="w-[320px] shrink-0 hidden lg:block overflow-y-auto border-l border-border">
          {activeTab && (
            <ChartSidePanel
              symbol={activeTab.symbol}
              userId={userId}
              accountId={accountId}
              positions={[]}
              onClosePosition={() => {}}
              closingId={null}
              onVersionChange={() => {}}
            />
          )}
        </div>
      </div>

      <AddChartTabModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAddTab} />
    </div>
  );
}
