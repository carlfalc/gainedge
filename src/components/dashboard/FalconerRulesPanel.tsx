import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Plus, ToggleLeft, ToggleRight, Pencil, X, Check, Sparkles, Loader2, CheckCircle2 } from "lucide-react";

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
  { value: "pattern_rules", label: "Patterns" },
];

const CATEGORY_COLORS: Record<string, string> = {
  entry_rules: C.jade,
  no_trade_rules: C.red,
  risk_management: C.amber,
  exit_rules: C.blue,
  session_rules: C.purple,
  market_structure: C.teal,
  pattern_rules: C.blue,
};

type RonRulesVersion = "v1" | "v2";
type SaveState = "idle" | "saving" | "saved" | "error";

const WELCOME_KEY = "ge_ron_rules_welcome_dismissed";

const VERSION_COPY: Record<RonRulesVersion, {
  title: string; eyebrow: string; summary: string; description: string; badge: string;
}> = {
  v1: {
    title: "RON V1 Legacy", eyebrow: "Premium Trading Vision",
    summary: "Historical win rate: 82% across 2,600+ backtested trades.",
    description: "Our proven flagship strategy with consistent high-probability signals. Refined over years of live market analysis.",
    badge: "Recommended for all traders",
  },
  v2: {
    title: "RON V2 Knowledge Base", eyebrow: "Experimental",
    summary: "Currently in development — ~50% WR.",
    description: "Advanced AI model incorporating Smart Money Concepts and live market structure. Improves as more platform data flows through RON.",
    badge: "Use with caution. Best for experienced traders",
  },
};

function formatRelative(ts: number | null): string {
  if (!ts) return "never";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function FalconerRulesPanel() {
  const loadSavedUiState = () => {
    try {
      const raw = localStorage.getItem("ge_ron_rules_ui");
      if (raw) return JSON.parse(raw) as { filter: string; versionFilter: string; aiVersion: RonRulesVersion };
    } catch {}
    return { filter: "all", versionFilter: "v1", aiVersion: "v1" as const };
  };
  const savedUi = loadSavedUiState();

  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(savedUi.filter);
  const [versionFilter, setVersionFilter] = useState(savedUi.versionFilter);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState(5);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({ category: "entry_rules", rule_name: "", rule_text: "", priority: 7 });
  const [aiVersion, setAiVersion] = useState<RonRulesVersion>(savedUi.aiVersion);

  // Save-state tracking — per-rule spinner / ✓ saved
  const [ruleSaveState, setRuleSaveState] = useState<Record<string, SaveState>>({});
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const inflightCount = useRef(0);

  // Persist UI state
  useEffect(() => {
    localStorage.setItem("ge_ron_rules_ui", JSON.stringify({ filter, versionFilter, aiVersion }));
  }, [filter, versionFilter, aiVersion]);

  useEffect(() => { loadRules(); }, []);

  // Tick "Last saved" relative time every 30s
  useEffect(() => {
    const iv = setInterval(() => forceTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  // Warn on unload if saves in flight
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (inflightCount.current > 0) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Leave anyway?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const loadRules = async () => {
    const { data } = await supabase.from("falconer_knowledge").select("*").order("priority", { ascending: false });
    if (data) setRules(data as KnowledgeRule[]);
    setLoading(false);
  };

  const setSaveStateFor = (ruleId: string, state: SaveState) => {
    setRuleSaveState(prev => ({ ...prev, [ruleId]: state }));
    if (state === "saved") {
      setTimeout(() => {
        setRuleSaveState(prev => {
          if (prev[ruleId] !== "saved") return prev;
          const { [ruleId]: _, ...rest } = prev;
          return rest;
        });
      }, 2000);
    }
  };

  // Generic edge-function call with optimistic update + revert on failure
  const callEdge = async (body: Record<string, unknown>): Promise<boolean> => {
    inflightCount.current += 1;
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-signal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      return true;
    } catch (e) {
      throw e;
    } finally {
      inflightCount.current = Math.max(0, inflightCount.current - 1);
    }
  };

  const toggleRule = useCallback(async (rule: KnowledgeRule) => {
    const prev = rule.is_active;
    const next = !prev;
    // Optimistic
    setRules(rs => rs.map(r => r.id === rule.id ? { ...r, is_active: next } : r));
    setSaveStateFor(rule.id, "saving");
    try {
      await callEdge({ action: "toggle_rule", rule_id: rule.id, is_active: next });
      setSaveStateFor(rule.id, "saved");
      setLastSavedAt(Date.now());
      toast.success("✓ Rule saved", { duration: 2000, position: "bottom-right" });
    } catch (e: unknown) {
      // Revert
      setRules(rs => rs.map(r => r.id === rule.id ? { ...r, is_active: prev } : r));
      setSaveStateFor(rule.id, "error");
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Failed to save rule — ${msg}`, {
        position: "bottom-right",
        action: { label: "Retry", onClick: () => toggleRule({ ...rule, is_active: prev }) },
      });
    }
  }, []);

  const saveEdit = useCallback(async (rule: KnowledgeRule) => {
    const prevText = rule.rule_text;
    const prevPriority = rule.priority;
    const newText = editText;
    const newPriority = editPriority;
    // Optimistic
    setRules(rs => rs.map(r => r.id === rule.id ? { ...r, rule_text: newText, priority: newPriority } : r));
    setEditingId(null);
    setSaveStateFor(rule.id, "saving");
    try {
      await callEdge({ action: "edit_rule", rule_id: rule.id, rule_text: newText, priority: newPriority });
      setSaveStateFor(rule.id, "saved");
      setLastSavedAt(Date.now());
      toast.success("✓ Rule saved", { duration: 2000, position: "bottom-right" });
    } catch (e: unknown) {
      setRules(rs => rs.map(r => r.id === rule.id ? { ...r, rule_text: prevText, priority: prevPriority } : r));
      setSaveStateFor(rule.id, "error");
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Failed to save rule — ${msg}`, {
        position: "bottom-right",
        action: {
          label: "Retry",
          onClick: () => {
            setEditingId(rule.id);
            setEditText(newText);
            setEditPriority(newPriority);
          },
        },
      });
    }
  }, [editText, editPriority]);

  const addRule = useCallback(async () => {
    if (!newRule.rule_name || !newRule.rule_text) {
      toast.error("Fill in all fields", { position: "bottom-right" });
      return;
    }
    inflightCount.current += 1;
    const tempToast = toast.loading("Saving rule…", { position: "bottom-right" });
    try {
      await callEdge({ action: "add_rule", ...newRule });
      toast.success("✓ Rule added", { id: tempToast, duration: 2000, position: "bottom-right" });
      setShowAdd(false);
      setNewRule({ category: "entry_rules", rule_name: "", rule_text: "", priority: 7 });
      setLastSavedAt(Date.now());
      loadRules();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Failed to add rule — ${msg}`, {
        id: tempToast,
        position: "bottom-right",
        action: { label: "Retry", onClick: () => addRule() },
      });
    } finally {
      inflightCount.current = Math.max(0, inflightCount.current - 1);
    }
  }, [newRule]);

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Brain size={16} color={C.purple} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>RON Rules Management</span>
        <span style={{ fontSize: 11, color: C.sec, marginLeft: "auto" }}>{v2Active}/{v2Total} V2 rules active</span>
      </div>
      <div style={{ fontSize: 10, color: C.sec, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
        {inflightCount.current > 0 ? (
          <>
            <Loader2 size={10} className="animate-spin" style={{ color: C.amber }} />
            <span style={{ color: C.amber }}>Saving…</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={10} style={{ color: C.jade }} />
            <span>Last saved: {formatRelative(lastSavedAt)}</span>
          </>
        )}
        <span style={{ marginLeft: "auto", opacity: 0.6 }}>All changes auto-save to database</span>
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
          const saveState = ruleSaveState[rule.id] || "idle";

          return (
            <div key={rule.id} style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 6,
              background: C.bg,
              border: `1px solid ${saveState === "error" ? C.red : saveState === "saved" ? C.jade : C.border}`,
              opacity: rule.is_active ? 1 : 0.5,
              transition: "border-color 0.3s",
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

                {/* Save-state badge */}
                {saveState === "saving" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: C.amber }}>
                    <Loader2 size={10} className="animate-spin" /> Saving…
                  </span>
                )}
                {saveState === "saved" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: C.jade }}>
                    <Check size={10} /> Saved
                  </span>
                )}
                {saveState === "error" && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: C.red }}>
                    <X size={10} /> Failed
                  </span>
                )}

                <button onClick={() => { if (isEditing) { setEditingId(null); } else { setEditingId(rule.id); setEditText(rule.rule_text); setEditPriority(rule.priority); } }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.sec, padding: 2 }}>
                  {isEditing ? <X size={12} /> : <Pencil size={12} />}
                </button>
                <button
                  onClick={() => toggleRule(rule)}
                  disabled={saveState === "saving"}
                  style={{ background: "none", border: "none", cursor: saveState === "saving" ? "wait" : "pointer", padding: 2, opacity: saveState === "saving" ? 0.5 : 1 }}
                >
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
