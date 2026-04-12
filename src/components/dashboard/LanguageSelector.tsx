import { useState, useRef, useEffect, createContext, useContext } from "react";
import { Globe } from "lucide-react";
import { C } from "@/lib/mock-data";

export interface Language {
  code: string;
  label: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
];

interface LanguageContextValue {
  language: string;
  setLanguage: (code: string) => void;
  currentLanguage: Language;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  currentLanguage: LANGUAGES[0],
});

export const useLanguage = () => useContext(LanguageContext);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState(() => localStorage.getItem("gainedge_language") || "en");

  const setLanguage = (code: string) => {
    setLang(code);
    localStorage.setItem("gainedge_language", code);
  };

  const currentLanguage = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, currentLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export default function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { language, setLanguage, currentLanguage } = useLanguage();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Change language"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: 10, cursor: "pointer",
          background: C.card, border: `1px solid ${C.border}`,
          color: C.sec, fontSize: 12, fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = C.jade}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
      >
        <Globe size={14} />
        <span>{currentLanguage.flag}</span>
        <span style={{ fontSize: 11 }}>{currentLanguage.code.toUpperCase()}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 40, right: 0,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 6, minWidth: 180, zIndex: 100,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          maxHeight: 320, overflowY: "auto",
        }}>
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => { setLanguage(lang.code); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: language === lang.code ? C.jade + "18" : "none",
                color: language === lang.code ? C.jade : C.text,
                fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                fontWeight: language === lang.code ? 700 : 500,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (language !== lang.code) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { if (language !== lang.code) e.currentTarget.style.background = "none"; }}
            >
              <span style={{ fontSize: 18 }}>{lang.flag}</span>
              <span>{lang.label}</span>
              {language === lang.code && <span style={{ marginLeft: "auto", fontSize: 11, color: C.jade }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
