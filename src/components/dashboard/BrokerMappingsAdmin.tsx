import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { Database, Plus, Trash2, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface Mapping {
  id: string;
  broker: string;
  canonical_symbol: string;
  broker_symbol: string;
  contract_size: number;
  pip_value: number;
  min_lot_size: number;
  is_available: boolean;
  last_verified: string | null;
}

const BROKERS = ["eightcap", "icmarkets", "pepperstone", "oanda", "fxcm"];

export default function BrokerMappingsAdmin() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [filterBroker, setFilterBroker] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState({ broker: "eightcap", canonical_symbol: "", broker_symbol: "", contract_size: "100000", pip_value: "0.0001", min_lot_size: "0.01", is_available: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("broker_symbol_mappings").select("*").order("broker").order("canonical_symbol");
    if (data) setMappings(data as unknown as Mapping[]);
    setLoading(false);
  };

  const toggleAvailable = async (m: Mapping) => {
    // Use service-role via edge function in production. For admin we do direct update attempt.
    const { error } = await supabase.from("broker_symbol_mappings").update({ is_available: !m.is_available } as any).eq("id", m.id);
    if (error) { toast.error("Update failed — service role required"); return; }
    setMappings(prev => prev.map(x => x.id === m.id ? { ...x, is_available: !x.is_available } : x));
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("broker_symbol_mappings").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    setMappings(prev => prev.filter(m => m.id !== id));
    toast.success("Mapping deleted");
  };

  const handleAdd = async () => {
    if (!newRow.canonical_symbol || !newRow.broker_symbol) { toast.error("Fill all fields"); return; }
    setSaving(true);
    const { error } = await supabase.from("broker_symbol_mappings").insert({
      broker: newRow.broker,
      canonical_symbol: newRow.canonical_symbol.toUpperCase(),
      broker_symbol: newRow.broker_symbol,
      contract_size: parseFloat(newRow.contract_size),
      pip_value: parseFloat(newRow.pip_value),
      min_lot_size: parseFloat(newRow.min_lot_size),
      is_available: newRow.is_available,
    } as any);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Mapping added");
    setShowAdd(false);
    setNewRow({ broker: "eightcap", canonical_symbol: "", broker_symbol: "", contract_size: "100000", pip_value: "0.0001", min_lot_size: "0.01", is_available: true });
    load();
    setSaving(false);
  };

  const filtered = filterBroker === "all" ? mappings : mappings.filter(m => m.broker === filterBroker);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Database size={16} color={C.blue} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Broker Symbol Mappings</span>
        <span style={{ fontSize: 11, color: C.sec, marginLeft: "auto" }}>{mappings.length} mappings</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterBroker} onChange={e => setFilterBroker(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}>
          <option value="all">All Brokers</option>
          {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.jade + "20", color: C.jade, display: "flex", alignItems: "center", gap: 4 }}>
          <Plus size={12} /> Add Mapping
        </button>
      </div>

      {showAdd && (
        <div style={{ background: C.bg, borderRadius: 8, padding: 12, border: `1px solid ${C.border}`, marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, fontSize: 11 }}>
          <div>
            <div style={{ color: C.sec, marginBottom: 2 }}>Broker</div>
            <select value={newRow.broker} onChange={e => setNewRow({ ...newRow, broker: e.target.value })}
              style={{ width: "100%", padding: 6, borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 11 }}>
              {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <div style={{ color: C.sec, marginBottom: 2 }}>Canonical Symbol</div>
            <input value={newRow.canonical_symbol} onChange={e => setNewRow({ ...newRow, canonical_symbol: e.target.value })} placeholder="XAUUSD"
              style={{ width: "100%", padding: 6, borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 11 }} />
          </div>
          <div>
            <div style={{ color: C.sec, marginBottom: 2 }}>Broker Symbol</div>
            <input value={newRow.broker_symbol} onChange={e => setNewRow({ ...newRow, broker_symbol: e.target.value })} placeholder="XAUUSD.a"
              style={{ width: "100%", padding: 6, borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 11 }} />
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 6 }}>
            <button onClick={handleAdd} disabled={saving}
              style={{ padding: "6px 12px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.jade, color: "#fff" }}>
              {saving ? <Loader2 size={10} className="animate-spin" /> : "Save"}
            </button>
            <button onClick={() => setShowAdd(false)}
              style={{ padding: "6px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 11, background: C.muted + "30", color: C.sec }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}><Loader2 size={16} className="animate-spin" style={{ color: C.sec }} /></div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Broker", "Canonical", "Broker Symbol", "Contract", "Pip", "Min Lot", "Available", ""].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: C.sec, fontWeight: 600, fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                  <td style={{ padding: "5px 8px", color: C.text }}>{m.broker}</td>
                  <td style={{ padding: "5px 8px", color: C.jade, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{m.canonical_symbol}</td>
                  <td style={{ padding: "5px 8px", color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{m.broker_symbol}</td>
                  <td style={{ padding: "5px 8px", color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>{m.contract_size}</td>
                  <td style={{ padding: "5px 8px", color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>{m.pip_value}</td>
                  <td style={{ padding: "5px 8px", color: C.sec, fontFamily: "'JetBrains Mono', monospace" }}>{m.min_lot_size}</td>
                  <td style={{ padding: "5px 8px" }}>
                    <button onClick={() => toggleAvailable(m)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      {m.is_available
                        ? <Check size={14} color="#22C55E" />
                        : <X size={14} color="#EF4444" />}
                    </button>
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <button onClick={() => handleDelete(m.id)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      <Trash2 size={12} color={C.red} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
