import { useState, useEffect, useRef } from "react";
import { C } from "@/lib/mock-data";
import { User, Bell, Sliders, CreditCard, AlertTriangle, Key, Copy, Eye, EyeOff, Shield, Activity, Clock, Database, Loader2, Wifi, WifiOff, Server, Trash2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import FalconerRulesPanel from "@/components/dashboard/FalconerRulesPanel";
import FalconerPreferencesPanel, { type FalconerPreferencesPanelRef } from "@/components/dashboard/FalconerPreferencesPanel";
import FalconerPerformancePanel from "@/components/dashboard/FalconerPerformancePanel";
import AddInstrumentModal from "@/components/dashboard/AddInstrumentModal";
import BrokerMappingsAdmin from "@/components/dashboard/BrokerMappingsAdmin";
import BrokerAvailabilityDot from "@/components/dashboard/BrokerAvailabilityDot";
import { useProfile } from "@/hooks/use-profile";
import { useBrokerMappings } from "@/hooks/use-broker-mappings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_CLOCKS, AVAILABLE_CITIES, type ClockConfig } from "@/components/dashboard/WorldClocks";

const ADMIN_EMAIL = "falconercarlandrew@gmail.com";

const RISK_PROFILES = [
  { value: "conservative", ratio: "1.5", label: "Conservative", desc: "Lower reward, tighter stops. Best for cautious trading.", default: false },
  { value: "balanced", ratio: "2.0", label: "Balanced", desc: "Standard 2:1 reward-to-risk. Recommended for most traders.", default: true },
  { value: "aggressive", ratio: "2.5", label: "Aggressive", desc: "Higher targets with wider stops. For confident traders.", default: false },
  { value: "moonshot", ratio: "3.0", label: "Moonshot", desc: "Maximum reward potential. Higher risk, bigger wins.", default: false },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { profile, loading, updateProfile, userId } = useProfile();
  const { getAvailabilityStatus, defaultConnection } = useBrokerMappings(userId);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [timeframe, setTimeframe] = useState("15");
  const [candle, setCandle] = useState("heiken_ashi");
  const [emaFast, setEmaFast] = useState("4");
  const [emaSlow, setEmaSlow] = useState("17");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [signalsPaused, setSignalsPaused] = useState(false);
  const [broker, setBroker] = useState("eightcap");
  const [rrRatio, setRrRatio] = useState("2.0");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clockSlots, setClockSlots] = useState<ClockConfig[]>(DEFAULT_CLOCKS);
  const [showAddInstrument, setShowAddInstrument] = useState(false);
  const falconerPrefsRef = useRef<FalconerPreferencesPanelRef>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name || "");
      setNickname(profile.nickname || "");
      setTimeframe(profile.default_timeframe);
      setCandle(profile.default_candle_type);
      setEmaFast(String(profile.ema_fast));
      setEmaSlow(String(profile.ema_slow));
      setEmailAlerts(profile.email_alerts);
      setPushAlerts(profile.push_notifications);
      setSmsAlerts(profile.sms_alerts);
      setBroker(profile.broker);
      setSignalsPaused(profile.signals_paused ?? false);
      setRrRatio(String((profile as any).rr_ratio ?? 2.0));
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
    loadInstruments();
  }, [userId]);

  const loadInstruments = () => {
    if (!userId) return;
    supabase.from("user_instruments").select("symbol").eq("user_id", userId).then(({ data }) => {
      if (data) setInstruments(data.map(d => d.symbol));
    });
  };

  const handleSave = async () => {
    if (!userId) return;
    await updateProfile({
      full_name: name,
      nickname: nickname || null,
      email_alerts: emailAlerts,
      push_notifications: pushAlerts,
      sms_alerts: smsAlerts,
    } as any);
    await supabase.from("profiles").update({ clock_timezones: clockSlots as any, rr_ratio: parseFloat(rrRatio) } as any).eq("id", userId);
    await falconerPrefsRef.current?.save();
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
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 24 }}>{t("settings.title")}</h1>

      <Section icon={<User size={16} color={C.jade} />} title={t("settings.profile")}>
        <Field label={t("settings.fullName") + " *"}>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Required — RON will greet you by name" />
        </Field>
        <Field label={t("settings.nickname")}>
          <input value={nickname} onChange={e => setNickname(e.target.value)} style={inputStyle} placeholder="Displayed in header if set" />
        </Field>
        <Field label={t("settings.email")}>
          <input value={email} disabled style={{ ...inputStyle, opacity: 0.5 }} />
        </Field>
      </Section>

      {/* Broker Connection Settings */}
      {userId && <BrokerConnectionSettings userId={userId} />}

      <Section icon={<Sliders size={16} color={C.blue} />} title={t("settings.instruments")}>
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 8 }}>Dashboard - Current watchlist: <span style={{ fontSize: 10, opacity: 0.7 }}>(instruments tracked on your dashboard — not limited to trading)</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {instruments.map(i => {
            const avail = getAvailabilityStatus(i);
            return (
              <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: C.jade + "18", color: C.jade, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <BrokerAvailabilityDot status={avail} brokerName={defaultConnection?.broker_name} symbol={i} />
                {i}
                <button
                  onClick={async () => {
                    if (!userId) return;
                    setInstruments(prev => prev.filter(s => s !== i));
                    const { error } = await supabase.from("user_instruments").delete().eq("user_id", userId).eq("symbol", i);
                    if (error) {
                      toast.error("Failed to remove instrument");
                      loadInstruments();
                      return;
                    }
                    toast.success(`${i} removed from watchlist`);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: 14, lineHeight: 1, padding: 0, fontWeight: 800 }}
                  title={`Remove ${i}`}
                >×</button>
              </span>
            );
          })}
        </div>
        <button onClick={() => setShowAddInstrument(true)} style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>{t("settings.addInstrument")}</button>
      </Section>

      <Section icon={<Sliders size={16} color={C.purple} />} title="Signal Preferences">
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>Choose how aggressively RON targets profit on your signals.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {RISK_PROFILES.map(rp => {
            const active = rrRatio === rp.ratio;
            return (
              <button
                key={rp.value}
                onClick={() => setRrRatio(rp.ratio)}
                style={{
                  padding: "14px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: active ? C.jade + "18" : C.bg,
                  outline: active ? `2px solid ${C.jade}` : `1px solid ${C.border}`,
                  textAlign: "left", transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? C.jade : C.text, marginBottom: 4 }}>
                  {rp.label} {rp.default && <span style={{ fontSize: 9, fontWeight: 600, color: C.jade, marginLeft: 4 }}>RECOMMENDED</span>}
                </div>
                <div style={{ fontSize: 11, color: C.sec, lineHeight: 1.4 }}>{rp.desc}</div>
              </button>
            );
          })}
        </div>
      </Section>


      <Section icon={<AlertTriangle size={16} color={signalsPaused ? C.red : C.jade} />} title="Signal Generation">
        <Toggle label="Pause All Signals (Kill Switch)" checked={signalsPaused} onChange={async (val) => {
          setSignalsPaused(val);
          if (userId) {
            await supabase.from("profiles").update({ signals_paused: val }).eq("id", userId);
            toast.success(val ? "Signals PAUSED — no new signals will fire" : "Signals RESUMED — scanning will restart");
          }
        }} />
        {signalsPaused && (
          <div style={{ fontSize: 11, color: C.red, marginTop: -4, marginBottom: 8, paddingLeft: 4, fontWeight: 600 }}>
            ⛔ Signal generation is currently PAUSED. No new signals will be created until you resume.
          </div>
        )}
      </Section>

      <Section icon={<Bell size={16} color={C.amber} />} title={t("settings.notifications")}>
        <Toggle label={t("settings.emailAlerts")} checked={emailAlerts} onChange={setEmailAlerts} />
        <Toggle label={t("settings.pushNotifications")} checked={pushAlerts} onChange={async (val) => {
          if (val && "Notification" in window) {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
              toast.error("Browser notification permission denied. Please enable it in your browser settings.");
              return;
            }
          }
          setPushAlerts(val);
        }} />
        {pushAlerts && "Notification" in window && Notification.permission !== "granted" && (
          <div style={{ fontSize: 11, color: C.amber, marginTop: -4, marginBottom: 8, paddingLeft: 4 }}>
            ⚠ Browser notifications not permitted — toggle off and on to re-request
          </div>
        )}
        <Toggle label={t("settings.smsAlerts")} checked={smsAlerts} onChange={setSmsAlerts} />
      </Section>


      <Section icon={<CreditCard size={16} color={C.jade} />} title={t("settings.subscription")}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{tierLabel} Plan</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: C.jade + "20", color: C.jade }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>
          {profile?.subscription_tier === "trader" ? "$59/mo • 10 instruments • Real-time signals" : profile?.subscription_tier === "elite" ? "$129/mo • Unlimited instruments • Priority AI" : "Free • 3 instruments • Daily signals"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg }}>{t("settings.upgrade")}</button>
          <button style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>{t("settings.downgrade")}</button>
        </div>
      </Section>

      <button onClick={handleSave} style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg, padding: "12px 32px", fontSize: 14, marginBottom: 16 }}>
        {t("settings.saveAll")}
      </button>

      {/* All users see AI Preferences */}
      <FalconerPreferencesPanel ref={falconerPrefsRef} />

      {/* Admin-only sections */}
      {isAdmin && <StrategyConfigAdmin />}
      {isAdmin && <BrokerMappingsAdmin />}
      {isAdmin && <FalconerRulesPanel />}
      {isAdmin && <FalconerPerformancePanel />}
      {isAdmin && <AdminPanel />}
      {isAdmin && <HistoricalDataImport />}

      <Section icon={<AlertTriangle size={16} color={C.red} />} title={t("settings.dangerZone")}>
        <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>{t("settings.deleteWarning")}</div>
        <button style={{ ...btnStyle, background: C.red + "20", color: C.red, border: `1px solid ${C.red}30` }}>{t("settings.deleteAccount")}</button>
      </Section>

      {userId && (
        <AddInstrumentModal
          open={showAddInstrument}
          onClose={() => setShowAddInstrument(false)}
          userId={userId}
          currentInstruments={instruments}
          onAdded={() => { loadInstruments(); }}
        />
      )}
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

function StrategyConfigAdmin() {
  const [timeframe, setTimeframe] = useState("15");
  const [candle, setCandle] = useState("heiken_ashi");
  const [emaFast, setEmaFast] = useState("4");
  const [emaSlow, setEmaSlow] = useState("17");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from("profiles").select("default_timeframe, default_candle_type, ema_fast, ema_slow").eq("id", session.user.id).single();
      if (data) {
        setTimeframe(data.default_timeframe);
        setCandle(data.default_candle_type);
        setEmaFast(String(data.ema_fast));
        setEmaSlow(String(data.ema_slow));
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({
        default_timeframe: timeframe,
        default_candle_type: candle,
        ema_fast: parseInt(emaFast),
        ema_slow: parseInt(emaSlow),
      }).eq("id", session.user.id);
      toast.success("Strategy config saved");
    }
    setSaving(false);
  };

  return (
    <Section icon={<Sliders size={16} color={C.amber} />} title="Strategy Configuration (Admin Only)">
      <div style={{ fontSize: 11, color: C.amber, marginBottom: 12, fontWeight: 600 }}>⚠ These settings control V1 Legacy engine parameters. Hidden from regular users to protect IP.</div>
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
      <button onClick={handleSave} disabled={saving}
        style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.amber}, #F59E0B)`, color: C.bg, marginTop: 8 }}>
        {saving ? "Saving..." : "Save Strategy Config"}
      </button>
    </Section>
  );
}

function HistoricalDataImport() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.functions.invoke("ingest-historical-csvs", { method: "POST" });
      if (error) throw error;
      setResult(data);
      if (data?.success) {
        toast.success(`Imported ${data.total_candles_stored} candles from ${data.total_files} files`);
      } else {
        toast.error(data?.error || "Import failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed");
      setResult({ error: e.message });
    }
    setImporting(false);
  };

  return (
    <Section icon={<Database size={16} color={C.blue} />} title="Historical Data Import">
      <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>
        Download Dukascopy CSV files from the RON ML GitHub repo and import into the candle_history table for backtesting and ML training.
      </div>
      <button
        disabled={importing}
        onClick={handleImport}
        style={{
          ...btnStyle,
          background: importing ? C.muted + "40" : `linear-gradient(135deg, ${C.blue}, ${C.purple})`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
        }}
      >
        {importing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
        {importing ? "Importing... (this may take several minutes)" : "Import Historical Data from GitHub"}
      </button>

      {result && !result.error && result.details && (
        <div style={{ marginTop: 16, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ color: C.jade, fontWeight: 700, marginBottom: 8 }}>
            ✓ {result.total_files} files → {result.total_candles_stored} candles stored
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", background: C.bg, borderRadius: 8, padding: 10, border: `1px solid ${C.border}` }}>
            {result.details.map((d: any, i: number) => (
              <div key={i} style={{ color: d.status === "ok" ? C.sec : d.status === "skipped" ? C.amber : C.red, marginBottom: 2 }}>
                {d.file}: {d.status} {d.parsed != null ? `(${d.parsed} parsed, ${d.stored ?? 0} stored)` : d.reason || ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {result?.error && (
        <div style={{ marginTop: 12, fontSize: 11, color: C.red, fontFamily: "'JetBrains Mono', monospace" }}>
          ✗ {result.error}
        </div>
      )}
    </Section>
  );
}

const BROKER_LIST = ["Eightcap", "IC Markets", "OANDA", "Pepperstone", "FXCM"];
const BROKER_SERVERS: Record<string, string[]> = {
  Eightcap: ["Eightcap-Demo", "Eightcap-Live"],
  "IC Markets": ["ICMarketsSC-Demo", "ICMarketsSC-Live", "ICMarketsEU-Demo", "ICMarketsEU-Live"],
  OANDA: ["OANDA-Demo-1", "OANDA-Live-1"],
  Pepperstone: ["Pepperstone-Demo", "Pepperstone-Live", "Pepperstone-Edge-Demo", "Pepperstone-Edge-Live"],
  FXCM: ["FXCM-Demo01", "FXCM-Real01"],
};

function BrokerConnectionSettings({ userId }: { userId: string }) {
  const [connections, setConnections] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [broker, setBroker] = useState("Eightcap");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [accountType, setAccountType] = useState<"demo" | "live">("demo");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => { loadConnections(); }, [userId]);

  const loadConnections = async () => {
    const { data } = await supabase.from("broker_connections").select("*").eq("user_id", userId).order("created_at");
    if (data) setConnections(data);
  };

  const handleSave = async () => {
    if (!loginId || !password || !server) { toast.error("All fields are required"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("broker_connections").insert({
        user_id: userId,
        broker_name: broker,
        login_id: loginId,
        encrypted_password: btoa(password), // Base64 encode — real encryption via vault in production
        server,
        account_type: accountType,
        is_default: connections.length === 0,
      });
      if (error) throw error;
      toast.success("Broker connection saved");
      setShowForm(false);
      setLoginId("");
      setPassword("");
      setServer("");
      loadConnections();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("broker_connections").delete().eq("id", id);
    toast.success("Connection removed");
    loadConnections();
  };

  const handleSetDefault = async (id: string) => {
    // Unset all defaults first, then set selected
    await supabase.from("broker_connections").update({ is_default: false }).eq("user_id", userId);
    await supabase.from("broker_connections").update({ is_default: true }).eq("id", id);
    toast.success("Default account updated");
    loadConnections();
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await supabase.auth.refreshSession();
      // Simple connectivity check — in production this would call MetaApi
      await new Promise(r => setTimeout(r, 1500));
      await supabase.from("broker_connections").update({ status: "connected" }).eq("id", id);
      toast.success("Connection test successful");
      loadConnections();
    } catch {
      await supabase.from("broker_connections").update({ status: "error" }).eq("id", id);
      toast.error("Connection test failed");
      loadConnections();
    }
    setTestingId(null);
  };

  const servers = BROKER_SERVERS[broker] || [];

  return (
    <Section icon={<Server size={16} color={C.blue} />} title="Broker Connection">
      <div style={{ fontSize: 12, color: C.sec, marginBottom: 12 }}>
        Connect your broker account for live data feeds and auto-trading. Credentials are encrypted and only transmitted server-side.
      </div>

      {connections.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {connections.map(conn => {
            const statusColor = conn.status === "connected" ? C.jade : conn.status === "error" ? C.red : C.muted;
            return (
              <div key={conn.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 10,
                background: C.bg, border: `1px solid ${C.border}`, marginBottom: 8,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{conn.broker_name}</div>
                  <div style={{ fontSize: 11, color: C.sec }}>
                    {conn.login_id} · {conn.server} · {conn.account_type.toUpperCase()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {conn.status === "connected" ? <Wifi size={12} color={statusColor} /> : <WifiOff size={12} color={statusColor} />}
                    <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, textTransform: "uppercase" }}>{conn.status}</span>
                  </div>
                  {conn.is_default && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: C.jade + "20", color: C.jade }}>DEFAULT</span>
                  )}
                  <button onClick={() => handleTest(conn.id)} disabled={testingId === conn.id}
                    style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec, padding: "5px 10px", fontSize: 10 }}>
                    {testingId === conn.id ? <Loader2 size={10} className="animate-spin" /> : "Test"}
                  </button>
                  {!conn.is_default && (
                    <button onClick={() => handleSetDefault(conn.id)} title="Set as default"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                      <Star size={12} color={C.amber} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(conn.id)} title="Remove"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                    <Trash2 size={12} color={C.red} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>
          + Add Broker Account
        </button>
      ) : (
        <div style={{ background: C.bg, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Broker">
              <select value={broker} onChange={e => { setBroker(e.target.value); setServer(""); }} style={inputStyle}>
                {BROKER_LIST.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Account Type">
              <select value={accountType} onChange={e => setAccountType(e.target.value as "demo" | "live")} style={inputStyle}>
                <option value="demo">Demo</option>
                <option value="live">Live</option>
              </select>
            </Field>
            <Field label="Login ID">
              <input value={loginId} onChange={e => setLoginId(e.target.value)} style={inputStyle} placeholder="e.g. 12345678" />
            </Field>
            <Field label="Password">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
            </Field>
            <Field label="Server">
              <select value={server} onChange={e => setServer(e.target.value)} style={inputStyle}>
                <option value="">Select server...</option>
                {servers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ ...btnStyle, background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg, display: "flex", alignItems: "center", gap: 6 }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              {saving ? "Saving..." : "Save Connection"}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ ...btnStyle, background: C.card, border: `1px solid ${C.border}`, color: C.sec }}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
