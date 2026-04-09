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

export interface Position {
  id: string; symbol: string; type: string; volume: number;
  openPrice: number; stopLoss?: number; takeProfit?: number;
  currentPrice: number; profit: number;
}

interface Deal {
  id: string; symbol: string; type: string; volume: number;
  price: number; closePrice?: number; profit: number;
  entryType?: string;
}

export type OrderMode = "market" | "limit" | "stop";

export interface LimitOrderPrices {
  entry: number | null;
  sl: number | null;
  tp: number | null;
  slEnabled: boolean;
  tpEnabled: boolean;
}

interface TradeExecutionPanelProps {
  symbol: string;
  accountId: string | null;
  connectionStatus: "disconnected" | "connecting" | "live" | "demo";
  currentPrice?: number | null;
  onOrderModeChange?: (mode: OrderMode) => void;
  onLimitPricesChange?: (prices: LimitOrderPrices) => void;
  positions?: Position[];
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

export default function TradeExecutionPanel({ symbol, accountId, connectionStatus, currentPrice: chartPrice, onOrderModeChange, onLimitPricesChange, positions: externalPositions }: TradeExecutionPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [lotSize, setLotSize] = useState("0.01");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [confirmEnabled, setConfirmEnabled] = useState(true);
  const [pendingOrder, setPendingOrder] = useState<{ type: "BUY" | "SELL"; price: number; orderMode: OrderMode } | null>(null);
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

  // Order mode
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [limitEntry, setLimitEntry] = useState("");
  const [limitSl, setLimitSl] = useState("");
  const [limitTp, setLimitTp] = useState("");
  const [slEnabled, setSlEnabled] = useState(true);
  const [tpEnabled, setTpEnabled] = useState(true);

  const priceRef = useRef<ReturnType<typeof setInterval>>();
  const posRef = useRef<ReturnType<typeof setInterval>>();
  const isLive = connectionStatus === "live" && !!accountId;

  // Sync external positions
  useEffect(() => {
    if (externalPositions) setPositions(externalPositions);
  }, [externalPositions]);

  // Notify parent of order mode changes
  useEffect(() => {
    onOrderModeChange?.(orderMode);
  }, [orderMode, onOrderModeChange]);

  // Notify parent of limit price changes
  useEffect(() => {
    if (orderMode !== "market") {
      onLimitPricesChange?.({
        entry: limitEntry ? parseFloat(limitEntry) : null,
        sl: limitSl ? parseFloat(limitSl) : null,
        tp: limitTp ? parseFloat(limitTp) : null,
        slEnabled,
        tpEnabled,
      });
    } else {
      onLimitPricesChange?.(null as any);
    }
  }, [orderMode, limitEntry, limitSl, limitTp, slEnabled, tpEnabled, onLimitPricesChange]);

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

  // Poll positions
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

  // Calculate R:R for limit orders
  const calcRR = () => {
    const entry = parseFloat(limitEntry);
    const slVal = parseFloat(limitSl);
    const tpVal = parseFloat(limitTp);
    if (!entry || !slVal || !tpVal) return null;
    const risk = Math.abs(entry - slVal);
    const reward = Math.abs(tpVal - entry);
    if (risk === 0) return null;
    return (reward / risk).toFixed(2);
  };

  // Calculate pip distance
  const pipSize = symbol.includes("JPY") ? 0.01 : ["XAUUSD"].includes(symbol) ? 0.01 : ["US30", "NAS100", "SPX500"].includes(symbol) ? 1 : 0.0001;
  const calcPips = (from: number, to: number) => Math.abs(to - from) / pipSize;

  const executeOrder = useCallback(async (type: "BUY" | "SELL", mode: OrderMode = "market") => {
    if (!isLive) return;
    setExecuting(true);

    let actionType: string;
    let tradePrice: number | undefined;

    if (mode === "market") {
      actionType = type === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL";
      tradePrice = type === "BUY" ? (ask ?? undefined) : (bid ?? undefined);
    } else if (mode === "limit") {
      actionType = type === "BUY" ? "ORDER_TYPE_BUY_LIMIT" : "ORDER_TYPE_SELL_LIMIT";
      tradePrice = parseFloat(limitEntry) || undefined;
    } else {
      actionType = type === "BUY" ? "ORDER_TYPE_BUY_STOP" : "ORDER_TYPE_SELL_STOP";
      tradePrice = parseFloat(limitEntry) || undefined;
    }

    const orderSl = mode === "market" ? (sl || undefined) : (slEnabled && limitSl ? limitSl : undefined);
    const orderTp = mode === "market" ? (tp || undefined) : (tpEnabled && limitTp ? limitTp : undefined);

    try {
      await callTrade({
        action: "trade", accountId, symbol,
        actionType, volume: lotSize,
        ...(tradePrice && mode !== "market" ? { price: tradePrice } : {}),
        stopLoss: orderSl, takeProfit: orderTp,
      });
      const label = mode === "market" ? "Market" : mode === "limit" ? "Limit" : "Stop";
      toast.success(`${label} order placed: ${type} ${symbol} ${lotSize} @ ${tradePrice?.toFixed(2) ?? "market"}`);
      if (mode !== "market") {
        setLimitEntry(""); setLimitSl(""); setLimitTp("");
        setOrderMode("market");
      }
    } catch (e: any) {
      toast.error(`Order failed: ${e.message}`);
    } finally {
      setExecuting(false);
      setPendingOrder(null);
    }
  }, [isLive, accountId, symbol, lotSize, sl, tp, bid, ask, limitEntry, limitSl, limitTp, slEnabled, tpEnabled]);

  const handleOrderClick = (type: "BUY" | "SELL") => {
    const price = orderMode === "market"
      ? (type === "BUY" ? ask : bid)
      : parseFloat(limitEntry) || 0;
    if (confirmEnabled) {
      setPendingOrder({ type, price: price ?? 0, orderMode });
    } else {
      executeOrder(type, orderMode);
    }
  };

  const handleLimitOrderClick = () => {
    const entry = parseFloat(limitEntry);
    if (!entry) { toast.error("Enter a limit price"); return; }
    const midPrice = (bid && ask) ? (bid + ask) / 2 : chartPrice ?? 0;
    // Determine direction based on entry vs current price
    const type: "BUY" | "SELL" = orderMode === "limit"
      ? (entry < midPrice ? "BUY" : "SELL")  // Limit: buy below, sell above
      : (entry > midPrice ? "BUY" : "SELL");  // Stop: buy above, sell below

    if (confirmEnabled) {
      setPendingOrder({ type, price: entry, orderMode });
    } else {
      executeOrder(type, orderMode);
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

  const rr = calcRR();
  const entryVal = parseFloat(limitEntry);
  const slVal = parseFloat(limitSl);
  const tpVal = parseFloat(limitTp);

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
                  <br />
                  <span className="text-[9px] text-white/30">Safety: max 1 trade per instrument · per-instrument loss pause (3 consecutive) · 5% daily loss limit</span>
                </span>
              ) : (
                <span className="text-white/40">
                  Manual trading mode — you control all entries
                </span>
              )}
            </div>
          </div>

          {/* ─── 2. ORDER TYPE SELECTOR ─── */}
          <div className="border-t border-white/[0.06] pt-2">
            <div className="flex items-center gap-1 mb-2">
              {(["market", "limit", "stop"] as OrderMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setOrderMode(mode)}
                  className={`px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all border ${
                    orderMode === mode
                      ? mode === "market"
                        ? "bg-[#00CFA5]/15 border-[#00CFA5]/40 text-[#00CFA5]"
                        : mode === "limit"
                        ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                        : "bg-amber-500/15 border-amber-500/40 text-amber-400"
                      : "bg-white/[0.03] border-white/10 text-white/40 hover:text-white/60"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Warning banner */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Live trading — real money at risk. Trades execute on your broker account.</span>
            </div>

            {/* ─── MARKET MODE ─── */}
            {orderMode === "market" && (
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
            )}

            {/* ─── LIMIT / STOP MODE ─── */}
            {(orderMode === "limit" || orderMode === "stop") && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Entry price */}
                  <div>
                    <div className="text-[9px] text-white mb-0.5">
                      {orderMode === "limit" ? "Limit Price" : "Stop Price"}
                    </div>
                    <input
                      type="number"
                      value={limitEntry}
                      onChange={e => setLimitEntry(e.target.value)}
                      placeholder={chartPrice?.toFixed(priceDec) ?? "Entry price"}
                      className="bg-[#080B12] border border-white/20 rounded px-2 py-1 text-xs text-white font-mono w-28 outline-none focus:border-white/50 placeholder:text-white/30"
                    />
                  </div>

                  <div className="w-px h-8 bg-white/10" />

                  {/* SL */}
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox" checked={slEnabled}
                        onChange={e => setSlEnabled(e.target.checked)}
                        className="w-3 h-3 rounded accent-red-500"
                      />
                      <span className="text-[9px] text-red-400">SL</span>
                    </label>
                    <input
                      type="number"
                      value={limitSl}
                      onChange={e => setLimitSl(e.target.value)}
                      disabled={!slEnabled}
                      placeholder="Stop Loss"
                      className="bg-[#080B12] border border-red-500/20 rounded px-2 py-1 text-xs text-white font-mono w-24 outline-none focus:border-red-400/50 placeholder:text-white/30 disabled:opacity-30"
                    />
                  </div>

                  {/* TP */}
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox" checked={tpEnabled}
                        onChange={e => setTpEnabled(e.target.checked)}
                        className="w-3 h-3 rounded accent-green-500"
                      />
                      <span className="text-[9px] text-green-400">TP</span>
                    </label>
                    <input
                      type="number"
                      value={limitTp}
                      onChange={e => setLimitTp(e.target.value)}
                      disabled={!tpEnabled}
                      placeholder="Take Profit"
                      className="bg-[#080B12] border border-green-500/20 rounded px-2 py-1 text-xs text-white font-mono w-24 outline-none focus:border-green-400/50 placeholder:text-white/30 disabled:opacity-30"
                    />
                  </div>

                  <div className="w-px h-8 bg-white/10" />

                  {/* Volume */}
                  <div>
                    <div className="text-[9px] text-white mb-0.5">Volume</div>
                    <select
                      value={lotSize} onChange={e => setLotSize(e.target.value)}
                      className="bg-[#080B12] border border-white/10 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-[#00CFA5]/40"
                    >
                      {LOT_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  <div className="w-px h-8 bg-white/10" />

                  {/* Place order button */}
                  <button
                    onClick={handleLimitOrderClick}
                    disabled={!isLive || executing || !limitEntry}
                    className={`px-5 py-2 rounded-lg font-bold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed min-w-[140px] ${
                      orderMode === "limit"
                        ? "bg-blue-600 hover:bg-blue-700 text-white border border-blue-500/40"
                        : "bg-amber-600 hover:bg-amber-700 text-white border border-amber-500/40"
                    }`}
                  >
                    {executing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Place ${orderMode === "limit" ? "Limit" : "Stop"} Order`}
                  </button>
                </div>

                {/* R:R and pip info */}
                {entryVal > 0 && (
                  <div className="flex items-center gap-4 text-[10px] font-mono px-1">
                    {slEnabled && slVal > 0 && (
                      <span className="text-red-400">
                        SL: {calcPips(entryVal, slVal).toFixed(1)} pips
                      </span>
                    )}
                    {tpEnabled && tpVal > 0 && (
                      <span className="text-green-400">
                        TP: {calcPips(entryVal, tpVal).toFixed(1)} pips
                      </span>
                    )}
                    {rr && (
                      <span className="text-amber-400">R:R 1:{rr}</span>
                    )}
                    {slEnabled && slVal > 0 && (
                      <span className="text-white/40">
                        Est. loss: ${(calcPips(entryVal, slVal) * parseFloat(lotSize) * 10).toFixed(2)}
                      </span>
                    )}
                    {tpEnabled && tpVal > 0 && (
                      <span className="text-white/40">
                        Est. profit: ${(calcPips(entryVal, tpVal) * parseFloat(lotSize) * 10).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

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
              Confirm {pendingOrder?.orderMode !== "market" ? `${pendingOrder?.orderMode} ` : ""}{pendingOrder?.type} Order
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              {pendingOrder?.type} {symbol} {lotSize} lot{parseFloat(lotSize) !== 1 ? "s" : ""} @ {pendingOrder?.price.toFixed(priceDec)}
              {pendingOrder?.orderMode === "market" && sl && <><br />Stop Loss: {sl}</>}
              {pendingOrder?.orderMode === "market" && tp && <><br />Take Profit: {tp}</>}
              {pendingOrder?.orderMode !== "market" && slEnabled && limitSl && <><br />Stop Loss: {limitSl}</>}
              {pendingOrder?.orderMode !== "market" && tpEnabled && limitTp && <><br />Take Profit: {limitTp}</>}
              {rr && pendingOrder?.orderMode !== "market" && <><br />Risk:Reward 1:{rr}</>}
              <br /><br />
              <span className="text-amber-400 text-xs">
                {pendingOrder?.orderMode === "market"
                  ? "This will execute a real trade on your broker account."
                  : `This will place a pending ${pendingOrder?.orderMode} order on your broker account.`}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10 text-white/60 hover:bg-white/5 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingOrder && executeOrder(pendingOrder.type, pendingOrder.orderMode)}
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
