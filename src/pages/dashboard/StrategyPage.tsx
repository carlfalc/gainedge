import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Shield, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSymbols } from "@/services/metaapi-client";
import { C } from "@/lib/mock-data";
import { toast } from "sonner";
import CalibrationScopeBadge from "@/components/market/CalibrationScopeBadge";

interface Settings {
  enabled: boolean;
  execution_path: "metaapi" | "pineconnector" | "signal_only";
  symbols: string[];
  timeframe: string;
  risk_usd: number;
  rr_tp1: number;
  rr_tp2: number;
  rr_tp3: number;
  be_r: number;
  pct1: number;
  pct2: number;
  min_atr_pct: number;
  max_atr_pct: number;
  pullback_tol: number;
  pineconnector_license: string | null;
  pineconnector_webhook_url: string | null;
  pineconnector_risk: number;
  pineconnector_symbol_override: Record<string, string>;
  allow_live_execution: boolean;
  max_daily_loss_usd: number;
  max_open_positions: number;
  min_setup_score: number;
}

interface Readiness {
  intraday: number;
  daily: number;
}

interface LiveTrade {
  id: string;
  symbol: string;
  status: string;
  setup_score: number | null;
  execution_path: string;
  entry_price: number;
  sl_price: number;
  tp3_price: number;
  pnl_usd: number | null;
  raw_alert_payload: unknown;
  opened_at: string;
}

const DEFAULTS: Settings = {
  enabled: false,
  execution_path: "signal_only",
  symbols: ["XAUUSD"],
  timeframe: "15m",
  risk_usd: 200,
  rr_tp1: 1.5,
  rr_tp2: 3,
  rr_tp3: 5,
  be_r: 1,
  pct1: 33,
  pct2: 33,
  min_atr_pct: 0.05,
  max_atr_pct: 0.8,
  pullback_tol: 0.0015,
  pineconnector_license: "",
  pineconnector_webhook_url: "",
  pineconnector_risk: 0.5,
  pineconnector_symbol_override: {},
  allow_live_execution: false,
  max_daily_loss_usd: 500,
  max_open_positions: 3,
  min_setup_score: 70,
};

export default function StrategyPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [readiness, setReadiness] = useState<Record<string, Readiness>>({});
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [mappingText, setMappingText] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const symbolsKey = settings.symbols.join(",");

  const loadTrades = async (id: string) => {
    const { data } = await supabase.from("falconer_trades")
      .select("id,symbol,status,setup_score,execution_path,entry_price,sl_price,tp3_price,pnl_usd,raw_alert_payload,opened_at")
      .eq("user_id", id)
      .eq("mode", "live")
      .order("opened_at", { ascending: false })
      .limit(30);
    setTrades((data as unknown as LiveTrade[]) ?? []);
  };

  const loadReadiness = async (symbols: string[], timeframe: string) => {
    const rows = await Promise.all(symbols.map(async symbol => {
      const [{ count: intraday }, { count: daily }] = await Promise.all([
        supabase.from("candle_history").select("id", { count: "exact", head: true })
          .eq("symbol", symbol).eq("timeframe", timeframe),
        supabase.from("candle_history").select("id", { count: "exact", head: true })
          .eq("symbol", symbol).eq("timeframe", "1d"),
      ]);
      return [symbol, { intraday: intraday ?? 0, daily: daily ?? 0 }] as const;
    }));
    setReadiness(Object.fromEntries(rows));
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      setUserId(session.user.id);
      const [{ data: existing }, { data: brokers }] = await Promise.all([
        supabase.from("falconer_settings").select("*").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("broker_connections")
          .select("metaapi_account_id,account_type,status")
          .eq("user_id", session.user.id)
          .eq("is_default", true)
          .limit(1),
      ]);
      const next = { ...DEFAULTS, ...((existing as unknown as Partial<Settings>) ?? {}) } as Settings;
      setSettings(next);
      setMappingText(JSON.stringify(next.pineconnector_symbol_override ?? {}, null, 2));
      const broker = brokers?.[0];
      if (broker?.metaapi_account_id && broker.status === "connected") {
        setAccountId(broker.metaapi_account_id);
        setAccountType(broker.account_type);
        const symbols = await fetchSymbols(broker.metaapi_account_id);
        setAvailableSymbols(symbols);
      }
      await Promise.all([
        loadTrades(session.user.id),
        loadReadiness(next.symbols, next.timeframe),
      ]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`strategy-trades-${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "falconer_trades", filter: `user_id=eq.${userId}`,
      }, () => loadTrades(userId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    if (settings.symbols.length) loadReadiness(settings.symbols, settings.timeframe);
  }, [symbolsKey, settings.symbols, settings.timeframe]);

  const filteredSymbols = useMemo(() => {
    const query = symbolSearch.trim().toUpperCase();
    return availableSymbols.filter(symbol => !query || symbol.toUpperCase().includes(query)).slice(0, 100);
  }, [availableSymbols, symbolSearch]);

  const toggleSymbol = (symbol: string) => {
    const canonical = symbol.trim().toUpperCase();
    const symbols = settings.symbols.includes(canonical)
      ? settings.symbols.filter(item => item !== canonical)
      : [...settings.symbols, canonical];
    setSettings({ ...settings, symbols });
  };

  const save = async () => {
    if (!userId || settings.symbols.length === 0) return;
    let symbolMap: Record<string, string> = {};
    try {
      symbolMap = JSON.parse(mappingText || "{}");
    } catch {
      toast.error("Broker symbol map must be valid JSON");
      return;
    }
    if (settings.pct1 + settings.pct2 >= 100) {
      toast.error("TP1% + TP2% must leave something for TP3");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("falconer_settings").upsert({
      user_id: userId,
      ...settings,
      pineconnector_symbol_override: symbolMap,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Falconer V7 settings saved");
  };

  if (loading) return <div style={{ padding: 24, color: C.sec }}>Loading Falconer…</div>;

  return (
    <div style={{ padding: 24, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Falconer V7 TP3</h1>
      <p style={{ color: C.sec, fontSize: 15, marginBottom: 20 }}>
        Long-only · 33/33/34 at 1.5R/3R/5R · breakeven at 1R · HA-flip exit after BE.
      </p>

      <div style={{ ...card, borderColor: settings.enabled ? `${C.jade}55` : C.border, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          <Field label="Engine">
            <label style={toggleLabel}>
              <input type="checkbox" checked={settings.enabled}
                onChange={event => setSettings({ ...settings, enabled: event.target.checked })} />
              {settings.enabled ? "Enabled" : "Disabled"}
            </label>
          </Field>
          <Field label="Execution path">
            <select value={settings.execution_path}
              onChange={event => setSettings({ ...settings, execution_path: event.target.value as Settings["execution_path"] })}
              style={input}>
              <option value="signal_only">Signal only</option>
              <option value="metaapi">MetaApi automatic execution</option>
              <option value="pineconnector">PineConnector webhook</option>
            </select>
          </Field>
          <Field label="Timeframe">
            <select value={settings.timeframe}
              onChange={event => setSettings({ ...settings, timeframe: event.target.value })}
              style={input}>
              <option value="5m">5m</option><option value="15m">15m</option>
              <option value="1h">1h</option><option value="4h">4h</option>
            </select>
          </Field>
          <Field label="Broker">
            <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 35, color: accountId ? C.jade : C.amber, fontSize: 14 }}>
              <Wifi size={14} /> {accountId ? `${accountType ?? "broker"} connected` : "Connect a default broker in Settings"}
            </div>
          </Field>
        </div>
      </div>

      <Section title="Instruments and data readiness">
        {availableSymbols.length > 0 && (
          <>
            <input value={symbolSearch} onChange={event => setSymbolSearch(event.target.value)}
              placeholder="Search broker instruments…" style={{ ...input, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 130, overflowY: "auto", marginBottom: 12 }}>
              {filteredSymbols.map(symbol => (
                <button key={symbol} onClick={() => toggleSymbol(symbol)} style={{
                  ...chip,
                  color: settings.symbols.includes(symbol) ? "#020617" : C.sec,
                  background: settings.symbols.includes(symbol) ? C.jade : C.bg2,
                }}>{symbol}</button>
              ))}
            </div>
          </>
        )}
        <Field label="Add canonical symbol">
          <input
            placeholder="e.g. XAUUSD, NAS100, HK50"
            style={input}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                toggleSymbol(event.currentTarget.value);
                event.currentTarget.value = "";
              }
            }}
          />
        </Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
          {settings.symbols.map(symbol => {
            const ready = readiness[symbol];
            const ok = (ready?.intraday ?? 0) >= 50 && (ready?.daily ?? 0) >= 250;
            return (
              <div key={symbol} style={readinessRow}>
                <strong style={{ color: C.jade }}>{symbol}</strong>
                <span>{ready?.intraday ?? 0} {settings.timeframe} candles</span>
                <span>{ready?.daily ?? 0}/250 daily candles</span>
                <span style={{ color: ok ? C.green : C.amber, display: "flex", alignItems: "center", gap: 5 }}>
                  {ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  {ok ? "Data ready" : "Backfill required"}
                </span>
                <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <CalibrationScopeBadge symbol={symbol} timeframe={settings.timeframe} />
                </div>
                <button onClick={() => toggleSymbol(symbol)} style={{ ...chip, color: C.red }}>Remove</button>
              </div>
            );
          })}
        </div>
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 16 }}>
        <Section title="Position and strategy risk">
          <NumberField label="Risk per trade (USD)" value={settings.risk_usd}
            onChange={risk_usd => setSettings({ ...settings, risk_usd })} />
          <NumberField label="TP1 R" value={settings.rr_tp1} step={0.1}
            onChange={rr_tp1 => setSettings({ ...settings, rr_tp1 })} />
          <NumberField label="TP2 R" value={settings.rr_tp2} step={0.1}
            onChange={rr_tp2 => setSettings({ ...settings, rr_tp2 })} />
          <NumberField label="TP3 R" value={settings.rr_tp3} step={0.1}
            onChange={rr_tp3 => setSettings({ ...settings, rr_tp3 })} />
          <NumberField label="Breakeven R" value={settings.be_r} step={0.1}
            onChange={be_r => setSettings({ ...settings, be_r })} />
          <NumberField label="TP1 %" value={settings.pct1}
            onChange={pct1 => setSettings({ ...settings, pct1 })} />
          <NumberField label="TP2 %" value={settings.pct2}
            onChange={pct2 => setSettings({ ...settings, pct2 })} />
        </Section>

        <Section title="Production risk gate">
          <NumberField label="Minimum setup score" value={settings.min_setup_score}
            onChange={min_setup_score => setSettings({ ...settings, min_setup_score })} />
          <NumberField label="Maximum daily loss (USD)" value={settings.max_daily_loss_usd}
            onChange={max_daily_loss_usd => setSettings({ ...settings, max_daily_loss_usd })} />
          <NumberField label="Maximum open positions" value={settings.max_open_positions}
            onChange={max_open_positions => setSettings({ ...settings, max_open_positions })} />
          <div style={{ padding: 12, borderRadius: 8, background: C.bg2, border: `1px solid ${C.amber}35` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.amber, fontWeight: 700, fontSize: 14 }}>
              <Shield size={15} /> Live execution confirmation
            </div>
            <label style={{ ...toggleLabel, marginTop: 10 }}>
              <input type="checkbox" checked={settings.allow_live_execution}
                onChange={event => setSettings({ ...settings, allow_live_execution: event.target.checked })} />
              Permit MetaApi orders on the connected account
            </label>
            <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
              Leave off while validating in signal-only or demo mode.
            </p>
          </div>
        </Section>
      </div>

      {settings.execution_path === "pineconnector" && (
        <Section title="PineConnector">
          <Field label="License ID"><input value={settings.pineconnector_license ?? ""}
            onChange={event => setSettings({ ...settings, pineconnector_license: event.target.value })} style={input} /></Field>
          <Field label="Webhook URL"><input value={settings.pineconnector_webhook_url ?? ""}
            onChange={event => setSettings({ ...settings, pineconnector_webhook_url: event.target.value })} style={input} /></Field>
          <NumberField label="PineConnector risk %" value={settings.pineconnector_risk} step={0.1}
            onChange={pineconnector_risk => setSettings({ ...settings, pineconnector_risk })} />
          <Field label="Canonical → broker symbol JSON">
            <textarea value={mappingText} onChange={event => setMappingText(event.target.value)}
              rows={5} style={{ ...input, fontFamily: "'JetBrains Mono', monospace" }} />
          </Field>
        </Section>
      )}

      <button onClick={save} disabled={saving || settings.symbols.length === 0} style={saveButton}>
        {saving ? "Saving…" : "Save Falconer Settings"}
      </button>

      <Section title="Live trades and alert payloads">
        {trades.length === 0 ? <p style={{ color: C.sec, fontSize: 14 }}>No Falconer live signals yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>Opened</th><th style={th}>Symbol</th><th style={th}>Score</th>
                <th style={th}>Path</th><th style={th}>Status</th><th style={th}>Entry / SL / TP3</th><th style={th}>Payload</th>
              </tr></thead>
              <tbody>{trades.map(trade => (
                <tr key={trade.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{new Date(trade.opened_at).toLocaleString()}</td>
                  <td style={{ ...td, color: C.jade, fontWeight: 700 }}>{trade.symbol}</td>
                  <td style={td}>{trade.setup_score != null ? `${trade.setup_score}/100` : "—"}</td>
                  <td style={td}>{trade.execution_path}</td><td style={td}>{trade.status}</td>
                  <td style={td}>{trade.entry_price} / {trade.sl_price} / {trade.tp3_price}</td>
                  <td style={td}><details><summary style={{ cursor: "pointer" }}>View</summary>
                    <pre style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{JSON.stringify(trade.raw_alert_payload, null, 2)}</pre>
                  </details></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ ...card, marginBottom: 16 }}>
    <h2 style={{ fontSize: 14, color: C.jade, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>{title}</h2>
    {children}
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, alignItems: "center", marginBottom: 9 }}>
    <span style={{ fontSize: 13, color: C.sec }}>{label}</span>{children}
  </label>;
}
function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" value={value} min={0} step={step}
    onChange={event => onChange(Number(event.target.value))} style={input} /></Field>;
}

const card: React.CSSProperties = { padding: 16, border: `1px solid ${C.border}`, borderRadius: 10, background: C.card };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, width: "100%" };
const toggleLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.text };
const chip: React.CSSProperties = { padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, cursor: "pointer" };
const readinessRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "100px 1fr 1fr 140px 70px", alignItems: "center", gap: 8, padding: 9, borderRadius: 7, background: C.bg2, fontSize: 13 };
const saveButton: React.CSSProperties = { padding: "11px 20px", marginBottom: 20, borderRadius: 8, border: "none", background: C.jade, color: "#020617", fontWeight: 800, cursor: "pointer" };
const th: React.CSSProperties = { padding: 9, textAlign: "left", color: C.sec };
const td: React.CSSProperties = { padding: 9, verticalAlign: "top" };
