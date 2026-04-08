import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, ChevronDown } from "lucide-react";

const COUNTRIES = [
  "United States", "United Kingdom", "Australia", "New Zealand", "Japan",
  "China", "Germany", "Canada", "Switzerland", "European Union",
  "Russia", "India", "Brazil", "South Africa", "Middle East",
  "South Korea", "Singapore", "Hong Kong",
];

const POLITICAL_FIGURES = [
  "Donald Trump", "Xi Jinping", "Jerome Powell (Fed Chair)",
  "Christine Lagarde (ECB)", "Andrew Bailey (BoE)", "Kazuo Ueda (BoJ)",
  "Philip Lowe (RBA)", "Adrian Orr (RBNZ)", "Vladimir Putin", "Volodymyr Zelenskyy",
];

const INSTRUMENT_GROUPS: Record<string, string[]> = {
  "Forex Majors": ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "NZD/USD", "USD/CHF", "USD/CAD"],
  "Forex Crosses": ["EUR/GBP", "AUD/NZD", "GBP/JPY", "EUR/JPY"],
  "Commodities": ["Gold (XAUUSD)", "Silver (XAGUSD)", "Crude Oil (WTI)", "Brent Oil", "Natural Gas", "Copper"],
  "Indices": ["NAS100", "US30", "S&P500", "FTSE100", "DAX40", "Nikkei225", "ASX200"],
  "Crypto": ["Bitcoin", "Ethereum"],
};

const TOPICS = [
  "Interest Rate Decisions", "Inflation/CPI Data", "Employment/NFP",
  "GDP Data", "Trade Wars/Tariffs", "Geopolitical Conflicts",
  "Central Bank Speeches", "Earnings Season", "OPEC Decisions",
  "Housing Data", "Consumer Sentiment", "Sanctions",
];

const PILL_COLORS: Record<string, { bg: string; border: string }> = {
  countries: { bg: "#3B82F620", border: "#3B82F6" },
  figures: { bg: "#A855F720", border: "#A855F7" },
  instruments: { bg: C.jade + "20", border: C.jade },
  topics: { bg: "#F59E0B20", border: "#F59E0B" },
};

interface NewsPreferences {
  countries: string[];
  figures: string[];
  instruments: string[];
  topics: string[];
  pushHighImpact: boolean;
}

const DEFAULT_PREFS: NewsPreferences = {
  countries: [], figures: [], instruments: [], topics: [], pushHighImpact: true,
};

function MultiSelect({
  label, options, selected, onChange, allowCustom,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const toggle = (item: string) => {
    onChange(selected.includes(item) ? selected.filter(s => s !== item) : [...selected, item]);
  };

  const addCustom = () => {
    const trimmed = custom.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }
    setCustom("");
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8, display: "block" }}>
        {label}
      </label>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "10px 14px", borderRadius: 10,
          background: C.bg, border: `1px solid ${C.border}`,
          color: C.sec, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span>{selected.length ? `${selected.length} selected` : "Select..."}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }} />
      </button>
      {open && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
          marginTop: 4, padding: 8, maxHeight: 220, overflowY: "auto",
        }}>
          {options.map(opt => (
            <label
              key={opt}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                borderRadius: 6, cursor: "pointer", fontSize: 12, color: C.text,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <input
                type="checkbox" checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ accentColor: C.jade }}
              />
              {opt}
            </label>
          ))}
          {allowCustom && (
            <div style={{ display: "flex", gap: 6, padding: "6px 8px", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
              <input
                value={custom} onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCustom()}
                placeholder="Add custom..."
                style={{
                  flex: 1, padding: "4px 8px", borderRadius: 6, fontSize: 12,
                  background: C.bg, border: `1px solid ${C.border}`, color: C.text,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              />
              <button onClick={addCustom} style={{
                padding: "4px 10px", borderRadius: 6, background: C.jade, color: "#fff",
                border: "none", fontSize: 11, cursor: "pointer", fontWeight: 600,
              }}>Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InstrumentMultiSelect({
  selected, onChange,
}: {
  selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (item: string) => {
    onChange(selected.includes(item) ? selected.filter(s => s !== item) : [...selected, item]);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8, display: "block" }}>
        Instruments & Assets
      </label>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "10px 14px", borderRadius: 10,
          background: C.bg, border: `1px solid ${C.border}`,
          color: C.sec, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span>{selected.length ? `${selected.length} selected` : "Select instruments..."}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }} />
      </button>
      {open && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
          marginTop: 4, padding: 8, maxHeight: 320, overflowY: "auto",
        }}>
          {Object.entries(INSTRUMENT_GROUPS).map(([group, instruments]) => (
            <div key={group}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.jade, letterSpacing: 1, textTransform: "uppercase", padding: "8px 8px 4px" }}>
                {group}
              </div>
              {instruments.map(inst => (
                <label
                  key={inst}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 16px",
                    borderRadius: 6, cursor: "pointer", fontSize: 12, color: C.text,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <input type="checkbox" checked={selected.includes(inst)} onChange={() => toggle(inst)} style={{ accentColor: C.jade }} />
                  {inst}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NewsSettingsPage() {
  const [prefs, setPrefs] = useState<NewsPreferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from("profiles").select("news_preferences").eq("id", session.user.id).single().then(({ data }) => {
        if (data?.news_preferences && typeof data.news_preferences === "object") {
          setPrefs({ ...DEFAULT_PREFS, ...(data.news_preferences as Record<string, unknown>) } as NewsPreferences);
        }
      });
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }
    await supabase.from("profiles").update({ news_preferences: JSON.parse(JSON.stringify(prefs)) }).eq("id", session.user.id);
    toast.success("News preferences saved — your feed is being updated");
    setSaving(false);
  };

  const allPills: { label: string; category: keyof typeof PILL_COLORS }[] = [
    ...prefs.countries.map(c => ({ label: c, category: "countries" as const })),
    ...prefs.figures.map(f => ({ label: f, category: "figures" as const })),
    ...prefs.instruments.map(i => ({ label: i, category: "instruments" as const })),
    ...prefs.topics.map(t => ({ label: t, category: "topics" as const })),
  ];

  const removePill = (label: string, category: string) => {
    const key = category as keyof NewsPreferences;
    if (Array.isArray(prefs[key])) {
      setPrefs({ ...prefs, [key]: (prefs[key] as string[]).filter(s => s !== label) });
    }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.jade, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
          GAIN MORE EDGE
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 6 }}>Your News, Your Way</h1>
        <p style={{ fontSize: 13, color: C.sec, lineHeight: 1.6 }}>
          Customise the news feed below to see only what matters to you. Select countries, political figures, instruments, and topics — we'll filter the noise and deliver what moves your markets.
        </p>
      </div>

      <MultiSelect label="Countries & Regions" options={COUNTRIES} selected={prefs.countries} onChange={countries => setPrefs({ ...prefs, countries })} />
      <MultiSelect label="Political Figures & Leaders" options={POLITICAL_FIGURES} selected={prefs.figures} onChange={figures => setPrefs({ ...prefs, figures })} allowCustom />
      <InstrumentMultiSelect selected={prefs.instruments} onChange={instruments => setPrefs({ ...prefs, instruments })} />
      <MultiSelect label="Topics & Events" options={TOPICS} selected={prefs.topics} onChange={topics => setPrefs({ ...prefs, topics })} />

      {/* Current Selections */}
      {allPills.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8, display: "block" }}>
            Current Selections
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allPills.map(pill => {
              const col = PILL_COLORS[pill.category];
              return (
                <span
                  key={`${pill.category}-${pill.label}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: col.bg, border: `1px solid ${col.border}`, color: col.border,
                  }}
                >
                  {pill.label}
                  <button
                    onClick={() => removePill(pill.label, pill.category)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: col.border, padding: 0, display: "flex" }}
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Push toggle */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`,
        marginBottom: 10,
      }}>
        <div>
          <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Push high-impact alerts to dashboard</div>
          <div style={{ fontSize: 11, color: C.sec }}>News is scanned every 5 minutes for your selected topics</div>
        </div>
        <button
          onClick={() => setPrefs({ ...prefs, pushHighImpact: !prefs.pushHighImpact })}
          style={{
            width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: prefs.pushHighImpact ? C.jade : C.muted,
            position: "relative", transition: "0.2s",
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            position: "absolute", top: 3,
            left: prefs.pushHighImpact ? 21 : 3, transition: "0.2s",
          }} />
        </button>
      </div>

      <button
        onClick={save}
        disabled={saving}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
          background: C.jade, color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          opacity: saving ? 0.6 : 1, marginTop: 10,
        }}
      >
        {saving ? "Saving..." : "Save News Preferences"}
      </button>
    </div>
  );
}
