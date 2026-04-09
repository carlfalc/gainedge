import { useState, useMemo } from "react";
import { X, Search, ChevronDown, ChevronRight, Star } from "lucide-react";
import {
  getAllIndicators,
  getDisplayCategory,
  DISPLAY_CATEGORIES,
  FEATURED_INDICATOR_IDS,
  type IndicatorMeta,
} from "@/lib/indicator-registry";

export interface ActiveIndicator {
  id: string;
  meta: IndicatorMeta;
  enabled: boolean;
  params: Record<string, any>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  active: ActiveIndicator[];
  onToggle: (indicator: IndicatorMeta, params?: Record<string, any>) => void;
  onRemove: (id: string) => void;
}

export default function IndicatorModal({ open, onClose, active, onToggle, onRemove }: Props) {
  const [search, setSearch] = useState("");
  const [expandedCat, setExpandedCat] = useState<string>("Trend");
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorMeta | null>(null);

  const allIndicators = useMemo(() => getAllIndicators(), []);
  const activeIds = useMemo(() => new Set(active.filter(a => a.enabled).map(a => a.id)), [active]);

  const grouped = useMemo(() => {
    const groups: Record<string, IndicatorMeta[]> = {};
    DISPLAY_CATEGORIES.forEach(c => (groups[c] = []));

    const q = search.toLowerCase();
    allIndicators.forEach((ind) => {
      if (q && !ind.name.toLowerCase().includes(q) && !ind.shortName.toLowerCase().includes(q)) return;
      const cat = getDisplayCategory(ind.category);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(ind);
    });
    return groups;
  }, [allIndicators, search]);

  const featured = useMemo(() => {
    return allIndicators.filter(i => FEATURED_INDICATOR_IDS.includes(i.id));
  }, [allIndicators]);

  if (!open) return null;

  const totalCount = allIndicators.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#111724] border border-white/10 rounded-xl w-[520px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div>
            <span className="text-sm font-bold text-white">Indicators</span>
            <span className="text-[10px] text-white/30 ml-2">{totalCount} available</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 446 indicators..."
              className="w-full bg-[#080B12] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#00CFA5]/40"
            />
          </div>
        </div>

        {/* Active indicators */}
        {active.filter(a => a.enabled).length > 0 && (
          <div className="px-4 py-2 border-b border-white/5">
            <span className="text-[10px] text-[#00CFA5] font-semibold uppercase tracking-wider">Active</span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {active.filter(a => a.enabled).map((a) => (
                <button
                  key={a.id}
                  onClick={() => onRemove(a.id)}
                  className="px-2 py-1 rounded-md text-[10px] bg-[#00CFA5]/10 text-[#00CFA5] border border-[#00CFA5]/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center gap-1"
                >
                  {a.meta.shortName} <X className="w-2.5 h-2.5" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category list */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Featured row */}
          {!search && (
            <div className="mb-2">
              <button
                onClick={() => setExpandedCat(expandedCat === "Featured" ? "" : "Featured")}
                className="flex items-center gap-2 px-2 py-1.5 w-full text-left"
              >
                {expandedCat === "Featured" ? <ChevronDown className="w-3 h-3 text-amber-400" /> : <ChevronRight className="w-3 h-3 text-amber-400" />}
                <Star className="w-3 h-3 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">Featured</span>
                <span className="text-[10px] text-white/20 ml-auto">{featured.length}</span>
              </button>
              {expandedCat === "Featured" && (
                <div className="grid grid-cols-2 gap-1 px-2">
                  {featured.map((ind) => (
                    <IndicatorRow
                      key={ind.id}
                      ind={ind}
                      isActive={activeIds.has(ind.id)}
                      onToggle={onToggle}
                      onSelect={setSelectedIndicator}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {DISPLAY_CATEGORIES.map((cat) => {
            const items = grouped[cat] || [];
            if (items.length === 0) return null;
            return (
              <div key={cat} className="mb-1">
                <button
                  onClick={() => setExpandedCat(expandedCat === cat ? "" : cat)}
                  className="flex items-center gap-2 px-2 py-1.5 w-full text-left"
                >
                  {expandedCat === cat ? <ChevronDown className="w-3 h-3 text-white/40" /> : <ChevronRight className="w-3 h-3 text-white/40" />}
                  <span className="text-xs font-semibold text-white/70">{cat}</span>
                  <span className="text-[10px] text-white/20 ml-auto">{items.length}</span>
                </button>
                {(expandedCat === cat || search) && (
                  <div className="grid grid-cols-2 gap-1 px-2 max-h-[300px] overflow-y-auto">
                    {items.map((ind) => (
                      <IndicatorRow
                        key={ind.id}
                        ind={ind}
                        isActive={activeIds.has(ind.id)}
                        onToggle={onToggle}
                        onSelect={setSelectedIndicator}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected indicator detail */}
        {selectedIndicator && (
          <div className="border-t border-white/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">{selectedIndicator.name}</span>
              <button onClick={() => setSelectedIndicator(null)} className="text-white/40 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-white/40 mb-2">
              <span className="px-1.5 py-0.5 rounded bg-white/5">{selectedIndicator.category}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5">{selectedIndicator.overlay ? "Overlay" : "Oscillator"}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/5">{selectedIndicator.group}</span>
            </div>
            {selectedIndicator.inputConfig.filter(i => i.type === "int" || i.type === "float").slice(0, 4).map((input) => (
              <div key={input.id} className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-white/50 w-20">{input.title}</span>
                <span className="text-[10px] text-white/70">{input.defval}</span>
              </div>
            ))}
            <button
              onClick={() => {
                onToggle(selectedIndicator);
                setSelectedIndicator(null);
              }}
              className={`mt-2 w-full py-2 rounded-lg text-xs font-semibold transition-all ${
                activeIds.has(selectedIndicator.id)
                  ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                  : "bg-[#00CFA5]/10 text-[#00CFA5] border border-[#00CFA5]/30 hover:bg-[#00CFA5]/20"
              }`}
            >
              {activeIds.has(selectedIndicator.id) ? "Remove" : "Add to Chart"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IndicatorRow({
  ind,
  isActive,
  onToggle,
  onSelect,
}: {
  ind: IndicatorMeta;
  isActive: boolean;
  onToggle: (ind: IndicatorMeta) => void;
  onSelect: (ind: IndicatorMeta) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-2 py-1.5 rounded text-[11px] transition-all cursor-pointer group ${
        isActive
          ? "bg-[#00CFA5]/10 text-[#00CFA5] border border-[#00CFA5]/20"
          : "text-white/50 hover:bg-white/5 border border-transparent"
      }`}
      onClick={() => onToggle(ind)}
      onContextMenu={(e) => { e.preventDefault(); onSelect(ind); }}
    >
      <span className="font-medium truncate flex-1">{ind.shortName}</span>
      <span className="text-[9px] opacity-50 group-hover:opacity-100 ml-1">
        {isActive ? "✓" : ind.overlay ? "overlay" : "pane"}
      </span>
    </div>
  );
}
