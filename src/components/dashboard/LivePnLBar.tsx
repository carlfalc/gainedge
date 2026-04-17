import { Loader2, TrendingUp, TrendingDown, X as XIcon } from "lucide-react";
import type { Position } from "./TradeExecutionPanel";

interface Props {
  symbol: string;
  positions: Position[];
  currentPrice: number | null;
  onClose: (positionId: string) => void;
  closingId: string | null;
}

function getPriceDec(sym: string) {
  if (sym.includes("JPY")) return 3;
  if (["XAUUSD", "US30", "NAS100", "SPX500", "US500"].some((s) => sym.includes(s))) return 2;
  return 5;
}

function getPipMul(sym: string) {
  if (sym.includes("JPY")) return 100;
  if (sym.includes("XAU")) return 10;
  if (["US30", "NAS100", "SPX500", "US500"].some((s) => sym.includes(s))) return 1;
  return 10000;
}

/**
 * MT4/MT5-style "Open Positions" bar shown at the bottom of the chart area.
 * Only displays positions matching this tab's symbol.
 */
export default function LivePnLBar({ symbol, positions, currentPrice, onClose, closingId }: Props) {
  const filtered = positions.filter((p) =>
    p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase())
  );
  if (filtered.length === 0) return null;

  const dec = getPriceDec(symbol);
  const pipMul = getPipMul(symbol);

  return (
    <div className="border-t border-white/10 bg-[#0a0e16]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04]">
        <span className="text-[10px] uppercase tracking-wider font-bold text-white/50">Open Positions · {symbol}</span>
        <span className="text-[10px] text-white/30">({filtered.length})</span>
      </div>
      <div className="flex flex-wrap gap-2 p-2">
        {filtered.map((pos) => {
          const isBuy = pos.type?.toLowerCase().includes("buy");
          const live = currentPrice ?? pos.currentPrice ?? pos.openPrice;
          const diff = isBuy ? live - pos.openPrice : pos.openPrice - live;
          const pips = diff * pipMul;
          const profit = pos.profit ?? 0;
          const positive = profit >= 0;
          const color = positive ? "#22C55E" : "#EF4444";

          return (
            <div
              key={pos.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md border bg-[#0D1117] text-[11px]"
              style={{ borderColor: positive ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)" }}
            >
              <div className="flex items-center gap-1.5">
                {isBuy ? (
                  <TrendingUp size={13} style={{ color: "#22C55E" }} />
                ) : (
                  <TrendingDown size={13} style={{ color: "#EF4444" }} />
                )}
                <span className="font-bold" style={{ color: isBuy ? "#22C55E" : "#EF4444" }}>
                  {isBuy ? "BUY" : "SELL"}
                </span>
                <span className="font-mono text-white/80">{pos.volume}</span>
              </div>

              <Field label="Entry" value={pos.openPrice.toFixed(dec)} />
              <Field label="Current" value={live.toFixed(dec)} mono />
              {pos.stopLoss ? <Field label="SL" value={pos.stopLoss.toFixed(dec)} color="#EF4444" /> : null}
              {pos.takeProfit ? <Field label="TP" value={pos.takeProfit.toFixed(dec)} color="#22C55E" /> : null}

              <div className="flex flex-col items-end leading-tight">
                <span className="text-[8px] uppercase text-white/40">P&amp;L</span>
                <span className="font-mono font-bold" style={{ color }}>
                  {positive ? "+" : ""}
                  {pips.toFixed(1)}p
                </span>
                <span className="font-mono font-bold" style={{ color }}>
                  {positive ? "+" : ""}${profit.toFixed(2)}
                </span>
              </div>

              <button
                onClick={() => onClose(pos.id)}
                disabled={closingId === pos.id}
                className="ml-1 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25 transition disabled:opacity-50"
              >
                {closingId === pos.id ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <>
                    <XIcon size={11} /> Close
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div className="flex flex-col items-start leading-tight">
      <span className="text-[8px] uppercase text-white/40">{label}</span>
      <span className={`font-mono ${mono ? "font-bold" : ""} text-white`} style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}
