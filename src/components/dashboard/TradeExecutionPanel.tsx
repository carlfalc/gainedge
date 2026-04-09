import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentPrice } from "@/services/metaapi-client";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  ChevronUp, ChevronDown, AlertTriangle, X, Loader2, Zap, User,
} from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FUNCTION_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/metaapi-trade`;

const LOT_OPTIONS = ["0.01", "0.02", "0.05", "0.1", "0.2", "0.5", "1.0"];

const BROKER_SYMBOL_MAP: Record<string, string[]> = {
  XAUUSD: ["XAUUSD"], US30: ["US30", "DJ30"], NAS100: ["NAS100", "USTEC"],
  NZDUSD: ["NZDUSD"], AUDUSD: ["AUDUSD"], EURUSD: ["EURUSD"],
  GBPUSD: ["GBPUSD"], USDJPY: ["USDJPY"],
};

interface Position {
  id: string; symbol: string; type: string; volume: number;
  openPrice: number; stopLoss?: number; takeProfit?: number;
  currentPrice: number; profit: number;
}

interface Deal {
  id: string; symbol: string; type: string; volume: number;
  price: number; closePrice?: number; profit: number;
  entryType?: string;
}

interface TradeExecutionPanelProps {
  symbol: string;
  accountId: string | null;
  connectionStatus: "disconnected" | "connecting" | "live" | "demo";
}

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
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Error (${res.status})`);
  return data;
}

export default function TradeExecutionPanel({ symbol, accountId, connectionStatus }: TradeExecutionPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [lotSize, setLotSize] = useState("0.01");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [confirmEnabled, setConfirmEnabled] = useState(true);
  const [pendingOrder, setPendingOrder] = useState<{ type: "BUY" | "SELL"; price: number } | null>(null);
  const [executing, setExecuting] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Intelligent Trader state
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [autoLotSize, setAutoLotSize] = useState("0.01");
  const [myTradesEnabled, setMyTradesEnabled] = useState(false);

  const priceRef = useRef<ReturnType<typeof setInterval>>();
  const posRef = useRef<ReturnType<typeof setInterval>>();
  const isLive = connectionStatus === "live" && !!accountId;

  // Poll bid/ask
  useEffect(() => {
    if (priceRef.current) clearInterval(priceRef.current);
    if (!isLive) { setBid(null); setAsk(null); return; }

    const poll = async () => {
      const variants = BROKER_SYMBOL_MAP[symbol] ?? [symbol];
      for (const sym of variants) {
        try {
          const p = await fetchCurrentPrice(accountId!, sym);
          if (p) { setBid(p.bid); setAsk(p.ask); return; }
        } catch { /* next */ }
      }
    };
    poll();
    priceRef.current = setInterval(poll, 2000);
    return () => { if (priceRef.current) clearInterval(priceRef.current); };
  }, [symbol, accountId, isLive]);

  // Poll positions — always active when live
  useEffect(() => {
    if (posRef.current) clearInterval(posRef.current);
    if (!isLive) return;

    const load = async () => {
      try {
        const data = await callTrade({ action: "positions", accountId });
        setPositions(data.positions ?? []);
      } catch { /* ignore */ }
    };
    load();
    posRef.current = setInterval(load, 5000);
    return () => { if (posRef.current) clearInterval(posRef.current); };
  }, [isLive, accountId]);

  // Load history when toggled
  useEffect(() => {
    if (!isLive || !showHistory) return;
    setLoadingHistory(true);
    callTrade({ action: "history", accountId })
      .then(d => setDeals(d.deals ?? []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [isLive, accountId, showHistory]);

  const spread = bid !== null && ask !== null ? Math.abs(ask - bid) : null;

  const executeOrder = useCallback(async (type: "BUY" | "SELL") => {
    if (!isLive) return;
    setExecuting(true);
    const actionType = type === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
    const price = type === "BUY" ? ask : bid;
    try {
      await callTrade({
        action: "trade", accountId, symbol,
        actionType, volume: lotSize,
        stopLoss: sl || undefined, takeProfit: tp || undefined,
      });
      toast.success(`Order executed: ${type} ${symbol} ${lotSize} @ ${price?.toFixed(2) ?? "market"}`);
    } catch (e: any) {
      toast.error(`Order failed: ${e.message}`);
    } finally {
      setExecuting(false);
      setPendingOrder(null);
    }
  }, [isLive, accountId, symbol, lotSize, sl, tp, bid, ask]);

  const handleOrderClick = (type: "BUY" | "SELL") => {
    const price = type === "BUY" ? ask : bid;
    if (confirmEnabled) {
      setPendingOrder({ type, price: price ?? 0 });
    } else {
      executeOrder(type);
    }
  };

  const closePosition = async (positionId: string) => {
    setClosingId(positionId);
    try {
      await callTrade({ action: "close", accountId, positionId });
      toast.success("Position closed");
      setPositions(prev => prev.filter(p => p.id !== positionId));
    } catch (e: any) {
      toast.error(`Close failed: ${e.message}`);
    } finally {
      setClosingId(null);
    }
  };

  const fmt = (n: number | null | undefined, dec = 2) => n != null ? n.toFixed(dec) : "—";
  const priceDec = symbol.includes("JPY") ? 3 : ["XAUUSD", "US30", "NAS100", "SPX500"].some(s => symbol.includes(s)) ? 2 : 5;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center justify-center gap-2 py-1.5 rounded-lg border border-white/[0.06] bg-[#111724] text-white/40 text-xs hover:text-white/60 transition-all w-full"
      >
        <ChevronUp className="w-3 h-3" /> Trade Panel <ChevronUp className="w-3 h-3" />
      </button>
    );
  }

  const historyTotals = deals.reduce(
    (acc, d) => {
      acc.pnl += d.profit ?? 0;
      if ((d.profit ?? 0) > 0) acc.wins++;
      else if ((d.profit ?? 0) < 0) acc.losses++;
      return acc;
    },
    { pnl: 0, wins: 0, losses: 0 }
  );

  return (
    <>
      <div className="rounded-lg border border-white/[0.06] bg-[#0D1117] overflow-hidden" style={{ minHeight: 120 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#111724] border-b border-white/[0.06]">
          <span className="text-[11px] font-semibold text-white/70">Trade Panel</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] text-white/40 cursor-pointer select-none">
              <input
                type="checkbox" checked={confirmEnabled}
                onChange={e => setConfirmEnabled(e.target.checked)}
                className="w-3 h-3 rounded accent-[#00CFA5]"
              />
              Confirm
            </label>
            <button onClick={() => setCollapsed(true)} className="text-white/30 hover:text-white/60">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 flex flex-col gap-2">
          {/* ─── 1. INTELLIGENT TRADER ─── */}
          <div>
            <div className="text-[11px] font-semibold text-[#00CFA5] mb-1.5">Intelligent Trader ( R O N ) is:</div>
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={() => setAutoTradeEnabled(!autoTradeEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-medium transition-all border ${
                  autoTradeEnabled
                    ? "bg-[#00CFA5]/15 border-[#00CFA5]/40 text-[#00CFA5]"
                    : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white/70"
                }`}
              >
                <Zap className="w-3 h-3" />
                Auto {autoTradeEnabled ? "ON" : "OFF"}
              </button>

              {autoTradeEnabled && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-white/40">Lot:</span>
                  <input
                    type="number"
                    value={autoLotSize}
                    onChange={e => setAutoLotSize(e.target.value)}
                    step="0.01"
                    min="0.01"
                    className="w-16 bg-[#080B12] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono text-center outline-none focus:border-[#00CFA5]/40"
                  />
                </div>
              )}

              <div className="w-px h-5 bg-white/10" />

              <button
                onClick={() => setMyTradesEnabled(!myTradesEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-medium transition-all border ${
                  myTradesEnabled
                    ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                    : "bg-white/[0.03] border-white/10 text-white/50 hover:text-white/70"
                }`}
              >
                <User className="w-3 h-3" />
                My Trades {myTradesEnabled ? "ON" : "OFF"}
              </button>
            </div>

            <div className="mt-1.5 text-[10px]">
              {autoTradeEnabled ? (
                <span className="text-amber-400">
                  ⚡ RON will execute trades when high-confidence signals fire (confidence ≥ 7)
                </span>
              ) : (
                <span className="text-white/40">
                  Manual trading mode — you control all entries
                </span>
              )}
            </div>
          </div>

          {/* ─── 2. TRADE BAR ─── */}
          <div className="border-t border-white/[0.06] pt-2">
            {/* Warning banner */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Live trading — real money at risk. Trades execute on your broker account.</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Bid/Ask */}
              <div className="flex items-center gap-2 font-mono text-sm">
                <div className="text-center">
                  <div className="text-[9px] text-sky-400 uppercase">Bid</div>
                  <div className="text-white font-bold">{bid !== null ? bid.toFixed(priceDec) : "—"}</div>
                </div>
                <div className="text-[10px] text-white px-1">
                  Spread: {spread !== null ? spread.toFixed(priceDec > 3 ? 1 : priceDec) : "—"}
                </div>
                <div className="text-center">
                  <div className="text-[9px] text-red-500 uppercase">Ask</div>
                  <div className="text-white font-bold">{ask !== null ? ask.toFixed(priceDec) : "—"}</div>
                </div>
              </div>

              <div className="w-px h-8 bg-white/10" />

              <div>
                <div className="text-[9px] text-white mb-0.5">Volume</div>
                <select
                  value={lotSize} onChange={e => setLotSize(e.target.value)}
                  className="bg-[#080B12] border border-white/10 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-[#00CFA5]/40"
                >
                  {LOT_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div>
                <div className="text-[9px] text-white mb-0.5">Stop Loss</div>
                <input
                  type="number" value={sl} onChange={e => setSl(e.target.value)}
                  placeholder="Optional"
                  className="bg-[#080B12] border border-white/10 rounded px-2 py-1 text-xs text-white font-mono w-24 outline-none focus:border-red-400/40 placeholder:text-white/50"
                />
              </div>

              <div>
                <div className="text-[9px] text-white mb-0.5">Take Profit</div>
                <input
                  type="number" value={tp} onChange={e => setTp(e.target.value)}
                  placeholder="Optional"
                  className="bg-[#080B12] border border-white/10 rounded px-2 py-1 text-xs text-white font-mono w-24 outline-none focus:border-green-400/40 placeholder:text-white/50"
                />
              </div>

              <div className="w-px h-8 bg-white/10" />

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => handleOrderClick("SELL")}
                  disabled={!isLive || executing}
                  title={!isLive ? "Connect broker account to enable trading" : undefined}
                  className="flex flex-col items-center px-5 py-2 rounded-lg bg-[#EF4444] border border-red-500/40 text-white font-bold text-sm hover:bg-[#DC2626] transition-all disabled:opacity-30 disabled:cursor-not-allowed min-w-[90px]"
                >
                  <span className="text-[9px] text-white/70 uppercase">Sell</span>
                  <span className="font-mono text-white">{bid !== null ? bid.toFixed(priceDec) : "—"}</span>
                </button>

                <div className="flex flex-col items-center">
                  <div className="text-[8px] text-white/40 uppercase">Vol</div>
                  <input
                    type="number"
                    value={lotSize}
                    onChange={e => setLotSize(e.target.value)}
                    step="0.01"
                    min="0.01"
                    className="w-14 bg-[#080B12] border border-white/10 rounded px-1.5 py-1 text-xs text-white font-mono text-center outline-none focus:border-[#00CFA5]/40"
                  />
                </div>

                <button
                  onClick={() => handleOrderClick("BUY")}
                  disabled={!isLive || executing}
                  title={!isLive ? "Connect broker account to enable trading" : undefined}
                  className="flex flex-col items-center px-5 py-2 rounded-lg bg-[#22C55E] border border-green-500/40 text-white font-bold text-sm hover:bg-[#16A34A] transition-all disabled:opacity-30 disabled:cursor-not-allowed min-w-[90px]"
                >
                  <span className="text-[9px] text-white/70 uppercase">Buy</span>
                  <span className="font-mono text-white">{ask !== null ? ask.toFixed(priceDec) : "—"}</span>
                </button>
              </div>
            </div>

            {!isLive && (
              <div className="text-[10px] text-white/30 text-center mt-1">
                Connect your broker account to enable live trading
              </div>
            )}
          </div>

          {/* ─── 3. OPEN POSITIONS (always visible) ─── */}
          <div className="border-t border-white/[0.06] pt-2">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Open Positions</div>
            {!isLive ? (
              <div className="text-[11px] text-white/30 py-2">Connect broker to view positions</div>
            ) : positions.length === 0 ? (
              <div className="text-[11px] text-white/30 py-2">No open positions</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="text-white/30 text-left border-b border-white/5">
                      <th className="py-1 px-2">Ticket</th>
                      <th className="py-1 px-2">Symbol</th>
                      <th className="py-1 px-2">Type</th>
                      <th className="py-1 px-2">Vol</th>
                      <th className="py-1 px-2">Open</th>
                      <th className="py-1 px-2">Current</th>
                      <th className="py-1 px-2 text-right">P&L</th>
                      <th className="py-1 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(p => (
                      <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-1 px-2 text-white/50">{p.id?.slice(-6)}</td>
                        <td className="py-1 px-2 text-white">{p.symbol}</td>
                        <td className={`py-1 px-2 font-bold ${p.type?.includes("BUY") ? "text-green-400" : "text-red-400"}`}>
                          {p.type?.includes("BUY") ? "Buy" : "Sell"}
                        </td>
                        <td className="py-1 px-2 text-white/60">{p.volume}</td>
                        <td className="py-1 px-2 text-white/80">{fmt(p.openPrice, priceDec)}</td>
                        <td className="py-1 px-2 text-white">{fmt(p.currentPrice, priceDec)}</td>
                        <td className={`py-1 px-2 text-right font-bold ${(p.profit ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(p.profit ?? 0) >= 0 ? "+" : ""}{fmt(p.profit)}
                        </td>
                        <td className="py-1 px-2">
                          <button
                            onClick={() => closePosition(p.id)}
                            disabled={closingId === p.id}
                            className="text-white/30 hover:text-red-400 transition-colors disabled:opacity-30"
                          >
                            {closingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── 4. HISTORY (collapsible) ─── */}
          <div className="border-t border-white/[0.06] pt-1">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showHistory ? "Hide History" : "Show History"}
            </button>

            {showHistory && (
              <div className="mt-1.5 overflow-x-auto">
                {!isLive ? (
                  <div className="text-[11px] text-white/30 py-2">Connect broker to view history</div>
                ) : loadingHistory ? (
                  <div className="flex items-center gap-2 text-white/30 text-[11px] py-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                  </div>
                ) : deals.length === 0 ? (
                  <div className="text-[11px] text-white/30 py-2">No trades today</div>
                ) : (
                  <>
                    <table className="w-full text-[11px] font-mono">
                      <thead>
                        <tr className="text-white/30 text-left border-b border-white/5">
                          <th className="py-1 px-2">Ticket</th>
                          <th className="py-1 px-2">Symbol</th>
                          <th className="py-1 px-2">Type</th>
                          <th className="py-1 px-2">Vol</th>
                          <th className="py-1 px-2">Open</th>
                          <th className="py-1 px-2">Close</th>
                          <th className="py-1 px-2 text-right">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deals.map(d => (
                          <tr key={d.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                            <td className="py-1 px-2 text-white/50">{d.id?.slice(-6)}</td>
                            <td className="py-1 px-2 text-white">{d.symbol}</td>
                            <td className={`py-1 px-2 font-bold ${d.type?.includes("BUY") ? "text-green-400" : "text-red-400"}`}>
                              {d.type?.includes("BUY") ? "Buy" : "Sell"}
                            </td>
                            <td className="py-1 px-2 text-white/60">{d.volume}</td>
                            <td className="py-1 px-2 text-white/80">{fmt(d.price, priceDec)}</td>
                            <td className="py-1 px-2 text-white/80">{d.closePrice ? fmt(d.closePrice, priceDec) : "—"}</td>
                            <td className={`py-1 px-2 text-right font-bold ${(d.profit ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {(d.profit ?? 0) >= 0 ? "+" : ""}${fmt(d.profit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-1.5 px-2 py-1 rounded bg-white/[0.03] text-[11px] font-mono flex items-center gap-4">
                      <span className="text-white/40">Today:</span>
                      <span className={`font-bold ${historyTotals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {historyTotals.pnl >= 0 ? "+" : ""}${historyTotals.pnl.toFixed(2)}
                      </span>
                      <span className="text-white/40">
                        <span className="text-green-400">{historyTotals.wins} Win{historyTotals.wins !== 1 ? "s" : ""}</span>
                        {" / "}
                        <span className="text-red-400">{historyTotals.losses} Loss{historyTotals.losses !== 1 ? "es" : ""}</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={!!pendingOrder} onOpenChange={open => { if (!open) setPendingOrder(null); }}>
        <AlertDialogContent className="bg-[#111724] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Confirm {pendingOrder?.type} Order
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              {pendingOrder?.type} {symbol} {lotSize} lot{parseFloat(lotSize) !== 1 ? "s" : ""} @ {pendingOrder?.price.toFixed(priceDec)}
              {sl && <><br />Stop Loss: {sl}</>}
              {tp && <><br />Take Profit: {tp}</>}
              <br /><br />
              <span className="text-amber-400 text-xs">This will execute a real trade on your broker account.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10 text-white/60 hover:bg-white/5 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingOrder && executeOrder(pendingOrder.type)}
              disabled={executing}
              className={pendingOrder?.type === "BUY"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"}
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirm ${pendingOrder?.type}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
