import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Plug, Power, Zap, Globe2, Loader2, Link2,
} from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { useAutoTradeSettings, type AutoTradeSettingRow } from "@/hooks/use-auto-trade-settings";
import { useBrokerHealth } from "@/hooks/use-broker-health";
import { useBrokerMappings } from "@/hooks/use-broker-mappings";
import { toast } from "sonner";

interface PositionRow { id: string; symbol: string; volume: number; profit: number }
interface ExecRow { id: string; symbol: string; status: string; created_at: string }

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTION_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/metaapi-trade`;

async function callTrade(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function AutoTradePage() {
  const { userId } = useProfile();
  const { settings, get, update, killAll, activeCount } = useAutoTradeSettings(userId);
  const { health, testing, testConnection } = useBrokerHealth(userId);
  const { getAvailabilityStatus } = useBrokerMappings(userId);

  const [instruments, setInstruments] = useState<string[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [todayExecs, setTodayExecs] = useState<ExecRow[]>([]);
  const [confirmKill, setConfirmKill] = useState(false);

  // Load user instruments
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_instruments").select("symbol").eq("user_id", userId).then(({ data }) => {
      const syms = Array.from(new Set((data ?? []).map((r: any) => r.symbol as string)));
      setInstruments(syms);
    });
  }, [userId]);

  // Today's auto-trade executions
  useEffect(() => {
    if (!userId) return;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    supabase
      .from("auto_trade_executions")
      .select("id,symbol,status,created_at")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setTodayExecs((data ?? []) as ExecRow[]));
  }, [userId, activeCount]);

  // Live positions (poll every 10s)
  const posTimer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (!health.isConnected) { setPositions([]); return; }
    const load = async () => {
      try {
        const data = await callTrade({ action: "positions" });
        if (Array.isArray(data.positions)) setPositions(data.positions as PositionRow[]);
      } catch { /* ignore */ }
    };
    load();
    posTimer.current = setInterval(load, 10_000);
    return () => { if (posTimer.current) clearInterval(posTimer.current); };
  }, [health.isConnected]);

  const positionsBySymbol = useMemo(() => {
    const map: Record<string, { count: number; floating: number }> = {};
    positions.forEach(p => {
      const m = map[p.symbol] ?? { count: 0, floating: 0 };
      m.count += 1;
      m.floating += Number(p.profit ?? 0);
      map[p.symbol] = m;
    });
    return map;
  }, [positions]);

  const totalFloating = positions.reduce((sum, p) => sum + Number(p.profit ?? 0), 0);

  const handleToggle = useCallback(async (symbol: string, enabled: boolean) => {
    if (enabled) {
      // 9b: pre-flight checks before enabling
      if (!health.hasDefaultConnection) {
        toast.error("Connect your broker in Settings before enabling auto-trade");
        return;
      }
      if (!health.isConnected) {
        toast.error("Your broker connection has issues. Reconnect from Settings.");
        return;
      }
      if (getAvailabilityStatus(symbol) === "unavailable") {
        toast.error(`${symbol} is not available on ${health.brokerName ?? "your broker"}.`);
        return;
      }
      // Rough margin pre-check: lot * 1000 ≈ required margin assumption (very approximate; broker enforces real)
      const lot = get(symbol).lot_size || 0.01;
      if (health.balance != null && health.balance < lot * 100) {
        toast.error(`Insufficient balance for ${lot} lots on ${symbol}. Free balance: ${health.balance.toFixed(2)}`);
        return;
      }
    }
    await update(symbol, { enabled });
    toast.success(`Auto-trade ${enabled ? "enabled" : "disabled"} for ${symbol}`);
  }, [update, health, getAvailabilityStatus, get]);

  const handleLot = useCallback(async (symbol: string, value: string) => {
    const n = parseFloat(value);
    if (isNaN(n) || n <= 0) { toast.error("Lot size must be > 0"); return; }
    if (n < 0.01) { toast.error("Minimum lot size is 0.01"); return; }
    await update(symbol, { lot_size: n });
  }, [update]);

  const handleDirection = useCallback(async (symbol: string, dir: "buy" | "sell" | "both") => {
    await update(symbol, { signal_direction: dir });
  }, [update]);

  const handleTest = useCallback(async () => {
    const r = await testConnection();
    if (r.ok) toast.success(`Broker connected · balance ${r.balance ?? "—"}`);
    else toast.error(`Connection failed: ${r.error || "unknown error"}`);
  }, [testConnection]);

  const handleKill = useCallback(async () => {
    await killAll();
    setConfirmKill(false);
    toast.success("Master kill switch engaged — auto-trade OFF for all instruments");
  }, [killAll]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#00CFA5]" /> Auto-Trade Control
          </h1>
          <p className="text-sm text-white/50 mt-1 flex items-center gap-2">
            <Globe2 className="w-3.5 h-3.5 text-[#00CFA5]" />
            <span className="text-[#00CFA5] font-semibold">RON runs 24/7</span>
            <span className="text-white/30">·</span>
            Auto-trades execute on closed candles when confidence ≥ 7
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !health.hasDefaultConnection}
            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white/70 text-xs font-semibold flex items-center gap-2 hover:bg-white/[0.07] disabled:opacity-40"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            Test Broker Connection
          </button>
          <button
            onClick={() => setConfirmKill(true)}
            disabled={activeCount === 0}
            className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-2 hover:bg-red-500/20 disabled:opacity-40"
          >
            <Power className="w-3.5 h-3.5" /> Master Kill Switch
          </button>
        </div>
      </div>

      {/* Sync explainer banner */}
      <div className="rounded-lg border border-[#00CFA5]/25 bg-[#00CFA5]/[0.04] p-3 flex items-start gap-2.5">
        <Link2 className="w-4 h-4 text-[#00CFA5] mt-0.5 flex-shrink-0" />
        <div className="text-xs text-white/70 leading-relaxed">
          <span className="text-[#00CFA5] font-semibold">Synced in real-time</span> with the per-chart Auto toggles on the{" "}
          <Link to="/dashboard/charts" className="text-[#00CFA5] hover:underline">Charts page</Link>.
          Flipping a switch here updates the matching chart tab instantly — and vice versa. One source of truth, two places to manage it.
        </div>
      </div>

      {/* Broker connection blocker */}
      {!health.hasDefaultConnection && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Plug className="w-5 h-5 text-amber-300" />
            <div>
              <div className="text-sm font-semibold text-amber-200">Connect your broker to enable auto-trading</div>
              <div className="text-xs text-amber-200/70 mt-0.5">Without a default broker connection, auto-trade toggles are disabled.</div>
            </div>
          </div>
          <Link to="/dashboard/settings" className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs font-semibold flex items-center gap-1 hover:bg-amber-500/30">
            Connect Broker <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="Auto-Trade Active" value={`${activeCount}`} sub={`of ${instruments.length} instruments`} accent="#00CFA5" icon={<Zap className="w-4 h-4" />} />
        <Stat label="Open Positions" value={`${positions.length}`} sub={`floating ${totalFloating >= 0 ? "+" : ""}${totalFloating.toFixed(2)}`} accent={totalFloating >= 0 ? "#00CFA5" : "#EF4444"} icon={<Activity className="w-4 h-4" />} />
        <Stat label="Auto-Executed Today" value={`${todayExecs.filter(e => e.status === "filled").length}`} sub={`${todayExecs.filter(e => e.status === "failed").length} failed`} accent="#3B82F6" icon={<CheckCircle2 className="w-4 h-4" />} />
        <Stat label="Broker Health" value={health.isConnected ? "Connected" : (health.hasDefaultConnection ? "Disconnected" : "Not setup")}
              sub={health.brokerName ? `${health.brokerName} · bal ${health.balance ?? "—"}` : "no broker on file"}
              accent={health.isConnected ? "#00CFA5" : "#F59E0B"}
              icon={<Plug className="w-4 h-4" />} />
      </div>

      {/* Instruments table */}
      <div className="rounded-lg border border-white/[0.06] bg-[#0D1117] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Instruments</h2>
          <span className="text-[10px] text-white/40">{instruments.length} watched</span>
        </div>
        {instruments.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">
            No instruments in your watchlist yet.{" "}
            <Link to="/dashboard/settings" className="text-[#00CFA5] hover:underline">Add some in Settings</Link>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  <Th>Symbol</Th>
                  <Th>Auto-Trade</Th>
                  <Th>Lot Size</Th>
                  <Th>Direction</Th>
                  <Th>Open</Th>
                  <Th>Last 24h</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {instruments.map(sym => {
                  const s = get(sym);
                  const pos = positionsBySymbol[sym] ?? { count: 0, floating: 0 };
                  const recentExecs = todayExecs.filter(e => e.symbol === sym);
                  const lastExec = recentExecs[0];
                  const availability = getAvailabilityStatus(sym);
                  return (
                    <Row
                      key={sym}
                      symbol={sym}
                      setting={s}
                      brokerConnected={health.isConnected}
                      availability={availability}
                      openCount={pos.count}
                      floating={pos.floating}
                      execsToday={recentExecs.length}
                      lastExec={lastExec}
                      onToggle={(en) => handleToggle(sym, en)}
                      onLotChange={(v) => handleLot(sym, v)}
                      onDirChange={(d) => handleDirection(sym, d)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm kill modal */}
      {confirmKill && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setConfirmKill(false)}>
          <div className="rounded-lg border border-red-500/40 bg-[#0D1117] p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-red-300 mb-3">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold">Master Kill Switch</h3>
            </div>
            <p className="text-xs text-white/60 mb-4">
              This will turn OFF auto-trade for all {activeCount} active instruments. Open positions will NOT be closed.
              You can re-enable individual instruments at any time.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmKill(false)} className="px-3 py-1.5 rounded text-xs bg-white/[0.05] text-white/60 hover:bg-white/[0.08]">Cancel</button>
              <button onClick={handleKill} className="px-3 py-1.5 rounded text-xs bg-red-500/20 border border-red-500/50 text-red-200 font-semibold hover:bg-red-500/30">Disable All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-semibold px-3 py-2.5">{children}</th>;
}

function Stat({ label, value, sub, accent, icon }: { label: string; value: string; sub: string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0D1117] p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/40">
        <span style={{ color: accent }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold mt-1" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] text-white/40 mt-0.5 font-mono">{sub}</div>
    </div>
  );
}

function Row({
  symbol, setting, brokerConnected, availability, openCount, floating, execsToday, lastExec,
  onToggle, onLotChange, onDirChange,
}: {
  symbol: string;
  setting: AutoTradeSettingRow;
  brokerConnected: boolean;
  availability: "available" | "unavailable" | "unverified" | "no_broker";
  openCount: number;
  floating: number;
  execsToday: number;
  lastExec?: ExecRow;
  onToggle: (enabled: boolean) => void;
  onLotChange: (value: string) => void;
  onDirChange: (dir: "buy" | "sell" | "both") => void;
}) {
  const [lotDraft, setLotDraft] = useState(String(setting.lot_size));
  useEffect(() => { setLotDraft(String(setting.lot_size)); }, [setting.lot_size]);

  const blocked = !brokerConnected || availability === "unavailable";
  let statusLabel = "Idle";
  let statusColor = "text-white/40";
  if (!brokerConnected) { statusLabel = "Broker missing"; statusColor = "text-amber-300"; }
  else if (availability === "unavailable") { statusLabel = "Symbol unavailable"; statusColor = "text-red-300"; }
  else if (setting.enabled) { statusLabel = "Monitoring"; statusColor = "text-[#00CFA5]"; }
  else { statusLabel = "Paused"; statusColor = "text-white/40"; }

  return (
    <tr className="border-t border-white/[0.04] hover:bg-white/[0.015]">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-white">{symbol}</span>
          {setting.enabled && <span className="w-1.5 h-1.5 rounded-full bg-[#00CFA5]" />}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={() => onToggle(!setting.enabled)}
          disabled={blocked && !setting.enabled}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${setting.enabled ? "bg-[#00CFA5]" : "bg-white/10"} ${blocked && !setting.enabled ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${setting.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </td>
      <td className="px-3 py-2.5">
        <input
          type="number" step="0.01" min="0.01"
          value={lotDraft}
          onChange={e => setLotDraft(e.target.value)}
          onBlur={() => { if (lotDraft !== String(setting.lot_size)) onLotChange(lotDraft); }}
          className="w-20 px-2 py-1 rounded bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#00CFA5]/50"
        />
      </td>
      <td className="px-3 py-2.5">
        <select
          value={setting.signal_direction}
          onChange={e => onDirChange(e.target.value as "buy" | "sell" | "both")}
          className="px-2 py-1 rounded bg-[#0a0a0a] border border-white/10 text-white text-xs focus:outline-none focus:border-[#00CFA5]/50 [&>option]:bg-[#0a0a0a] [&>option]:text-white"
        >
          <option value="both" className="bg-[#0a0a0a] text-white">Buy & Sell</option>
          <option value="buy" className="bg-[#0a0a0a] text-white">Buy only</option>
          <option value="sell" className="bg-[#0a0a0a] text-white">Sell only</option>
        </select>
      </td>
      <td className="px-3 py-2.5">
        <div className="font-mono text-white">{openCount}</div>
        {openCount > 0 && (
          <div className={`text-[10px] font-mono ${floating >= 0 ? "text-[#00CFA5]" : "text-red-300"}`}>
            {floating >= 0 ? "+" : ""}{floating.toFixed(2)}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="font-mono text-white">{execsToday}</div>
        {lastExec && (
          <div className="text-[10px] text-white/40">{new Date(lastExec.created_at).toLocaleTimeString()}</div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[11px] ${statusColor}`}>{statusLabel}</span>
      </td>
      <td className="px-3 py-2.5">
        <Link to={`/dashboard/charts?symbol=${encodeURIComponent(symbol)}`} className="text-[10px] text-[#00CFA5] hover:underline">View Chart →</Link>
      </td>
    </tr>
  );
}
