import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/mock-data";
import { toast } from "sonner";

interface Settings {
  enabled: boolean;
  execution_path: "metaapi" | "pineconnector" | "signal_only";
  symbols: string[];
  timeframe: string;
  risk_usd: number;
  rr_tp1: number; rr_tp2: number; rr_tp3: number; be_r: number;
  pct1: number; pct2: number;
  pineconnector_license: string | null;
  pineconnector_webhook_url: string | null;
  pineconnector_risk: number;
}

const DEFAULTS: Settings = {
  enabled: false, execution_path: "signal_only", symbols: ["XAUUSD"], timeframe: "15m",
  risk_usd: 200, rr_tp1: 1.5, rr_tp2: 3.0, rr_tp3: 5.0, be_r: 1.0, pct1: 33, pct2: 33,
  pineconnector_license: "", pineconnector_webhook_url: "", pineconnector_risk: 0.5,
};

export default function StrategyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setUserId(session.user.id);
      const { data } = await supabase.from("falconer_settings").select("*").eq("user_id", session.user.id).maybeSingle();
      if (data) setS({ ...DEFAULTS, ...(data as any) });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("falconer_settings").upsert({
      user_id: userId, ...s, updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Strategy settings saved");
  };

  if (loading) return <div style={{ padding: 24, color: C.sec }}>Loading…</div>;

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Strategy · Falconer v7 TP3</h1>
      <p style={{ color: C.sec, fontSize: 13, marginBottom: 24 }}>
        Longs only · 33/33/34 scaled TPs at 1.5R/3R/5R · breakeven at 1R · HA-flip exit.
      </p>

      <Section title="Engine">
        <Row label="Enabled">
          <input type="checkbox" checked={s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} />
        </Row>
        <Row label="Execution Path">
          <select value={s.execution_path} onChange={e => setS({ ...s, execution_path: e.target.value as Settings["execution_path"] })} style={inp}>
            <option value="signal_only">Signal only (UI alerts)</option>
            <option value="metaapi">MetaApi (auto execute)</option>
            <option value="pineconnector">PineConnector webhook</option>
          </select>
        </Row>
        <Row label="Timeframe">
          <select value={s.timeframe} onChange={e => setS({ ...s, timeframe: e.target.value })} style={inp}>
            <option value="15m">15m</option><option value="1h">1h</option><option value="4h">4h</option>
          </select>
        </Row>
        <Row label="Symbols (comma-separated)">
          <input value={s.symbols.join(",")} onChange={e => setS({ ...s, symbols: e.target.value.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) })} style={inp} />
        </Row>
      </Section>

      <Section title="Risk">
        <Row label="Risk per Trade (USD)"><input type="number" value={s.risk_usd} onChange={e => setS({ ...s, risk_usd: +e.target.value })} style={inp} /></Row>
        <Row label="TP1 R"><input type="number" step={0.1} value={s.rr_tp1} onChange={e => setS({ ...s, rr_tp1: +e.target.value })} style={inp} /></Row>
        <Row label="TP2 R"><input type="number" step={0.1} value={s.rr_tp2} onChange={e => setS({ ...s, rr_tp2: +e.target.value })} style={inp} /></Row>
        <Row label="TP3 R"><input type="number" step={0.1} value={s.rr_tp3} onChange={e => setS({ ...s, rr_tp3: +e.target.value })} style={inp} /></Row>
        <Row label="BE at R"><input type="number" step={0.1} value={s.be_r} onChange={e => setS({ ...s, be_r: +e.target.value })} style={inp} /></Row>
        <Row label="TP1 %"><input type="number" value={s.pct1} onChange={e => setS({ ...s, pct1: +e.target.value })} style={inp} /></Row>
        <Row label="TP2 %"><input type="number" value={s.pct2} onChange={e => setS({ ...s, pct2: +e.target.value })} style={inp} /></Row>
      </Section>

      {s.execution_path === "pineconnector" && (
        <Section title="PineConnector (Eightcap MT5)">
          <Row label="License ID"><input value={s.pineconnector_license ?? ""} onChange={e => setS({ ...s, pineconnector_license: e.target.value })} style={inp} placeholder="REPLACE_WITH_YOUR_LICENSE_ID" /></Row>
          <Row label="Webhook URL"><input value={s.pineconnector_webhook_url ?? ""} onChange={e => setS({ ...s, pineconnector_webhook_url: e.target.value })} style={inp} placeholder="https://..." /></Row>
          <Row label="PC Risk %"><input type="number" step={0.1} value={s.pineconnector_risk} onChange={e => setS({ ...s, pineconnector_risk: +e.target.value })} style={inp} /></Row>
        </Section>
      )}

      <button onClick={save} disabled={saving} style={{
        marginTop: 16, padding: "10px 20px", borderRadius: 8, border: "none",
        cursor: saving ? "wait" : "pointer", background: C.jade, color: "#000", fontWeight: 700, fontSize: 13,
      }}>{saving ? "Saving…" : "Save Settings"}</button>
    </div>
  );
}

const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 6, background: "#0F172A", border: "1px solid #1E293B", color: "#E2E8F0", fontSize: 12, width: "100%" };
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "center", marginBottom: 10 }}>
    <span style={{ fontSize: 12, color: C.sec }}>{label}</span>{children}
  </div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 24, padding: 16, border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg2 }}>
    <h2 style={{ fontSize: 13, fontWeight: 700, color: C.jade, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{title}</h2>
    {children}
  </div>;
}
