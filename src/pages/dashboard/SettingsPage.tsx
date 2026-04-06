import { useState } from "react";
import { C } from "@/lib/mock-data";
import { User, Bell, Sliders, CreditCard, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const [name, setName] = useState("Demo Trader");
  const [email] = useState("trader@example.com");
  const [timeframe, setTimeframe] = useState("15m");
  const [candle, setCandle] = useState("heiken-ashi");
  const [emaFast, setEmaFast] = useState("4");
  const [emaSlow, setEmaSlow] = useState("17");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [broker, setBroker] = useState("eightcap");

  const instruments = ["NAS100", "US30", "AUDUSD", "NZDUSD", "XAUUSD"];

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 24 }}>Settings</h1>

      {/* Profile */}
      <Section icon={<User size={16} color={C.jade} />} title="Profile">
        <Field label="Full Name">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Email">
          <input value={email} disabled style={{ ...inputStyle, opacity: 0.5 }} />
        </Field>
      </Section>

      {/* Instruments */}
      <Section icon={<Sliders size={16} color={C.blue} />} title="Instruments">
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 8 }}>Current watchlist ({instruments.length}/10 — Trader tier):</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {instruments.map(i => (
            <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: C.jade + "18", color: C.jade }}>{i}</span>
          ))}
        </div>
        <button style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>+ Add Instrument</button>
      </Section>

      {/* Preferences */}
      <Section icon={<Sliders size={16} color={C.purple} />} title="Preferences">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Default Timeframe">
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={inputStyle}>
              {["1m", "5m", "15m", "30m", "1h", "4h", "1D"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Candle Type">
            <select value={candle} onChange={e => setCandle(e.target.value)} style={inputStyle}>
              <option value="heiken-ashi">Heiken Ashi</option>
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

      {/* Notifications */}
      <Section icon={<Bell size={16} color={C.amber} />} title="Notifications">
        <Toggle label="Email Alerts" checked={emailAlerts} onChange={setEmailAlerts} />
        <Toggle label="Push Notifications" checked={pushAlerts} onChange={setPushAlerts} />
        <Toggle label="SMS Alerts" checked={smsAlerts} onChange={setSmsAlerts} />
      </Section>

      {/* Broker */}
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

      {/* Subscription */}
      <Section icon={<CreditCard size={16} color={C.jade} />} title="Subscription">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Trader Plan</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: C.jade + "20", color: C.jade }}>ACTIVE</span>
        </div>
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>$59/mo • 10 instruments • Real-time signals</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg }}>Upgrade to Elite</button>
          <button style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>Downgrade</button>
        </div>
      </Section>

      {/* Danger */}
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
