import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { User, Bell, Sliders, CreditCard, AlertTriangle, Key, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function SettingsPage() {
  const { profile, loading, updateProfile, userId } = useProfile();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timeframe, setTimeframe] = useState("15");
  const [candle, setCandle] = useState("heiken_ashi");
  const [emaFast, setEmaFast] = useState("4");
  const [emaSlow, setEmaSlow] = useState("17");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [broker, setBroker] = useState("eightcap");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiLastUsed, setApiLastUsed] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name || "");
      setTimeframe(profile.default_timeframe);
      setCandle(profile.default_candle_type);
      setEmaFast(String(profile.ema_fast));
      setEmaSlow(String(profile.ema_slow));
      setEmailAlerts(profile.email_alerts);
      setPushAlerts(profile.push_notifications);
      setSmsAlerts(profile.sms_alerts);
      setBroker(profile.broker);
    }
  }, [profile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setEmail(session.user.email || "");
    });
    if (userId) {
      supabase.from("user_instruments").select("symbol").eq("user_id", userId).then(({ data }) => {
        if (data) setInstruments(data.map(d => d.symbol));
      });
      supabase.from("api_keys").select("key, last_used_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).then(({ data }) => {
        if (data && data.length > 0) {
          setApiKey(data[0].key);
          setApiLastUsed(data[0].last_used_at);
        }
      });
    }
  }, [userId]);

  const handleSave = async () => {
    await updateProfile({
      full_name: name,
      default_timeframe: timeframe,
      default_candle_type: candle,
      ema_fast: parseInt(emaFast),
      ema_slow: parseInt(emaSlow),
      email_alerts: emailAlerts,
      push_notifications: pushAlerts,
      sms_alerts: smsAlerts,
      broker,
    });
    toast.success("Settings saved");
  };

  if (loading) return <div style={{ color: C.sec }}>Loading...</div>;

  const tierLabel = profile?.subscription_tier === "elite" ? "Elite" : profile?.subscription_tier === "trader" ? "Trader" : "Scout";
  const statusLabel = profile?.subscription_status === "active" ? "ACTIVE" : profile?.subscription_status === "trial" ? "TRIAL" : profile?.subscription_status?.toUpperCase();

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 24 }}>Settings</h1>

      <Section icon={<User size={16} color={C.jade} />} title="Profile">
        <Field label="Full Name">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Email">
          <input value={email} disabled style={{ ...inputStyle, opacity: 0.5 }} />
        </Field>
      </Section>

      <Section icon={<Sliders size={16} color={C.blue} />} title="Instruments">
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 8 }}>Current watchlist ({instruments.length}/10 — {tierLabel} tier):</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {instruments.map(i => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: C.jade + "18", color: C.jade }}>{i}</span>
          ))}
        </div>
        <button style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>+ Add Instrument</button>
      </Section>

      <Section icon={<Sliders size={16} color={C.purple} />} title="Preferences">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Default Timeframe">
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={inputStyle}>
              {["1", "5", "15", "30", "60", "240", "1440"].map(t => <option key={t} value={t}>{t === "60" ? "1h" : t === "240" ? "4h" : t === "1440" ? "1D" : t + "m"}</option>)}
            </select>
          </Field>
          <Field label="Candle Type">
            <select value={candle} onChange={e => setCandle(e.target.value)} style={inputStyle}>
              <option value="heiken_ashi">Heiken Ashi</option>
              <option value="standard">Standard</option>
              <option value="renko">Renko</option>
            </select>
          </Field>
          <Field label="EMA Fast Period">
            <input value={emaFast} onChange={e => setEmaFast(e.target.value)} style={inputStyle} type="number" />
          </Field>
          <Field label="EMA Slow Period">
            <input value={emaSlow} onChange={e => setEmaSlow(e.target.value)} style={inputStyle} type="number" />
          </Field>
        </div>
      </Section>

      <Section icon={<Bell size={16} color={C.amber} />} title="Notifications">
        <Toggle label="Email Alerts" checked={emailAlerts} onChange={setEmailAlerts} />
        <Toggle label="Push Notifications" checked={pushAlerts} onChange={setPushAlerts} />
        <Toggle label="SMS Alerts" checked={smsAlerts} onChange={setSmsAlerts} />
      </Section>

      <Section icon={<Sliders size={16} color={C.orange} />} title="Broker">
        <Field label="Select Broker">
          <select value={broker} onChange={e => setBroker(e.target.value)} style={inputStyle}>
            <option value="eightcap">Eightcap</option>
            <option value="icmarkets">IC Markets</option>
            <option value="pepperstone">Pepperstone</option>
            <option value="oanda">OANDA</option>
          </select>
        </Field>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Used for correct symbol mapping.</div>
      </Section>

      <Section icon={<Key size={16} color={C.cyan} />} title="API Access">
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>Use this key to connect your Claude Code analysis engine to GAINEDGE.</div>
        {apiKey ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input
                readOnly
                value={apiKeyVisible ? apiKey : "•".repeat(32)}
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flex: 1 }}
              />
              <button onClick={() => setApiKeyVisible(!apiKeyVisible)} style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec, padding: "9px 10px" }}>
                {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button onClick={() => { navigator.clipboard.writeText(apiKey); toast.success("API key copied"); }} style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec, padding: "9px 10px" }}>
                <Copy size={14} />
              </button>
            </div>
            {apiLastUsed && <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Last used: {new Date(apiLastUsed).toLocaleString()}</div>}
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>No API key generated yet.</div>
        )}
        <button
          disabled={generatingKey}
          onClick={async () => {
            if (!userId) return;
            setGeneratingKey(true);
            const newKey = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
            if (apiKey) {
              await supabase.from("api_keys").delete().eq("user_id", userId);
            }
            await supabase.from("api_keys").insert({ user_id: userId, key: newKey });
            setApiKey(newKey);
            setApiKeyVisible(true);
            setApiLastUsed(null);
            setGeneratingKey(false);
            toast.success("New API key generated");
          }}
          style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec, display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={12} /> {apiKey ? "Regenerate Key" : "Generate API Key"}
        </button>
      </Section>

      <Section icon={<CreditCard size={16} color={C.jade} />} title="Subscription">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{tierLabel} Plan</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: C.jade + "20", color: C.jade }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>
          {profile?.subscription_tier === "trader" ? "$59/mo • 10 instruments • Real-time signals" : profile?.subscription_tier === "elite" ? "$129/mo • Unlimited instruments • Priority AI" : "Free • 3 instruments • Daily signals"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg }}>Upgrade to Elite</button>
          <button style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>Downgrade</button>
        </div>
      </Section>

      <button onClick={handleSave} style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg, padding: "12px 32px", fontSize: 14, marginBottom: 16 }}>
        Save All Settings
      </button>

      <Section icon={<AlertTriangle size={16} color={C.red} />} title="Danger Zone">
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>This action cannot be undone. All data will be permanently deleted.</div>
        <button style={{ ...btnStyle, background: C.red + "20", color: C.red, border: `1px solid ${C.red}30` }}>Delete Account</button>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon}
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.sec, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
      <span style={{ fontSize: 13, color: C.text }}>{label}</span>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11, cursor: "pointer",
          background: checked ? C.jade : C.muted + "40",
          padding: 2, transition: "all 0.2s",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.2s",
        }} />
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.bg, color: C.text,
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
  fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
};
