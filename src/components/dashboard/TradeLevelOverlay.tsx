import type { Position } from "./TradeExecutionPanel";

interface Props {
  symbol: string;
  positions: Position[];
}

function getPriceDec(sym: string) {
  if (sym.includes("JPY")) return 3;
  if (["XAUUSD", "US30", "NAS100", "SPX500", "US500"].some((s) => sym.includes(s))) return 2;
  return 5;
}

/**
 * MT4/MT5-style trade level overlay rendered ON TOP of the TradingView iframe.
 * Because the chart is an iframe we cannot draw price-aligned lines into it.
 * Instead we render a stacked legend of horizontal labels along the right edge:
 *   - white dotted = Entry
 *   - green       = Take Profit
 *   - red         = Stop Loss
 * The labels persist for every open position on this tab's symbol and update live.
 */
export default function TradeLevelOverlay({ symbol, positions }: Props) {
  const filtered = positions.filter((p) =>
    p.symbol?.replace(/[._]/g, "").toUpperCase().includes(symbol.toUpperCase())
  );
  if (filtered.length === 0) return null;
  const dec = getPriceDec(symbol);

  return (
    <div className="absolute inset-0 pointer-events-none z-[15]">
      {filtered.map((pos, idx) => {
        const isBuy = pos.type?.toLowerCase().includes("buy");
        // stack each position's badges in its own column near the right
        const rightOffset = 8 + idx * 116;
        return (
          <div
            key={pos.id}
            className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-1.5"
            style={{ right: rightOffset, width: 110 }}
          >
            <Badge
              label={`Entry ${isBuy ? "BUY" : "SELL"}`}
              price={pos.openPrice.toFixed(dec)}
              borderClass="border-white/40"
              bgClass="bg-white/10"
              textClass="text-white"
              dotted
            />
            {pos.takeProfit ? (
              <Badge
                label="TP"
                price={pos.takeProfit.toFixed(dec)}
                borderClass="border-green-500/50"
                bgClass="bg-green-500/10"
                textClass="text-green-400"
              />
            ) : null}
            {pos.stopLoss ? (
              <Badge
                label="SL"
                price={pos.stopLoss.toFixed(dec)}
                borderClass="border-red-500/50"
                bgClass="bg-red-500/10"
                textClass="text-red-400"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Badge({
  label,
  price,
  borderClass,
  bgClass,
  textClass,
  dotted,
}: {
  label: string;
  price: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  dotted?: boolean;
}) {
  return (
    <div
      className={`px-2 py-1 rounded backdrop-blur-md border ${borderClass} ${bgClass} ${dotted ? "border-dashed" : ""}`}
    >
      <div className={`text-[8px] uppercase tracking-wider font-semibold ${textClass}`}>{label}</div>
      <div className={`text-[11px] font-mono font-bold ${textClass}`}>{price}</div>
    </div>
  );
}
