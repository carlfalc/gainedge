import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { X, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Instrument {
  symbol: string;
  enabled: boolean;
}

export function SignalAlertSettingsModal({ open, onClose }: Props) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [minConfidence, setMinConfidence] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadSettings();
  }, [open]);

  const loadSettings = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Load user instruments
    const { data: userInst } = await supabase
      .from("user_instruments")
      .select("symbol")
      .eq("user_id", session.user.id);

    // Load existing preferences
    const { data: prefs } = await supabase
      .from("user_signal_preferences")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const filters: Record<string, boolean> = (prefs?.instrument_filters as Record<string, boolean>) || {};
    const syms = (userInst || []).map((i: any) => i.symbol);
    setInstruments(syms.map(s => ({ symbol: s, enabled: filters[s] !== false })));
    setMinConfidence(prefs?.min_confidence ?? 5);
  };

  const toggleInstrument = (symbol: string) => {
    setInstruments(prev => prev.map(i => i.symbol === symbol ? { ...i, enabled: !i.enabled } : i));
  };

  const save = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }

    const filters: Record<string, boolean> = {};
    instruments.forEach(i => { filters[i.symbol] = i.enabled; });

    await supabase.from("user_signal_preferences").upsert({
      user_id: session.user.id,
      instrument_filters: filters,
      min_confidence: minConfidence,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    setSaving(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div style={{
        position: "relative", background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 28, width: 420, maxHeight: "80vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Settings size={18} color={C.amber} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Signal Alert Settings</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color={C.sec} />
          </button>
        </div>

        {/* Instrument Toggles */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sec, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Active Instruments
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {instruments.map(inst => (
              <div key={inst.symbol} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: C.bg2, borderRadius: 10,
                border: `1px solid ${inst.enabled ? C.jade + "40" : C.border}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: inst.enabled ? C.text : C.muted }}>
                  {inst.symbol}
                </span>
                <Switch checked={inst.enabled} onCheckedChange={() => toggleInstrument(inst.symbol)} />
              </div>
            ))}
          </div>
        </div>

        {/* Min Confidence */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sec, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Minimum Confidence Threshold
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Slider
              value={[minConfidence]}
              onValueChange={v => setMinConfidence(v[0])}
              min={1} max={10} step={1}
              className="flex-1"
            />
            <span style={{ fontSize: 16, fontWeight: 700, color: C.jade, minWidth: 28, textAlign: "center" }}>
              {minConfidence}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            Only signals with confidence ≥ {minConfidence} will be generated
          </div>
        </div>

        {/* Coming Soon toggles */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sec, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Automation
          </div>
          {[
            { label: "Auto-place limit orders", desc: "Automatically place orders on your broker account" },
            { label: "Auto-set TP/SL on chart", desc: "Draw TP/SL levels on the chart automatically" },
          ].map(item => (
            <div key={item.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", background: C.bg2, borderRadius: 10, marginBottom: 8,
              border: `1px solid ${C.border}`, opacity: 0.5,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{item.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{item.desc}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: C.amber, background: C.amber + "20",
                  padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                }}>Coming Soon</span>
                <Switch disabled checked={false} />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            width: "100%", padding: "12px 0", background: C.jade, color: "#000",
            fontWeight: 700, fontSize: 14, borderRadius: 10, border: "none", cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
