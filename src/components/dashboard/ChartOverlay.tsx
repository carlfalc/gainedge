import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import type { Position } from "@/components/dashboard/TradeExecutionPanel";

interface Signal {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  take_profit: number;
  stop_loss: number;
  confidence: number;
  created_at: string;
}

interface PatternData {
  pattern_name: string;
  target_price?: number;
  stop_price?: number;
  confidence: number;
  win_rate: number;
}

const VALID_PATTERNS = new Set([
  "double_top", "double_bottom",
  "head_and_shoulders", "inverse_head_and_shoulders",
  "triple_top", "triple_bottom",
  "ascending_triangle", "descending_triangle", "symmetrical_triangle",
  "bull_flag", "bear_flag",
  "rising_wedge", "falling_wedge",
  "cup_and_handle", "inverse_cup_and_handle",
  "rectangle", "channel",
  "rounding_top", "rounding_bottom",
  "bullish_engulfing", "bearish_engulfing",
  "morning_star", "evening_star",
  "pin_bar", "hammer", "shooting_star",
  // Also accept display-name variants
  "Double Top", "Double Bottom",
  "Head & Shoulders", "Inverse Head & Shoulders",
  "Triple Top", "Triple Bottom",
  "Ascending Triangle", "Descending Triangle", "Symmetrical Triangle",
  "Bull Flag", "Bear Flag",
  "Rising Wedge", "Falling Wedge",
  "Cup & Handle", "Inverse Cup & Handle",
  "Rectangle", "Channel",
  "Rounding Top", "Rounding Bottom",
  "Bullish Engulfing", "Bearish Engulfing",
  "Morning Star", "Evening Star",
  "Pin Bar", "Hammer", "Shooting Star",
]);

interface ChartOverlayProps {
  symbol: string;
  userId: string | undefined;
  positions: Position[];
}

function getPriceDec(sym: string) {
  if (sym.includes("JPY")) return 3;
  if (["XAUUSD", "US30", "NAS100", "SPX500", "US500"].some(s => sym.includes(s))) return 2;
  return 5;
}

function getPipMul(sym: string) {
  if (sym.includes("JPY")) return 100;
  if (["XAUUSD"].includes(sym)) return 10;
  return 10000;
}

export default function ChartOverlay({ symbol, userId, positions }: ChartOverlayProps) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [pattern, setPattern] = useState<PatternData | null>(null);
  const [patternDismissed, setPatternDismissed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState<string | null>(null);

  const priceDec = getPriceDec(symbol);
  const pipMul = getPipMul(symbol);

  // Fetch active signal
  useEffect(() => {
    if (!userId || !symbol) return;
    const load = () => {
      supabase
        .from("signals")
        .select("id, symbol, direction, entry_price, take_profit, stop_loss, confidence, created_at")
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .eq("result", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          setSignal(data && data.length > 0 ? (data[0] as Signal) : null);
        });
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [userId, symbol]);

  // Fetch latest pattern detection — from scan_results via verdict/reasoning fields
  // Also look at signal_outcomes for pattern_active
  useEffect(() => {
    if (!userId || !symbol) return;
    setPatternDismissed(false);

    const loadPattern = async () => {
      // First check signal_outcomes for pattern data
      const { data: outcomes } = await supabase
        .from("signal_outcomes")
        .select("pattern_active, confidence, entry_price, tp_price, sl_price")
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .not("pattern_active", "is", null)
        .order("created_at", { ascending: false })
        .limit(5);

      // Find the first valid pattern (not a candle type)
      const validOutcome = outcomes?.find(o =>
        o.pattern_active && VALID_PATTERNS.has(o.pattern_active) && o.confidence >= 6
      );

      if (validOutcome) {
        // Fetch historical win rate for this pattern
        const { data: stats } = await supabase
          .from("pattern_weights")
          .select("win_rate")
          .eq("pattern_name", validOutcome.pattern_active!)
          .eq("symbol", symbol)
          .limit(1);

        const winRate = stats?.[0]?.win_rate ?? 0;

        setPattern({
          pattern_name: validOutcome.pattern_active!,
          target_price: validOutcome.tp_price ?? undefined,
          stop_price: validOutcome.sl_price ?? undefined,
          confidence: validOutcome.confidence * 10, // Convert 1-10 to percentage-like
          win_rate: Number(winRate),
        });
        return;
      }

      // Fallback: check scan_results for patterns mentioned in reasoning
      const { data: scans } = await supabase
        .from("scan_results")
        .select("reasoning, confidence, take_profit, stop_loss")
        .eq("user_id", userId)
        .eq("symbol", symbol)
        .gte("confidence", 6)
        .order("scanned_at", { ascending: false })
        .limit(3);

      if (scans) {
        for (const scan of scans) {
          // Don't treat candle types as patterns
          if (scan.confidence < 6) continue;
          const reasoning = (scan.reasoning || "").toLowerCase();
          const detected = Array.from(VALID_PATTERNS).find(p =>
            reasoning.includes(p.toLowerCase().replace(/_/g, " "))
          );
          if (detected) {
            const { data: stats } = await supabase
              .from("pattern_weights")
              .select("win_rate")
              .eq("pattern_name", detected)
              .eq("symbol", symbol)
              .limit(1);

            setPattern({
              pattern_name: detected,
              target_price: scan.take_profit ?? undefined,
              stop_price: scan.stop_loss ?? undefined,
              confidence: scan.confidence * 10,
              win_rate: Number(stats?.[0]?.win_rate ?? 0),
            });
            return;
          }
        }
      }

      setPattern(null);
    };

    loadPattern();
  }, [userId, symbol]);

  // Filtered positions for this symbol
  const filteredPos = useMemo(
    () => positions.filter((p) => p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase())),
    [positions, symbol]
  );

  const activePos = filteredPos[0] ?? null;

  // Signal freshness — is within 5 min?
  const isFreshSignal = signal
    ? Date.now() - new Date(signal.created_at).getTime() < 5 * 60 * 1000
    : false;

  const entryPips = signal ? Math.abs(signal.take_profit - signal.entry_price) * pipMul : 0;
  const slPips = signal ? Math.abs(signal.entry_price - signal.stop_loss) * pipMul : 0;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
      {/* 1. PRICE LEVEL BADGES — right edge */}
      {signal && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          <PriceBadge
            label="Entry"
            price={signal.entry_price.toFixed(priceDec)}
            bgColor="rgba(255,255,255,0.12)"
            borderColor="rgba(255,255,255,0.35)"
            textColor="#FFFFFF"
          />
          <PriceBadge
            label="TP"
            price={`${signal.take_profit.toFixed(priceDec)} (+${entryPips.toFixed(0)}p)`}
            bgColor="rgba(74,222,128,0.12)"
            borderColor="rgba(74,222,128,0.4)"
            textColor="#4ADE80"
          />
          <PriceBadge
            label="SL"
            price={`${signal.stop_loss.toFixed(priceDec)} (-${slPips.toFixed(0)}p)`}
            bgColor="rgba(239,68,68,0.12)"
            borderColor="rgba(239,68,68,0.4)"
            textColor="#EF4444"
          />
        </div>
      )}

      {/* 2. PATTERN DETECTION CARD — top-left */}
      {pattern && !patternDismissed && (
        <div
          className="absolute top-3 left-3 pointer-events-auto animate-in slide-in-from-top-2 duration-300"
          style={{
            background: "rgba(10,10,10,0.88)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(245,158,11,0.35)",
            borderRadius: 8,
            padding: "10px 14px",
            maxWidth: 260,
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
              🎯 {pattern.pattern_name.toUpperCase()} detected
            </span>
            <button onClick={() => setPatternDismissed(true)} className="p-0.5 rounded hover:bg-white/10 transition-colors">
              <X size={12} className="text-muted-foreground" />
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            {pattern.target_price && (
              <div>
                Target: <span className="font-mono text-foreground">{pattern.target_price.toFixed(priceDec)}</span>
                {pattern.stop_price && (
                  <> | Stop: <span className="font-mono text-foreground">{pattern.stop_price.toFixed(priceDec)}</span></>
                )}
              </div>
            )}
            <div>
              Confidence: <span className="font-bold text-foreground">{pattern.confidence}%</span>
              {" | "}Historical WR: <span className="font-bold text-foreground">{pattern.win_rate}%</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. LIVE TRADE P&L BADGE — top-right */}
      {activePos && (
        <div
          className="absolute top-3 right-3 pointer-events-auto"
          style={{
            background: activePos.profit >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${activePos.profit >= 0 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
            borderRadius: 8,
            padding: "8px 12px",
            animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
          }}
        >
          <div className="flex items-center gap-2 text-[11px]">
            <span>{activePos.profit >= 0 ? "🟢" : "🔴"}</span>
            <span className="font-bold text-foreground">
              ACTIVE: {activePos.type?.toLowerCase().includes("buy") ? "BUY" : "SELL"} {symbol}
            </span>
          </div>
          <div className="text-[11px] font-mono font-bold mt-0.5" style={{ color: activePos.profit >= 0 ? "#22C55E" : "#EF4444" }}>
            {activePos.profit >= 0 ? "+" : ""}${activePos.profit.toFixed(2)}
          </div>
        </div>
      )}

      {/* 4. SIGNAL ALERT BANNER — top full width (fresh signal only) */}
      {signal && isFreshSignal && bannerDismissed !== signal.id && (
        <div
          className="absolute top-0 left-0 right-0 pointer-events-auto animate-in slide-in-from-top-2 duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(0,207,165,0.15) 0%, rgba(14,165,233,0.15) 100%)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(0,207,165,0.3)",
            padding: "8px 14px",
          }}
        >
          <div className="flex items-center gap-3 justify-center flex-wrap">
            <span className="text-[11px] font-bold" style={{ color: "#00CFA5" }}>
              🚨 RON Signal: <span style={{ color: signal.direction === "BUY" ? "#22C55E" : "#EF4444" }}>{signal.direction}</span> {symbol} at {signal.entry_price.toFixed(priceDec)}
            </span>
            <span className="text-[10px] text-muted-foreground">|</span>
            <span className="text-[10px] text-muted-foreground">Conf <span className="font-bold text-foreground">{signal.confidence}/10</span></span>
            <button
              onClick={() => setBannerDismissed(signal.id)}
              className="ml-2 px-2 py-0.5 rounded text-[9px] font-bold bg-white/10 text-foreground hover:bg-white/20 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 5. S/R LABELS — right edge, below price badges */}
      <SRLabels symbol={symbol} userId={userId} priceDec={priceDec} />
    </div>
  );
}

/* Sub-components */

function PriceBadge({ label, price, bgColor, borderColor, textColor }: {
  label: string; price: string; bgColor: string; borderColor: string; textColor: string;
}) {
  return (
    <div
      className="px-2 py-1 rounded text-right"
      style={{ background: bgColor, border: `1px solid ${borderColor}`, backdropFilter: "blur(8px)" }}
    >
      <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-[10px] font-mono font-bold" style={{ color: textColor }}>{price}</div>
    </div>
  );
}

function SRLabels({ symbol, userId, priceDec }: { symbol: string; userId?: string; priceDec: number }) {
  const [levels, setLevels] = useState<{ price: number; type: "support" | "resistance" }[]>([]);

  useEffect(() => {
    if (!symbol) return;
    supabase
      .from("liquidity_zones")
      .select("price_high, price_low, zone_type")
      .eq("symbol", symbol)
      .eq("status", "active")
      .order("price_high", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (data) {
          const mapped = data.map((z) => ({
            price: (z.price_high + z.price_low) / 2,
            type: (z.zone_type === "demand" ? "support" : "resistance") as "support" | "resistance",
          }));
          setLevels(mapped);
        }
      });
  }, [symbol]);

  if (levels.length === 0) return null;

  return (
    <div className="absolute right-2 bottom-16 flex flex-col gap-1.5">
      {levels.map((lv, i) => (
        <div
          key={i}
          className="px-2 py-0.5 rounded text-right"
          style={{
            background: lv.type === "support" ? "rgba(59,130,246,0.12)" : "rgba(249,115,22,0.12)",
            border: `1px solid ${lv.type === "support" ? "rgba(59,130,246,0.35)" : "rgba(249,115,22,0.35)"}`,
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="text-[7px] uppercase tracking-wider" style={{ color: lv.type === "support" ? "#3B82F6" : "#F97316" }}>
            {lv.type === "support" ? "S" : "R"}
          </div>
          <div className="text-[9px] font-mono font-bold text-foreground">{lv.price.toFixed(priceDec)}</div>
        </div>
      ))}
    </div>
  );
}
