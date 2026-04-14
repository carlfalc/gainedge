import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, Zap, BookOpen, BarChart3, RefreshCw, Calendar,
  Settings, LogOut, User, Lightbulb, Clock, DollarSign, Newspaper, Globe, CandlestickChart, ExternalLink, Sun, Moon, Mic, Wine
} from "lucide-react";
import { C } from "@/lib/mock-data";
import { useSeedData } from "@/hooks/use-seed-data";
import LanguageSelector, { LanguageProvider } from "./LanguageSelector";
import ronAvatar from "@/assets/ron-avatar.png";

/** Light background context — consumed by any page that wants to adapt */
export const LightBgContext = createContext<boolean>(false);
import WorldClocks, { DEFAULT_CLOCKS, type ClockConfig } from "./WorldClocks";
import BrokerModal from "./BrokerModal";
import AskRonModal from "./AskRonModal";
import TradeNotificationPopup from "./TradeNotificationPopup";

const NAV_ITEMS = [
  { labelKey: "nav.dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { labelKey: "nav.charts", icon: CandlestickChart, path: "/dashboard/charts", gold: true },
  { labelKey: "nav.tradingviewChart", icon: ExternalLink, path: "/dashboard/tradingview-chart", white: true },
  { labelKey: "nav.signals", icon: Zap, path: "/dashboard/signals" },
  { labelKey: "nav.journal", icon: BookOpen, path: "/dashboard/journal" },
  { labelKey: "nav.analytics", icon: BarChart3, path: "/dashboard/analytics" },
  { labelKey: "nav.insights", icon: Lightbulb, path: "/dashboard/insights" },
  { labelKey: "nav.backtesting", icon: RefreshCw, path: "/dashboard/backtesting" },
  { labelKey: "nav.calendar", icon: Calendar, path: "/dashboard/calendar" },
  { labelKey: "nav.settings", icon: Settings, path: "/dashboard/settings" },
  { labelKey: "nav.clockSettings", icon: Clock, path: "/dashboard/clock-settings" },
  { labelKey: "nav.newsSettings", icon: Newspaper, path: "/dashboard/news-settings" },
  { labelKey: "nav.myNews", icon: Globe, path: "/dashboard/my-news" },
  { labelKey: "nav.lounge", icon: Wine, path: "/dashboard/whisky-cigar-lounge", gold: true },
] as const;

export default function DashboardLayout() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState<string>();
  const [userName, setUserName] = useState("");
  const [userNickname, setUserNickname] = useState("");
  const [sessionLabel, setSessionLabel] = useState("London Session");
  const [clockConfigs, setClockConfigs] = useState<ClockConfig[]>(DEFAULT_CLOCKS);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [ronOpen, setRonOpen] = useState(false);
  const [lightBg, setLightBg] = useState(() => localStorage.getItem("gainedge_light_bg") === "1");
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useSeedData(userId);

  const sidebarWidth = collapsed && !hovered ? 0 : 240;

  const handleSessionChange = useCallback((label: string) => {
    setSessionLabel(label);
  }, []);

  useEffect(() => {
    let mounted = true;
    // First, check the existing session before subscribing to changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        navigate("/login", { replace: true });
      } else {
        setUserEmail(session.user.email || "");
        setUserId(session.user.id);
      }
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        // Double-check — transient refresh failures can emit SIGNED_OUT briefly
        const { data: { session: recheck } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!recheck) {
          navigate("/", { replace: true });
        }
      } else if (session) {
        setUserEmail(session.user.email || "");
        setUserId(session.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Load clock preferences from profile
  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("clock_timezones, full_name, nickname").eq("id", userId).single().then(({ data }) => {
      if (data?.clock_timezones && Array.isArray(data.clock_timezones) && data.clock_timezones.length > 0) {
        setClockConfigs(data.clock_timezones as unknown as ClockConfig[]);
      }
      if (data?.full_name) setUserName(data.full_name);
      if ((data as any)?.nickname) setUserNickname((data as any).nickname);
    });
  }, [userId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setCollapsed(true);
    setHovered(false);
  };

  // Don't render anything until auth check completes
  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.jade, fontSize: 16 }}>{t("dashboard.loading")}</div>
      </div>
    );
  }

  return (
    <LanguageProvider>
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
      {/* Hover trigger zone — always visible at left edge */}
      {collapsed && !hovered && (
        <div
          onMouseEnter={() => setHovered(true)}
          style={{
            position: "fixed", left: 0, top: 0, width: 12, height: "100vh",
            zIndex: 50, background: "transparent", cursor: "default",
          }}
        />
      )}

      {/* SIDEBAR */}
      <aside
        onMouseLeave={() => { if (collapsed) setHovered(false); }}
        style={{
          width: sidebarWidth, transition: "width 0.25s ease",
          background: C.bg2, borderRight: sidebarWidth > 0 ? `1px solid ${C.border}` : "none",
          display: "flex", flexDirection: "column", flexShrink: 0,
          position: "fixed", top: 0, left: 0, height: "100vh", overflow: "hidden",
          zIndex: 40,
        }}
      >
        {/* Logo */}
        <div style={{ padding: "20px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: C.text }}>G</span>
            <span style={{ color: C.jade }}>AI</span>
            <span style={{ color: C.text }}>NEDGE</span>
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(item => {
            const gold = 'gold' in item && item.gold;
            const white = 'white' in item && item.white;
            const activeColor = gold ? "#F59E0B" : white ? "#FFFFFF" : C.jade;
            const defaultColor = gold ? "#F59E0B" : white ? "#E2E8F0" : C.sec;
            const hoverColor = gold ? "#F59E0B" : white ? "#FFFFFF" : C.text;
            const hoverBg = gold ? "rgba(245,158,11,0.08)" : white ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)";
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  justifyContent: "flex-start",
                  borderRadius: 10, border: "none", cursor: "pointer",
                  background: isActive(item.path) ? activeColor + "14" : "transparent",
                  color: isActive(item.path) ? activeColor : defaultColor,
                  fontSize: 13, fontWeight: isActive(item.path) || gold || white ? 600 : 500,
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.2s",
                  borderLeft: isActive(item.path) ? `2px solid ${activeColor}` : "2px solid transparent",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (!isActive(item.path)) { e.currentTarget.style.color = hoverColor; e.currentTarget.style.background = hoverBg; } }}
                onMouseLeave={e => { if (!isActive(item.path)) { e.currentTarget.style.color = defaultColor; e.currentTarget.style.background = "transparent"; } }}
              >
                <item.icon size={18} strokeWidth={1.8} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Broker button */}
          <button
            onClick={() => setBrokerOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px",
              justifyContent: "flex-start",
              borderRadius: 10, border: "none", cursor: "pointer",
              background: "transparent",
              color: "#F59E0B",
              fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
              borderLeft: "2px solid transparent",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <DollarSign size={18} strokeWidth={1.8} />
            <span>{t("nav.broker")}</span>
          </button>
        </nav>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* TOP BAR */}
        <header style={{
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", borderBottom: `1px solid ${C.border}`, background: C.bg,
          position: "sticky", top: 0, zIndex: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse-dot 2s infinite" }} />
            <span style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>{sessionLabel}</span>
            <span style={{ color: C.muted, fontSize: 12 }}>•</span>
            <button
              onClick={() => setRonOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #00CFA5 0%, #0EA5E9 100%)",
                color: "#fff", fontSize: 11, fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: "0 0 12px rgba(0,207,165,0.3)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(0,207,165,0.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(0,207,165,0.3)"; }}
            >
              <img src={ronAvatar} alt="RON" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
              <span>{t("nav.askRon")}</span>
              <Mic size={12} style={{ opacity: 0.8 }} />
            </button>
            {(userNickname || userName) && (
              <>
                <span style={{ color: C.muted, fontSize: 12 }}>•</span>
                <span style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                  {userNickname || userName}
                </span>
              </>
            )}
          </div>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
            <WorldClocks clocks={clockConfigs} onSessionChange={handleSessionChange} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", marginLeft: "auto" }}>
            <button
              onClick={() => navigate("/dashboard")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#FFFFFF", fontSize: 13, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 8,
                transition: "opacity 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <LayoutDashboard size={15} /> {t("nav.dashboard")}
            </button>
            <LanguageSelector />
            {/* Light/Dark background toggle */}
            <button
              onClick={() => {
                const next = !lightBg;
                setLightBg(next);
                localStorage.setItem("gainedge_light_bg", next ? "1" : "0");
              }}
              title={lightBg ? "Switch to dark background" : "Switch to light background"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 10, cursor: "pointer",
                background: lightBg ? "#F1F5F9" : C.card,
                border: `1px solid ${lightBg ? "#CBD5E1" : C.border}`,
                color: lightBg ? "#334155" : C.sec,
                transition: "all 0.25s",
              }}
            >
              {lightBg ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 12px", borderRadius: 10, cursor: "pointer",
                background: C.card, border: `1px solid ${C.border}`,
                color: C.sec, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <User size={16} />
              {userEmail && <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</span>}
            </button>
            {userMenuOpen && (
              <div style={{
                position: "absolute", top: 44, right: 0,
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: 6, minWidth: 160, zIndex: 100,
              }}>
                <button
                  onClick={handleLogout}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "10px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: "none", color: C.red, fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                >
                  <LogOut size={15} /> {t("nav.signOut")}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main style={{ flex: 1, padding: 24, overflowY: "auto", background: lightBg ? "#F8FAFC" : "transparent", transition: "background 0.3s" }}>
          <LightBgContext.Provider value={lightBg}>
            <Outlet />
          </LightBgContext.Provider>
        </main>
      </div>
      <BrokerModal open={brokerOpen} onClose={() => setBrokerOpen(false)} userId={userId} />
      
      <AskRonModal
        open={ronOpen}
        onClose={() => setRonOpen(false)}
        context={{
          page: location.pathname,
          sessionLabel,
          userName: userName || undefined,
          userId: userId || undefined,
        }}
      />
      <TradeNotificationPopup />
    </div>
    </LanguageProvider>
  );
}
