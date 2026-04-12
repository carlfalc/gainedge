import { useEffect, useState } from "react";
import { COUNTRIES } from "@/lib/countries";

interface Props {
  open: boolean;
  onClose: () => void;
  currentName: string | null;
  currentNickname: string | null;
  currentCountry: string | null;
  currentTradingPreferences: string[];
  currentFavouriteSessions: string[];
  currentShowNickname: boolean;
  onSave: (data: {
    full_name: string;
    nickname: string;
    country: string | null;
    trading_preferences: string[];
    favourite_sessions: string[];
    show_nickname: boolean;
  }) => Promise<void>;
}

const TRADING_OPTIONS = [
  { value: "stocks", label: "Stocks" },
  { value: "forex_majors", label: "Forex Majors" },
  { value: "forex_minors", label: "Forex Minors" },
  { value: "commodities", label: "Commodities" },
  { value: "futures", label: "Futures" },
  { value: "cryptocurrency", label: "Cryptocurrency" },
  { value: "indices", label: "Indices" },
  { value: "gold", label: "Gold" },
];

const SESSION_OPTIONS = [
  { value: "asia", label: "Asia" },
  { value: "london", label: "London" },
  { value: "europe", label: "Europe" },
  { value: "new_york", label: "New York" },
];

const gold = "hsl(32 52% 64%)";
const dimText = "hsl(0 0% 100% / 0.6)";
const border = "hsl(32 52% 64% / 0.2)";

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: `1px solid ${border}`,
  background: "hsl(0 0% 100% / 0.05)",
  color: "hsl(0 0% 100%)",
  padding: "11px 14px",
  fontSize: 14,
  outline: "none",
  fontFamily: "'DM Sans', sans-serif",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "hsl(0 0% 100% / 0.66)",
};

export default function LoungeProfileDialog({
  open, onClose, currentName, currentNickname,
  currentCountry, currentTradingPreferences, currentFavouriteSessions, currentShowNickname,
  onSave,
}: Props) {
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [showNickname, setShowNickname] = useState(false);
  const [country, setCountry] = useState("");
  const [tradingPrefs, setTradingPrefs] = useState<string[]>([]);
  const [favSessions, setFavSessions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(currentName && currentName !== "Trader" ? currentName : "");
    setNickname(currentNickname || "");
    setShowNickname(currentShowNickname);
    setCountry(currentCountry || "");
    setTradingPrefs(currentTradingPreferences || []);
    setFavSessions(currentFavouriteSessions || []);
  }, [open, currentName, currentNickname, currentCountry, currentTradingPreferences, currentFavouriteSessions, currentShowNickname]);

  if (!open) return null;

  const canSave = fullName.trim().length > 0;

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const handleSave = async () => {
    if (!canSave || saving) return;
    try {
      setSaving(true);
      await onSave({
        full_name: fullName.trim(),
        nickname: nickname.trim(),
        country: country || null,
        trading_preferences: tradingPrefs,
        favourite_sessions: favSessions,
        show_nickname: showNickname,
      });
    } finally {
      setSaving(false);
    }
  };

  const Checkbox = ({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) => (
    <label
      onClick={onChange}
      style={{
        display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
        fontSize: 13, color: checked ? "hsl(0 0% 100%)" : dimText,
        padding: "4px 0", userSelect: "none",
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        border: `1px solid ${checked ? gold : "hsl(0 0% 100% / 0.2)"}`,
        background: checked ? "hsl(32 52% 64% / 0.2)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: gold,
      }}>
        {checked && "✓"}
      </span>
      {label}
    </label>
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 170,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        background: "hsl(0 0% 0% / 0.3)", backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(500px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          borderRadius: 20,
          border: `1px solid hsl(32 52% 64% / 0.3)`,
          background: "linear-gradient(145deg, hsl(30 40% 10% / 0.94), hsl(0 0% 4% / 0.9))",
          boxShadow: "0 24px 80px hsl(0 0% 0% / 0.5)",
          padding: 28, color: "hsl(0 0% 100%)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, color: gold, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>MY PROFILE</h2>
            <p style={{ margin: "6px 0 0", color: dimText, fontSize: 13 }}>Your identity in the lounge.</p>
          </div>
          <button onClick={onClose} style={{
            width: 34, height: 34, borderRadius: 999,
            border: "1px solid hsl(0 0% 100% / 0.12)",
            background: "hsl(0 0% 100% / 0.04)",
            color: "hsl(0 0% 100% / 0.72)", cursor: "pointer", fontSize: 18, lineHeight: 1,
          }} aria-label="Close profile dialog">×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Full Name */}
          <div>
            <label style={labelStyle}>Full Name <span style={{ color: gold }}>*</span></label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Enter your full name" style={inputStyle} />
          </div>

          {/* Nickname */}
          <div>
            <label style={labelStyle}>Nickname <span style={{ color: "hsl(0 0% 100% / 0.38)", fontWeight: 400 }}>(optional)</span></label>
            <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="How people will see you in chat" style={inputStyle} />
          </div>

          {/* Show in chat toggle */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 10 }}>Show in chat as</label>
            <div style={{ display: "flex", gap: 12 }}>
              {[{ val: false, label: "Full Name" }, { val: true, label: "Nickname" }].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => setShowNickname(opt.val)}
                  disabled={opt.val && !nickname.trim()}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    border: `1px solid ${showNickname === opt.val ? gold : "hsl(0 0% 100% / 0.12)"}`,
                    background: showNickname === opt.val ? "hsl(32 52% 64% / 0.16)" : "hsl(0 0% 100% / 0.04)",
                    color: showNickname === opt.val ? gold : dimText,
                    cursor: opt.val && !nickname.trim() ? "not-allowed" : "pointer",
                    opacity: opt.val && !nickname.trim() ? 0.4 : 1,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: border }} />

          {/* Country */}
          <div>
            <label style={labelStyle}>Country</label>
            <select
              value={country}
              onChange={e => setCountry(e.target.value)}
              style={{
                ...inputStyle,
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23C4A265' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 14px center",
              }}
            >
              <option value="" style={{ background: "#111" }}>Select country</option>
              {COUNTRIES.map(c => (
                <option key={c} value={c} style={{ background: "#111" }}>{c}</option>
              ))}
            </select>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: border }} />

          {/* Trading Preferences */}
          <div>
            <label style={labelStyle}>I Trade</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
              {TRADING_OPTIONS.map(opt => (
                <Checkbox
                  key={opt.value}
                  checked={tradingPrefs.includes(opt.value)}
                  label={opt.label}
                  onChange={() => setTradingPrefs(prev => toggleArray(prev, opt.value))}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: border }} />

          {/* Favourite Sessions */}
          <div>
            <label style={labelStyle}>Favourite Trading Sessions</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
              {SESSION_OPTIONS.map(opt => (
                <Checkbox
                  key={opt.value}
                  checked={favSessions.includes(opt.value)}
                  label={opt.label}
                  onChange={() => setFavSessions(prev => toggleArray(prev, opt.value))}
                />
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              marginTop: 4, padding: "12px 16px", borderRadius: 10,
              border: `1px solid hsl(32 52% 64% / 0.38)`,
              background: canSave ? "hsl(32 52% 64% / 0.16)" : "hsl(0 0% 100% / 0.04)",
              color: canSave ? gold : "hsl(0 0% 100% / 0.32)",
              fontSize: 14, fontWeight: 700, letterSpacing: 0.3,
              cursor: canSave && !saving ? "pointer" : "default",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
