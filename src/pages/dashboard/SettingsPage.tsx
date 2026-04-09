import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { User, Bell, Sliders, CreditCard, AlertTriangle, Key, Copy, Eye, EyeOff, Shield, Activity, Clock } from "lucide-react";
import FalconerRulesPanel from "@/components/dashboard/FalconerRulesPanel";
import FalconerPreferencesPanel from "@/components/dashboard/FalconerPreferencesPanel";
import FalconerPerformancePanel from "@/components/dashboard/FalconerPerformancePanel";
import AddInstrumentModal from "@/components/dashboard/AddInstrumentModal";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_CLOCKS, AVAILABLE_CITIES, type ClockConfig } from "@/components/dashboard/WorldClocks";

const ADMIN_EMAIL = "falconercarlandrew@gmail.com";

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [clockSlots, setClockSlots] = useState<ClockConfig[]>(DEFAULT_CLOCKS);
  const [showAddInstrument, setShowAddInstrument] = useState(false);

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
      // Load clock preferences
      if ((profile as any).clock_timezones && Array.isArray((profile as any).clock_timezones) && (profile as any).clock_timezones.length > 0) {
        setClockSlots((profile as any).clock_timezones as ClockConfig[]);
      }
    }
  }, [profile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setEmail(session.user.email || "");
        setIsAdmin(session.user.email === ADMIN_EMAIL);
      }
    });
    if (userId) {
      supabase.from("user_instruments").select("symbol").eq("user_id", userId).then(({ data }) => {
        if (data) setInstruments(data.map(d => d.symbol));
      });
    }
  }, [userId]);

  const handleSave = async () => {
    if (!userId) return;
    // Save standard profile fields
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
    // Save clock preferences separately (column not in typed Profile)
    await supabase.from("profiles").update({ clock_timezones: clockSlots as any }).eq("id", userId);
    toast.success("Settings saved");
  };

  const updateClockSlot = (index: number, timezone: string) => {
    const city = AVAILABLE_CITIES.find(c => c.timezone === timezone);
    if (!city) return;
    setClockSlots(prev => prev.map((s, i) => i === index ? { ...city } : s));
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
        <button onClick={() => setShowAddInstrument(true)} style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>+ Add Instrument</button>
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

      {/* All users see AI Preferences */}
      <FalconerPreferencesPanel />

      {/* Admin-only sections */}
      {isAdmin && <FalconerRulesPanel />}
      {isAdmin && <FalconerPerformancePanel />}
      {isAdmin && <AdminPanel />}

      <Section icon={<AlertTriangle size={16} color={C.red} />} title="Danger Zone">
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>This action cannot be undone. All data will be permanently deleted.</div>
        <button style={{ ...btnStyle, background: C.red + "20", color: C.red, border: `1px solid ${C.red}30` }}>Delete Account</button>
      </Section>
    </div>
  );
}

function AdminPanel() {
  const [serviceKey, setServiceKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [scansToday, setScansToday] = useState(0);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    // We can't query platform_config via anon key (no RLS policy), so we use the edge function approach
    // For display purposes, fetch stats via regular queries the admin user has access to
    const today = new Date().toISOString().split("T")[0];

    const [profilesRes, scansRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("scan_results").select("id", { count: "exact", head: true }).gte("scanned_at", today + "T00:00:00Z"),
    ]);

    setTotalUsers(profilesRes.count || 0);
    setScansToday(scansRes.count || 0);
  };

  const handleTestScan = async () => {
    if (!serviceKey) {
      toast.error("Enter the platform service key first");
      return;
    }
    setPushing(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          service_key: serviceKey,
          target: "all",
          scans: [{
            symbol: "NAS100",
            timeframe: "15",
            candle_type: "heiken_ashi",
            direction: "BUY",
            confidence: 7,
            entry_price: 21500,
            take_profit: 21700,
            stop_loss: 21400,
            risk_reward: "2:1",
            adx: 28.5,
            rsi: 55.3,
            macd_status: "Bullish",
            stoch_rsi: 62.1,
            ema_fast_value: 21510,
            ema_slow_value: 21480,
            ema_crossover_status: "CONFIRMED",
            ema_crossover_direction: "BULLISH",
            supertrend_status: "BULL",
            verdict: "HIGH",
            reasoning: "Admin test scan — all indicators aligned bullish.",
            session: "new_york",
          }],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Test scan pushed: ${data.scans_inserted} scans, ${data.signals_created} signals`);
        loadAdminData();
      } else {
        toast.error(data.error || "Failed to push test scan");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setPushing(false);
  };

  return (
    <Section icon={<Shield size={16} color={C.pink} />} title="Platform Admin">
      <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>Platform-level service key for the AI analysis engine. This key broadcasts scans to all subscribers.</div>

      <Field label="Platform Service Key">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={keyVisible ? serviceKey : serviceKey ? "•".repeat(32) : ""}
            onChange={e => setServiceKey(e.target.value)}
            placeholder="Paste service key here..."
            style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flex: 1 }}
          />
          <button onClick={() => setKeyVisible(!keyVisible)} style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec, padding: "9px 10px" }}>
            {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button onClick={() => { navigator.clipboard.writeText(serviceKey); toast.success("Key copied"); }} style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec, padding: "9px 10px" }}>
            <Copy size={14} />
          </button>
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.bg, borderRadius: 10, padding: 14, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.sec, marginBottom: 4 }}>Total Users</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.jade, fontFamily: "'JetBrains Mono', monospace" }}>{totalUsers}</div>
        </div>
        <div style={{ background: C.bg, borderRadius: 10, padding: 14, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.sec, marginBottom: 4 }}>Scans Today</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, fontFamily: "'JetBrains Mono', monospace" }}>{scansToday}</div>
        </div>
      </div>

      <button
        disabled={pushing}
        onClick={handleTestScan}
        style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}
      >
        <Activity size={12} /> {pushing ? "Pushing..." : "Push Test Scan (All Users)"}
      </button>
    </Section>
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
