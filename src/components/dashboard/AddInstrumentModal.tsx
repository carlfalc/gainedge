import { useState, useEffect, useMemo } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, X, Plus, Check } from "lucide-react";

interface InstrumentRecord {
  symbol: string;
  category: string;
  display_name: string;
  is_popular: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  currentInstruments: string[];
  onAdded: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  forex_major: "Forex Majors",
  forex_minor: "Forex Minors",
  forex_exotic: "Forex Exotic",
  commodity: "Commodities",
  index: "Indices",
  crypto: "Crypto",
};

const CATEGORY_ORDER = ["forex_major", "commodity", "index", "forex_minor", "forex_exotic", "crypto"];

export default function AddInstrumentModal({ open, onClose, userId, currentInstruments, onAdded }: Props) {
  const [library, setLibrary] = useState<InstrumentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase.from("instrument_library").select("symbol, category, display_name, is_popular")
      .order("category").order("symbol")
      .then(({ data }) => {
        if (data) setLibrary(data as InstrumentRecord[]);
      });
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return library;
    const q = search.toLowerCase();
    return library.filter(i =>
      i.symbol.toLowerCase().includes(q) ||
      i.display_name.toLowerCase().includes(q)
    );
  }, [library, search]);

  const grouped = useMemo(() => {
    const map: Record<string, InstrumentRecord[]> = {};
    for (const item of filtered) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [filtered]);

  const handleAdd = async (symbol: string) => {
    setAdding(symbol);
    try {
      await supabase.from("user_instruments").insert({
        user_id: userId,
        symbol,
      });
      toast.success(`${symbol} added to watchlist`);
      onAdded();
    } catch (e: any) {
      toast.error(`Failed to add ${symbol}`);
    }
    setAdding(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
          width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Add Instrument</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.sec }}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, borderRadius: 8, padding: "8px 12px", border: `1px solid ${C.border}` }}>
            <Search size={14} color={C.sec} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by symbol or name..."
              autoFocus
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: C.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 20px 20px" }}>
          {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.jade, textTransform: "uppercase",
                letterSpacing: 1.5, marginBottom: 8, paddingTop: 8,
              }}>
                {CATEGORY_LABELS[cat] || cat}
              </div>
              {grouped[cat].map(inst => {
                const already = currentInstruments.includes(inst.symbol);
                return (
                  <div
                    key={inst.symbol}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 10px", borderRadius: 8,
                      background: already ? C.jade + "08" : "transparent",
                      marginBottom: 2,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                        {inst.symbol}
                      </span>
                      <span style={{ fontSize: 11, color: C.sec, marginLeft: 8 }}>{inst.display_name}</span>
                      {inst.is_popular && (
                        <span style={{
                          fontSize: 9, fontWeight: 600, color: C.amber, marginLeft: 6,
                          background: C.amber + "15", padding: "1px 5px", borderRadius: 4,
                        }}>
                          POPULAR
                        </span>
                      )}
                    </div>
                    {already ? (
                      <span style={{ fontSize: 10, color: C.jade, display: "flex", alignItems: "center", gap: 4 }}>
                        <Check size={12} /> Added
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAdd(inst.symbol)}
                        disabled={adding === inst.symbol}
                        style={{
                          background: C.jade + "15", border: `1px solid ${C.jade}30`,
                          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                          fontSize: 11, fontWeight: 600, color: C.jade,
                          display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <Plus size={12} /> {adding === inst.symbol ? "Adding..." : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ fontSize: 12, color: C.sec, textAlign: "center", padding: 20 }}>
              No instruments found matching "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
