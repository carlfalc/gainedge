// Legacy AutoTradeStatus — replaced by Strategy page. Kept as a tiny stub so existing
// trade panel layout compiles without modification.
interface Props {
  symbol: string;
  userId: string | null;
  autoTradeEnabled: boolean;
  brokerConnected: boolean;
  signalsPaused: boolean;
  signalDirection: "buy" | "sell" | "both";
  openPositionsForSymbol: number;
  totalOpenPositions: number;
}
export default function AutoTradeStatus({ symbol, openPositionsForSymbol, totalOpenPositions }: Props) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] text-white/50 font-mono">
      Open on {symbol}: <span className="text-white">{openPositionsForSymbol}</span>
      <span className="mx-2 text-white/20">·</span>
      Total open: <span className="text-white">{totalOpenPositions}</span>
      <span className="mx-2 text-white/20">·</span>
      <a href="/dashboard/strategy" className="text-[#00CFA5] hover:underline">Manage strategy →</a>
    </div>
  );
}