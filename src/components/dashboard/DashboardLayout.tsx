import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Zap, BookOpen, BarChart3, RefreshCw, Calendar,
  Settings, ChevronLeft, ChevronRight, LogOut, User, Lightbulb, Clock, DollarSign, Newspaper, Globe, CandlestickChart
} from "lucide-react";
import { C } from "@/lib/mock-data";
import { useSeedData } from "@/hooks/use-seed-data";
import WorldClocks, { DEFAULT_CLOCKS, type ClockConfig } from "./WorldClocks";
import BrokerModal from "./BrokerModal";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Signals", icon: Zap, path: "/dashboard/signals" },
  { label: "Trade Journal", icon: BookOpen, path: "/dashboard/journal" },
  { label: "Analytics", icon: BarChart3, path: "/dashboard/analytics" },
  { label: "Insights", icon: Lightbulb, path: "/dashboard/insights" },
  { label: "Backtesting", icon: RefreshCw, path: "/dashboard/backtesting" },
  { label: "Calendar", icon: Calendar, path: "/dashboard/calendar" },
  { label: "Settings", icon: Settings, path: "/dashboard/settings" },
  { label: "Clock Settings", icon: Clock, path: "/dashboard/clock-settings" },
  { label: "News Settings", icon: Newspaper, path: "/dashboard/news-settings" },
  { label: "My News", icon: Globe, path: "/dashboard/my-news" },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState<string>();
  const [sessionLabel, setSessionLabel] = useState("London Session");
  const [clockConfigs, setClockConfigs] = useState<ClockConfig[]>(DEFAULT_CLOCKS);
  const [brokerOpen, setBrokerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useSeedData(userId);

  const handleSessionChange = useCallback((label: string) => {
    setSessionLabel(label);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/");
      } else {
        setUserEmail(session.user.email || "");
        setUserId(session.user.id);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/");
      else {
        setUserEmail(session.user.email || "");
        setUserId(session.user.id);
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Load clock preferences from profile
  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("clock_timezones").eq("id", userId).single().then(({ data }) => {
      if (data?.clock_timezones && Array.isArray(data.clock_timezones) && data.clock_timezones.length > 0) {
        setClockConfigs(data.clock_timezones as unknown as ClockConfig[]);
      }
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

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
      {/* SIDEBAR */}
      <aside style={{
        width: collapsed ? 64 : 240, transition: "width 0.25s ease",
        background: C.bg2, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", flexShrink: 0,
        position: "sticky", top: 0, height: "100vh", overflow: "hidden",
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? "20px 12px" : "20px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.border}` }}>
          {!collapsed ? (
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
              <span style={{ color: C.text }}>G</span>
              <span style={{ color: C.jade }}>AI</span>
              <span style={{ color: C.text }}>NEDGE</span>
            </span>
          ) : (
            <span style={{ fontSize: 18, fontWeight: 800, color: C.jade }}>G</span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: collapsed ? "10px 0" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 10, border: "none", cursor: "pointer",
                background: isActive(item.path) ? C.jade + "14" : "transparent",
                color: isActive(item.path) ? C.jade : C.sec,
                fontSize: 13, fontWeight: isActive(item.path) ? 600 : 500,
                fontFamily: "'DM Sans', sans-serif",
                transition: "all 0.2s",
                borderLeft: isActive(item.path) ? `2px solid ${C.jade}` : "2px solid transparent",
              }}
              onMouseEnter={e => { if (!isActive(item.path)) { e.currentTarget.style.color = C.text; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; } }}
              onMouseLeave={e => { if (!isActive(item.path)) { e.currentTarget.style.color = C.sec; e.currentTarget.style.background = "transparent"; } }}
            >
              <item.icon size={18} strokeWidth={1.8} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
          {/* Broker button */}
          <button
            onClick={() => setBrokerOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: collapsed ? "10px 0" : "10px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              borderRadius: 10, border: "none", cursor: "pointer",
              background: "transparent",
              color: "#F59E0B",
              fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
              borderLeft: "2px solid transparent",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <DollarSign size={18} strokeWidth={1.8} />
            {!collapsed && <span>Broker</span>}
          </button>
          {/* Charts button */}
          <button
            onClick={() => navigate("/dashboard/charts")}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: collapsed ? "10px 0" : "10px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              borderRadius: 10, border: "none", cursor: "pointer",
              background: isActive("/dashboard/charts") ? "rgba(245,158,11,0.12)" : "transparent",
              color: "#F59E0B",
              fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
              borderLeft: isActive("/dashboard/charts") ? "2px solid #F59E0B" : "2px solid transparent",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.08)"; }}
            onMouseLeave={e => { if (!isActive("/dashboard/charts")) e.currentTarget.style.background = "transparent"; }}
          >
            <CandlestickChart size={18} strokeWidth={1.8} />
            {!collapsed && <span>Charts</span>}
          </button>
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 12, borderTop: `1px solid ${C.border}`,
            background: "none", border: "none", cursor: "pointer", color: C.muted,
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* TOP BAR */}
        <header style={{
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", borderBottom: `1px solid ${C.border}`, background: C.bg,
          position: "sticky", top: 0, zIndex: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse-dot 2s infinite" }} />
            <span style={{ color: C.green, fontSize: 12, fontWeight: 700 }}>{sessionLabel}</span>
            <span style={{ color: C.muted, fontSize: 12 }}>•</span>
            <span style={{ color: C.muted, fontSize: 12 }}>Last scan: 2 min ago</span>
            <WorldClocks clocks={clockConfigs} onSessionChange={handleSessionChange} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", marginLeft: "auto" }}>
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
                  <LogOut size={15} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          <Outlet />
        </main>
      </div>
      <BrokerModal open={brokerOpen} onClose={() => setBrokerOpen(false)} userId={userId} />
    </div>
  );
}
