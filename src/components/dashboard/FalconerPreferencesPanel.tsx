import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Zap, Cpu, BookOpen } from "lucide-react";

interface SignalPrefs {
  id?: string;
  min_confidence: number;
  instrument_filters: Record<string, boolean>;
  currency: string;
  lot_size: number;
}

const SIGNAL_STYLES = [
  { value: "conservative", label: "Conservative", desc: "High conviction only (confidence ≥ 8)", minConf: 8 },
  { value: "balanced", label: "Balanced", desc: "Standard signals (confidence ≥ 6)", minConf: 6 },
  { value: "aggressive", label: "Aggressive", desc: "All signals (confidence ≥ 4)", minConf: 4 },
];

export default function FalconerPreferencesPanel() {
  const [prefs, setPrefs] = useState<SignalPrefs>({ min_confidence: 6, instrument_filters: {}, currency: "NZD", lot_size: 0.01 });
  const [instruments, setInstruments] = useState<string[]>([]);
  const [notifications, setNotifications] = useState(true);
  const [style, setStyle] = useState("balanced");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [signalEngine, setSignalEngine] = useState("v1v2");

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const uid = session.user.id;
    setUserId(uid);

    const [instRes, prefRes, profileRes] = await Promise.all([
      supabase.from("user_instruments").select("symbol").eq("user_id", uid),
      supabase.from("user_signal_preferences").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("profiles").select("push_notifications").eq("id", uid).single(),
    ]);

    const syms = (instRes.data || []).map(d => d.symbol);
    setInstruments(syms);
    if (profileRes.data) setNotifications(profileRes.data.push_notifications);

    if (prefRes.data) {
      const p = prefRes.data;
      const filters = (typeof p.instrument_filters === "object" && p.instrument_filters !== null ? p.instrument_filters : {}) as Record<string, boolean>;
      setPrefs({ id: p.id, min_confidence: p.min_confidence, instrument_filters: filters, currency: p.currency, lot_size: p.lot_size });
      setSignalEngine((p as any).signal_engine || "v1v2");
      // Determine style from min_confidence
      const matched = SIGNAL_STYLES.find(s => s.minConf === p.min_confidence);
      setStyle(matched?.value || "balanced");
    } else {
      // Default: all instruments enabled
      const defaultFilters: Record<string, boolean> = {};
      syms.forEach(s => defaultFilters[s] = true);
      setPrefs(prev => ({ ...prev, instrument_filters: defaultFilters }));
    }
  };

  const handleStyleChange = (val: string) => {
    setStyle(val);
    const s = SIGNAL_STYLES.find(x => x.value === val);
    if (s) setPrefs(prev => ({ ...prev, min_confidence: s.minConf }));
  };

  const toggleInstrument = (sym: string) => {
    setPrefs(prev => ({
      ...prev,
      instrument_filters: { ...prev.instrument_filters, [sym]: !prev.instrument_filters[sym] },
    }));
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      // Save signal preferences
      const payload: any = {
        user_id: userId,
        min_confidence: prefs.min_confidence,
        instrument_filters: prefs.instrument_filters,
        currency: prefs.currency,
        lot_size: prefs.lot_size,
        signal_engine: signalEngine,
      };

      if (prefs.id) {
        await supabase.from("user_signal_preferences").update(payload).eq("id", prefs.id);
      } else {
        const { data } = await supabase.from("user_signal_preferences").insert(payload).select().single();
        if (data) setPrefs(prev => ({ ...prev, id: data.id }));
      }

      // Save notification toggle
      await supabase.from("profiles").update({ push_notifications: notifications }).eq("id", userId);
      toast.success("AI preferences saved");
    } catch (e: any) {
      toast.error("Failed to save preferences");
    }
    setSaving(false);
  };

  const enabledCount = Object.values(prefs.instrument_filters).filter(Boolean).length;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Brain size={16} color={C.jade} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.jade }}>RON Preferences</span>
      </div>

      {/* AI Signal Notifications */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>AI Signal Notifications</div>
          <div style={{ fontSize: 11, color: C.sec }}>Receive trade signals from RON</div>
        </div>
        <div
          onClick={() => setNotifications(!notifications)}
          style={{
            width: 40, height: 22, borderRadius: 11, cursor: "pointer",
            background: notifications ? C.jade : C.muted + "40",
            padding: 2, transition: "all 0.2s",
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transform: notifications ? "translateX(18px)" : "translateX(0)",
            transition: "transform 0.2s",
          }} />
        </div>
      </div>

      {/* Signal Style */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginBottom: 6 }}>Signal Style</div>
        <div style={{ display: "flex", gap: 6 }}>
          {SIGNAL_STYLES.map(s => (
            <button
              key={s.value}
              onClick={() => handleStyleChange(s.value)}
              style={{
                flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", cursor: "pointer",
                background: style === s.value ? C.jade + "20" : C.bg,
                color: style === s.value ? C.jade : C.sec,
                fontSize: 11, fontWeight: 600, transition: "all 0.2s",
              }}
            >
              <div>{s.label}</div>
              <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Signal Engine Toggle */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginBottom: 6 }}>Signal Engine</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { value: "v1", label: "V1 (Legacy)", desc: "EMA crossovers, RSI, ATR", icon: <Cpu size={12} /> },
            { value: "v2", label: "V2 (Knowledge)", desc: "SMC, CHOCH, Order Blocks", icon: <BookOpen size={12} /> },
            { value: "v1v2", label: "V1 + V2 Combined", desc: "Both engines active", icon: null },
          ].map(opt => {
            const active = signalEngine === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setSignalEngine(opt.value)}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: active ? C.jade + "20" : C.bg,
                  color: active ? C.jade : C.sec,
                  fontSize: 11, fontWeight: 600, transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>{opt.icon}{opt.label}</div>
                <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Minimum Confidence Slider */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: C.sec, fontWeight: 600 }}>Minimum Signal Confidence</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.jade, fontFamily: "'JetBrains Mono', monospace" }}>{prefs.min_confidence}/10</span>
        </div>
        <input
          type="range" min={1} max={10} value={prefs.min_confidence}
          onChange={e => {
            const val = +e.target.value;
            setPrefs(prev => ({ ...prev, min_confidence: val }));
            const matched = SIGNAL_STYLES.find(s => s.minConf === val);
            if (matched) setStyle(matched.value);
            else setStyle("custom");
          }}
          style={{ width: "100%", accentColor: C.jade }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.muted }}>
          <span>Aggressive</span><span>Conservative</span>
        </div>
      </div>

      {/* Instruments for Signals */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginBottom: 6 }}>Instruments for Signals ({enabledCount}/{instruments.length})</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {instruments.map(sym => {
            const active = prefs.instrument_filters[sym] !== false;
            return (
              <button
                key={sym}
                onClick={() => toggleInstrument(sym)}
                style={{
                  padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: active ? C.jade + "20" : C.bg,
                  color: active ? C.jade : C.muted,
                  fontSize: 11, fontWeight: 600, transition: "all 0.2s",
                  textDecoration: active ? "none" : "line-through",
                }}
              >
                {sym}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer",
          background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg,
          fontSize: 12, fontWeight: 700, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
      >
        <Zap size={12} /> {saving ? "Saving..." : "Save AI Preferences"}
      </button>
    </div>
  );
}
