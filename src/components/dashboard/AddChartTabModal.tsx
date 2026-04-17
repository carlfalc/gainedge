import { useMemo, useState } from "react";
import { Search, X, Zap, User } from "lucide-react";
import { TV_SYMBOL_MAP } from "./TradingViewWidget";

export type ChartMode = "auto" | "manual";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (symbol: string, mode: ChartMode) => void;
}

const CATEGORY_OF: Record<string, string> = {
  XAUUSD: "Metals", XAGUSD: "Metals",
  EURUSD: "Forex Majors", GBPUSD: "Forex Majors", USDJPY: "Forex Majors",
  AUDUSD: "Forex Majors", NZDUSD: "Forex Majors", USDCAD: "Forex Majors", USDCHF: "Forex Majors",
  EURGBP: "Forex Crosses", EURJPY: "Forex Crosses", GBPJPY: "Forex Crosses",
  AUDJPY: "Forex Crosses", EURNZD: "Forex Crosses", AUDNZD: "Forex Crosses",
  AUDCAD: "Forex Crosses", NZDCAD: "Forex Crosses", GBPCAD: "Forex Crosses",
  NAS100: "Indices", US30: "Indices", SPX500: "Indices", UK100: "Indices", GER40: "Indices",
  BTCUSD: "Crypto", ETHUSD: "Crypto",
};

export default function AddChartTabModal({ open, onClose, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const symbols = useMemo(() => Object.keys(TV_SYMBOL_MAP), []);
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return symbols;
    return symbols.filter((s) => s.includes(q));
  }, [symbols, search]);

  const grouped = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of filtered) {
      const cat = CATEGORY_OF[s] ?? "Other";
      (map[cat] ||= []).push(s);
    }
    return map;
  }, [filtered]);

  if (!open) return null;

  const handleAdd = (mode: ChartMode) => {
    if (!picked) return;
    onAdd(picked, mode);
    setPicked(null);
    setSearch("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[520px] max-h-[80vh] flex flex-col rounded-lg border border-white/10 bg-[#0D1117] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-semibold text-white">Add chart</span>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search instruments…"
              className="w-full bg-[#080B12] border border-white/10 rounded pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-[#00CFA5]/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {Object.entries(grouped).map(([cat, syms]) => (
            <div key={cat} className="mb-3">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">{cat}</div>
              <div className="grid grid-cols-3 gap-1.5 px-1">
                {syms.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPicked(s)}
                    className={`px-2 py-2 rounded text-xs font-mono font-bold border transition-all ${
                      picked === s
                        ? "bg-[#00CFA5]/20 border-[#00CFA5]/50 text-[#00CFA5]"
                        : "bg-white/[0.03] border-white/10 text-white/70 hover:border-white/30 hover:text-white"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-white/40 py-8">No instruments match "{search}"</div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
          <div className="text-[11px] text-white/50 mr-auto">
            {picked ? <>Selected <span className="font-mono font-bold text-white">{picked}</span></> : "Pick an instrument…"}
          </div>
          <button
            disabled={!picked}
            onClick={() => handleAdd("manual")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-blue-500/15 border border-blue-500/40 text-blue-400 hover:bg-blue-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <User className="w-3.5 h-3.5" /> Manual
          </button>
          <button
            disabled={!picked}
            onClick={() => handleAdd("auto")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#00CFA5]/15 border border-[#00CFA5]/40 text-[#00CFA5] hover:bg-[#00CFA5]/25 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <Zap className="w-3.5 h-3.5" /> Auto Trade
          </button>
        </div>
      </div>
    </div>
  );
}
