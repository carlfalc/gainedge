import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Plus, Save, Filter, ToggleLeft, ToggleRight, Pencil, X, Check } from "lucide-react";

interface KnowledgeRule {
  id: string;
  category: string;
  rule_name: string;
  rule_text: string;
  priority: number;
  is_active: boolean;
  version: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "entry_rules", label: "Entry" },
  { value: "no_trade_rules", label: "No Trade" },
  { value: "risk_management", label: "Risk Mgmt" },
  { value: "exit_rules", label: "Exit" },
  { value: "session_rules", label: "Session" },
  { value: "market_structure", label: "Structure" },
];

const CATEGORY_COLORS: Record<string, string> = {
  entry_rules: C.jade,
  no_trade_rules: C.red,
  risk_management: C.amber,
  exit_rules: C.blue,
  session_rules: C.purple,
  market_structure: C.teal,
};

export default function FalconerRulesPanel() {
  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [versionFilter, setVersionFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState(5);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({ category: "entry_rules", rule_name: "", rule_text: "", priority: 7 });
  const [aiVersion, setAiVersion] = useState<"v1" | "v2">("v2");

  useEffect(() => { loadRules(); loadVersion(); }, []);

  const loadRules = async () => {
    const { data } = await supabase.from("falconer_knowledge").select("*").order("priority", { ascending: false });
    if (data) setRules(data as KnowledgeRule[]);
    setLoading(false);
  };

  const loadVersion = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (profile && (profile as any).falconer_version) {
      setAiVersion((profile as any).falconer_version);
    }
  };

  const toggleRule = async (rule: KnowledgeRule) => {
    // Use service-role via edge function since RLS blocks client mutations
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action: "toggle_rule", rule_id: rule.id, is_active: !rule.is_active }),
    });
    if (res.ok) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
      toast.success(`Rule ${!rule.is_active ? "enabled" : "disabled"}`);
    }
  };

  const saveEdit = async (rule: KnowledgeRule) => {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action: "edit_rule", rule_id: rule.id, rule_text: editText, priority: editPriority }),
    });
    if (res.ok) {
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule_text: editText, priority: editPriority } : r));
      setEditingId(null);
      toast.success("Rule updated");
    }
  };

  const addRule = async () => {
    if (!newRule.rule_name || !newRule.rule_text) { toast.error("Fill in all fields"); return; }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action: "add_rule", ...newRule }),
    });
    if (res.ok) {
      toast.success("Rule added");
      setShowAdd(false);
      setNewRule({ category: "entry_rules", rule_name: "", rule_text: "", priority: 7 });
      loadRules();
    }
  };

  const switchVersion = async (ver: "v1" | "v2") => {
    setAiVersion(ver);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ falconer_version: ver } as any).eq("id", session.user.id);
    }
    toast.success(`Falconer AI switched to ${ver === "v2" ? "V2 (Knowledge Base)" : "V1 (Legacy)"}`);
  };

  const filtered = rules.filter(r => {
    if (filter !== "all" && r.category !== filter) return false;
    if (versionFilter !== "all" && r.version !== versionFilter) return false;
    return true;
  });

  const v2Active = rules.filter(r => r.version === "v2" && r.is_active).length;
  const v2Total = rules.filter(r => r.version === "v2").length;

  if (loading) return <div style={{ color: C.sec, padding: 12 }}>Loading rules...</div>;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Brain size={16} color={C.purple} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Falconer AI Rules</span>
        <span style={{ fontSize: 11, color: C.sec, marginLeft: "auto" }}>{v2Active}/{v2Total} V2 rules active</span>
      </div>

      {/* Version Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: 12, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Falconer AI Version:</span>
        <button
          onClick={() => switchVersion("v1")}
          style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
            background: aiVersion === "v1" ? C.amber + "30" : C.bg, color: aiVersion === "v1" ? C.amber : C.sec,
          }}
        >
          V1 (Legacy)
        </button>
        <button
          onClick={() => switchVersion("v2")}
          style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
            background: aiVersion === "v2" ? C.jade + "30" : C.bg, color: aiVersion === "v2" ? C.jade : C.sec,
          }}
        >
          V2 (Knowledge Base)
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setFilter(c.value)}
            style={{
              padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
              background: filter === c.value ? (CATEGORY_COLORS[c.value] || C.jade) + "20" : C.bg,
              color: filter === c.value ? (CATEGORY_COLORS[c.value] || C.jade) : C.sec,
            }}
          >
            {c.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {["all", "v1", "v2"].map(v => (
            <button
              key={v}
              onClick={() => setVersionFilter(v)}
              style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
                background: versionFilter === v ? C.purple + "20" : C.bg,
                color: versionFilter === v ? C.purple : C.sec,
              }}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Rules Table */}
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {filtered.map(rule => {
          const catColor = CATEGORY_COLORS[rule.category] || C.sec;
          const isEditing = editingId === rule.id;

          return (
            <div key={rule.id} style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 6,
              background: C.bg, border: `1px solid ${C.border}`,
              opacity: rule.is_active ? 1 : 0.5,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: catColor + "18", color: catColor, textTransform: "uppercase" }}>
                  {rule.category.replace("_", " ")}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 3, background: rule.version === "v2" ? C.jade + "15" : C.amber + "15", color: rule.version === "v2" ? C.jade : C.amber }}>
                  {rule.version}
                </span>
                <span style={{ fontSize: 9, color: C.sec }}>P{rule.priority}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1 }}>{rule.rule_name}</span>
                <button onClick={() => { if (isEditing) { setEditingId(null); } else { setEditingId(rule.id); setEditText(rule.rule_text); setEditPriority(rule.priority); } }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.sec, padding: 2 }}>
                  {isEditing ? <X size={12} /> : <Pencil size={12} />}
                </button>
                <button onClick={() => toggleRule(rule)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                  {rule.is_active ? <ToggleRight size={16} color={C.jade} /> : <ToggleLeft size={16} color={C.muted} />}
                </button>
              </div>

              {isEditing ? (
                <div>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)}
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11, resize: "vertical", minHeight: 60, outline: "none", fontFamily: "'DM Sans', sans-serif" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: C.sec }}>Priority:</span>
                    <input type="number" value={editPriority} onChange={e => setEditPriority(+e.target.value)} min={1} max={10}
                      style={{ width: 50, padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11, outline: "none" }}
                    />
                    <button onClick={() => saveEdit(rule)} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: C.jade, color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <Check size={10} /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.sec, lineHeight: 1.4 }}>{rule.rule_text}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add New Rule */}
      {showAdd ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: C.sec, marginBottom: 2 }}>Category</div>
              <select value={newRule.category} onChange={e => setNewRule(p => ({ ...p, category: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11, outline: "none" }}>
                {CATEGORIES.filter(c => c.value !== "all").map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.sec, marginBottom: 2 }}>Priority (1-10)</div>
              <input type="number" value={newRule.priority} onChange={e => setNewRule(p => ({ ...p, priority: +e.target.value }))} min={1} max={10}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11, outline: "none" }} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 2 }}>Rule Name</div>
            <input value={newRule.rule_name} onChange={e => setNewRule(p => ({ ...p, rule_name: e.target.value }))} placeholder="e.g. Momentum Divergence"
              style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11, outline: "none" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.sec, marginBottom: 2 }}>Rule Description</div>
            <textarea value={newRule.rule_text} onChange={e => setNewRule(p => ({ ...p, rule_text: e.target.value }))} placeholder="Describe the rule logic..."
              style={{ width: "100%", padding: 8, borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 11, resize: "vertical", minHeight: 60, outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addRule} style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", background: C.jade, color: "#fff", fontSize: 11, fontWeight: 600 }}>Add Rule</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.border}`, cursor: "pointer", background: C.card, color: C.sec, fontSize: 11, fontWeight: 600 }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{
          marginTop: 12, padding: "8px 16px", borderRadius: 8, border: `1px dashed ${C.border}`, cursor: "pointer",
          background: "transparent", color: C.sec, fontSize: 12, fontWeight: 600, width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
          <Plus size={12} /> Add New Rule
        </button>
      )}
    </div>
  );
}
