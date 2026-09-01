import { useCallback, useEffect, useState } from "react";
import { Bell, Plug, RefreshCw, Trash2 } from "lucide-react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BrokerConnection {
  id: string;
  broker_name: string;
  account_type: string;
  metaapi_account_id: string | null;
  status: string;
  balance: number | null;
  equity: number | null;
  last_health_check: string | null;
  last_error: string | null;
}

export default function SettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [brokerName, setBrokerName] = useState("Eightcap");
  const [accountId, setAccountId] = useState("");
  const [accountType, setAccountType] = useState("demo");
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [pushAlerts, setPushAlerts] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async (resolvedId: string) => {
    const [{ data: brokers }, { data: profile }] = await Promise.all([
      supabase.from("broker_connections")
        .select("id,broker_name,account_type,metaapi_account_id,status,balance,equity,last_health_check,last_error")
        .eq("user_id", resolvedId)
        .eq("is_default", true)
        .limit(1),
      supabase.from("profiles").select("email_alerts,push_notifications").eq("id", resolvedId).single(),
    ]);
    setConnection((brokers?.[0] as BrokerConnection) ?? null);
    setEmailAlerts(profile?.email_alerts ?? false);
    setPushAlerts(profile?.push_notifications ?? true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setUserId(session.user.id);
      load(session.user.id);
    });
  }, [load]);

  const connect = async () => {
    if (!accountId.trim() || !brokerName.trim()) return;
    setWorking(true);
    const { data, error } = await supabase.functions.invoke("connect-metaapi", {
      body: { accountId: accountId.trim(), brokerName: brokerName.trim(), accountType },
    });
    setWorking(false);
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || "Connection failed");
      return;
    }
    toast.success("MetaApi account connected");
    setAccountId("");
    if (userId) await load(userId);
  };

  const test = async () => {
    if (!connection) return;
    setWorking(true);
    const { data, error } = await supabase.functions.invoke("metaapi-trade", {
      body: { action: "test-connection" },
    });
    setWorking(false);
    if (error || !data?.ok) toast.error(data?.error || error?.message || "Connection test failed");
    else toast.success(`Connected in ${data.latency_ms} ms`);
    if (userId) await load(userId);
  };

  const disconnect = async () => {
    if (!connection) return;
    await supabase.from("broker_connections").delete().eq("id", connection.id);
    setConnection(null);
    toast.success("Broker disconnected");
  };

  const saveNotifications = async () => {
    if (!userId) return;
    const { error } = await supabase.from("profiles")
      .update({ email_alerts: emailAlerts, push_notifications: pushAlerts })
      .eq("id", userId);
    if (error) toast.error(error.message);
    else toast.success("Notification preferences saved");
  };

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Settings</h1>
      <p style={{ color: C.sec, fontSize: 15, marginBottom: 20 }}>Broker connection and notification delivery.</p>

      <Section title="MetaApi broker" icon={Plug}>
        {connection ? (
          <div style={{ padding: 14, borderRadius: 9, background: C.bg2, border: `1px solid ${C.jade}45` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <strong style={{ color: C.jade }}>{connection.broker_name}</strong>
                <div style={{ color: C.sec, fontSize: 13, marginTop: 5 }}>
                  {connection.account_type.toUpperCase()} · {connection.status} · {connection.metaapi_account_id}
                </div>
                <div style={{ fontSize: 14, marginTop: 8 }}>
                  Balance ${Number(connection.balance ?? 0).toFixed(2)} · Equity ${Number(connection.equity ?? 0).toFixed(2)}
                </div>
                {connection.last_error && <div style={{ color: C.red, fontSize: 13, marginTop: 7 }}>{connection.last_error}</div>}
              </div>
              <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                <button onClick={test} disabled={working} style={ghostButton}><RefreshCw size={13} /> Test</button>
                <button onClick={disconnect} style={{ ...ghostButton, color: C.red }}><Trash2 size={13} /> Remove</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p style={{ color: C.sec, fontSize: 14, marginBottom: 12 }}>
              Enter the deployed account ID from your MetaApi dashboard. Broker passwords are not stored in GainEdge.
            </p>
            <Field label="Broker name"><input value={brokerName} onChange={event => setBrokerName(event.target.value)} style={input} /></Field>
            <Field label="Account type">
              <select value={accountType} onChange={event => setAccountType(event.target.value)} style={input}>
                <option value="demo">Demo</option><option value="live">Live</option>
              </select>
            </Field>
            <Field label="MetaApi account ID"><input value={accountId} onChange={event => setAccountId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={input} /></Field>
            <button onClick={connect} disabled={working || accountId.trim().length < 16} style={primaryButton}>
              {working ? "Verifying…" : "Verify and connect"}
            </button>
          </>
        )}
      </Section>

      <Section title="Notifications" icon={Bell}>
        <label style={toggle}><input type="checkbox" checked={pushAlerts} onChange={event => setPushAlerts(event.target.checked)} /> In-app entry notifications</label>
        <label style={toggle}><input type="checkbox" checked={emailAlerts} onChange={event => setEmailAlerts(event.target.checked)} /> Email signal notifications</label>
        <button onClick={saveNotifications} style={{ ...primaryButton, marginTop: 12 }}>Save notifications</button>
      </Section>

      <p style={{ color: C.sec, fontSize: 14 }}>
        Falconer execution, symbols and risk controls are managed on the{" "}
        <a href="/dashboard/strategy" style={{ color: C.jade }}>Strategy page</a>.
      </p>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: import("lucide-react").LucideIcon; children: React.ReactNode }) {
  return <section style={{ padding: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16 }}>
    <h2 style={{ display: "flex", alignItems: "center", gap: 7, color: C.jade, fontSize: 15, marginBottom: 13 }}><Icon size={15} />{title}</h2>
    {children}
  </section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, alignItems: "center", marginBottom: 9 }}>
    <span style={{ color: C.sec, fontSize: 13 }}>{label}</span>{children}
  </label>;
}
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.border}`, color: C.text, width: "100%" };
const toggle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, color: C.text, fontSize: 14, marginBottom: 10 };
const primaryButton: React.CSSProperties = { padding: "9px 13px", borderRadius: 7, border: "none", background: C.jade, color: "#020617", fontWeight: 800, cursor: "pointer" };
const ghostButton: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.sec, cursor: "pointer", fontSize: 13 };
