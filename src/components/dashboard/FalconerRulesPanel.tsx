import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Plus, ToggleLeft, ToggleRight, Pencil, X, Check, Sparkles, CheckCircle2 } from "lucide-react";

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

const WELCOME_KEY = "ge_ron_rules_welcome_dismissed";

const VERSION_COPY: Record<RonRulesVersion, {
  title: string;
  eyebrow: string;
  summary: string;
  description: string;
  badge: string;
}> = {
  v1: {
    title: "RON V1 Legacy",
    eyebrow: "Premium Trading Vision",
    summary: "Historical win rate: 82% across 2,600+ backtested trades.",
    description: "Our proven flagship strategy with consistent high-probability signals. Refined over years of live market analysis.",
    badge: "Recommended for all traders",
  },
  v2: {
    title: "RON V2 Knowledge Base",
    eyebrow: "Experimental",
    summary: "Currently in development — ~50% WR.",
    description: "Advanced AI model incorporating Smart Money Concepts and live market structure. Improves as more platform data flows through RON.",
    badge: "Use with caution. Best for experienced traders",
  },
};

function RonRulesVersionCard({
  version,
  active,
  onClick,
}: {
  version: RonRulesVersion;
  active: boolean;
  onClick: () => void;
}) {
  const copy = VERSION_COPY[version];

  return (
    <button
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-2xl border text-left transition-all duration-300 ${
        active
          ? "scale-100 border-primary/50 bg-card px-4 py-4 opacity-100 shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_0_24px_hsl(var(--primary)/0.22),0_0_48px_hsl(var(--primary)/0.14)]"
          : "scale-[0.92] border-border bg-background/60 px-3 py-3 opacity-60 hover:opacity-80"
      }`}
      aria-pressed={active}
    >
      {active && (
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/15 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-primary animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Active
        </div>
      )}

      <div className="pr-16">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-xl border p-2 ${active ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground"}`}>
            {version === "v1" ? <Sparkles className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className={`font-bold tracking-wide ${active ? "text-[15px] text-foreground" : "text-[12px] text-foreground"}`}>
                {version === "v1" ? "✨" : "🧠"} {copy.title}
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
                version === "v1"
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-muted bg-secondary text-muted-foreground"
              }`}>
                {copy.eyebrow}
              </span>
            </div>

            <div className="mt-2 text-[11px] font-semibold text-foreground">
              {copy.summary}
            </div>
            <p className={`mt-2 leading-relaxed ${active ? "text-[11px] text-muted-foreground" : "text-[10px] text-muted-foreground"}`}>
              {copy.description}
            </p>

            <div className="mt-3">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] ${
                version === "v1"
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-300"
              }`}>
                {copy.badge}
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
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
  const [showWelcome, setShowWelcome] = useState(false);

  // Persist UI state
  useEffect(() => {
    localStorage.setItem("ge_ron_rules_ui", JSON.stringify({ filter, versionFilter, aiVersion }));
  }, [filter, versionFilter, aiVersion]);

  useEffect(() => {
    if (!localStorage.getItem(WELCOME_KEY)) {
      setShowWelcome(true);
    }
  }, []);

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    const { data } = await supabase.from("falconer_knowledge").select("*").order("priority", { ascending: false });
    if (data) setRules(data as KnowledgeRule[]);
    setLoading(false);
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

  const switchVersion = (ver: RonRulesVersion) => {
    setAiVersion(ver);
    setVersionFilter(ver);
    toast.success(`RON switched to ${ver === "v2" ? "V2 (Knowledge Base)" : "V1 (Legacy)"}`);
  };

  const dismissWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem(WELCOME_KEY, "1");
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
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>RON&nbsp; Your Expert Trading Buddy</span>
        <span style={{ fontSize: 11, color: C.sec, marginLeft: "auto" }}>{v2Active}/{v2Total} V2 rules active</span>
      </div>

      <div className="mb-4 space-y-3">
        {showWelcome && (
          <div className="relative rounded-xl border border-primary/25 bg-primary/10 px-3 py-3">
            <button
              onClick={dismissWelcome}
              className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss welcome banner"
            >
              <X size={12} />
            </button>
            <p className="pr-6 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Welcome!</span> We've set you up with{" "}
              <span className="font-semibold text-primary">RON V1 Legacy</span> — our proven premium strategy.
              You can explore V2 Knowledge Base anytime, but V1 is recommended while you get familiar.
            </p>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-border bg-background/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            RON Version
          </div>

          <div className="space-y-3">
            <RonRulesVersionCard
              version="v1"
              active={aiVersion === "v1"}
              onClick={() => switchVersion("v1")}
            />
            <RonRulesVersionCard
              version="v2"
              active={aiVersion === "v2"}
              onClick={() => switchVersion("v2")}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {aiVersion === "v1" ? "V1 Rules Currently Applied" : "V2 Rules Currently Applied"}
        </div>
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
