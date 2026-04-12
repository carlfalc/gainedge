import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_CLOCKS, AVAILABLE_CITIES, type ClockConfig } from "@/components/dashboard/WorldClocks";

export default function ClockSettingsPage() {
  const [clockSlots, setClockSlots] = useState<ClockConfig[]>(DEFAULT_CLOCKS);
  const [userId, setUserId] = useState<string>();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserId(session.user.id);
        supabase.from("profiles").select("clock_timezones").eq("id", session.user.id).single().then(({ data }) => {
          if (data?.clock_timezones && Array.isArray(data.clock_timezones) && data.clock_timezones.length > 0) {
            setClockSlots(data.clock_timezones as unknown as ClockConfig[]);
          }
        });
      }
    });
  }, []);

  const updateSlot = (index: number, timezone: string) => {
    const city = AVAILABLE_CITIES.find(c => c.timezone === timezone);
    if (!city) return;
    setClockSlots(prev => prev.map((s, i) => i === index ? { ...city } : s));
  };

  const handleSave = async () => {
    if (!userId) return;
    await supabase.from("profiles").update({ clock_timezones: clockSlots as any }).eq("id", userId);
    toast.success("Clock preferences saved");
  };

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8 }}>World Clock Preferences</h1>
      <p style={{ fontSize: 13, color: C.sec, marginBottom: 24 }}>Customize the 6 world market clocks shown in your dashboard header.</p>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
        {clockSlots.map((slot, i) => {
          const timeStr = now.toLocaleTimeString("en-GB", {
            timeZone: slot.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
          });
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 16, padding: "12px 0",
              borderBottom: i < 5 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ width: 70, fontSize: 12, fontWeight: 700, color: C.muted }}>Clock {i + 1}</div>
              <select
                value={slot.timezone}
                onChange={e => updateSlot(i, e.target.value)}
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.bg, color: C.text,
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none",
                }}
              >
                {AVAILABLE_CITIES.map(c => (
                  <option key={c.timezone} value={c.timezone}>{c.abbr} — {c.city} ({c.timezone})</option>
                ))}
              </select>
              <div style={{
                width: 90, textAlign: "center", fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace", color: C.jade, fontWeight: 600,
              }}>
                {timeStr}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        style={{
          padding: "12px 32px", borderRadius: 8, border: "none", cursor: "pointer",
          fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
          background: `linear-gradient(135deg, ${C.jade}, ${C.teal})`, color: C.bg,
        }}
      >
        Save Clock Preferences
      </button>
    </div>
  );
}
