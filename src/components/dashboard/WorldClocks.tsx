import { useState, useEffect } from "react";
import { C } from "@/lib/mock-data";

export interface ClockConfig {
  city: string;
  abbr: string;
  timezone: string;
}

export const DEFAULT_CLOCKS: ClockConfig[] = [
  { city: "Sydney", abbr: "SYD", timezone: "Australia/Sydney" },
  { city: "Tokyo", abbr: "TYO", timezone: "Asia/Tokyo" },
  { city: "London", abbr: "LDN", timezone: "Europe/London" },
  { city: "New York", abbr: "NYC", timezone: "America/New_York" },
  { city: "Chicago", abbr: "CHI", timezone: "America/Chicago" },
  { city: "Los Angeles", abbr: "LAX", timezone: "America/Los_Angeles" },
];

export const AVAILABLE_CITIES: ClockConfig[] = [
  ...DEFAULT_CLOCKS,
  { city: "Dubai", abbr: "DXB", timezone: "Asia/Dubai" },
  { city: "Hong Kong", abbr: "HKG", timezone: "Asia/Hong_Kong" },
  { city: "Singapore", abbr: "SGP", timezone: "Asia/Singapore" },
  { city: "Frankfurt", abbr: "FRA", timezone: "Europe/Berlin" },
  { city: "Mumbai", abbr: "BOM", timezone: "Asia/Kolkata" },
  { city: "Shanghai", abbr: "SHA", timezone: "Asia/Shanghai" },
  { city: "Zurich", abbr: "ZRH", timezone: "Europe/Zurich" },
  { city: "Toronto", abbr: "YYZ", timezone: "America/Toronto" },
  { city: "São Paulo", abbr: "GRU", timezone: "America/Sao_Paulo" },
  { city: "Johannesburg", abbr: "JNB", timezone: "Africa/Johannesburg" },
];

interface SessionInfo {
  label: string;
  highlightTimezones: string[];
}

function getSession(utcHour: number): SessionInfo {
  if (utcHour >= 0 && utcHour < 7)
    return { label: "Asian Session", highlightTimezones: ["Asia/Tokyo"] };
  if (utcHour >= 7 && utcHour < 8)
    return { label: "Asian/London Overlap", highlightTimezones: ["Asia/Tokyo", "Europe/London"] };
  if (utcHour >= 8 && utcHour < 12)
    return { label: "London Session", highlightTimezones: ["Europe/London"] };
  if (utcHour >= 12 && utcHour < 13)
    return { label: "London/NY Overlap", highlightTimezones: ["Europe/London", "America/New_York"] };
  if (utcHour >= 13 && utcHour < 21)
    return { label: "New York Session", highlightTimezones: ["America/New_York"] };
  return { label: "Late NY / Pre-Asian", highlightTimezones: [] };
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

const TZ_ABBR_MAP: Record<string, string> = {
  "Pacific/Auckland": "AKL", "Australia/Sydney": "SYD", "Australia/Melbourne": "MEL",
  "Asia/Tokyo": "TYO", "Asia/Hong_Kong": "HKG", "Asia/Singapore": "SGP",
  "Asia/Kolkata": "BOM", "Asia/Dubai": "DXB", "Europe/London": "LDN",
  "Europe/Berlin": "FRA", "Europe/Zurich": "ZRH", "America/New_York": "NYC",
  "America/Chicago": "CHI", "America/Denver": "DEN", "America/Los_Angeles": "LAX",
  "America/Toronto": "YYZ", "America/Sao_Paulo": "GRU",
};

function getLocalClock(): ClockConfig {
  const tz = getLocalTimezone();
  const abbr = TZ_ABBR_MAP[tz] || tz.split("/").pop()?.slice(0, 3).toUpperCase() || "LOC";
  return { city: "Local", abbr, timezone: tz };
}

interface WorldClocksProps {
  clocks?: ClockConfig[];
  onSessionChange?: (session: string) => void;
}

export default function WorldClocks({ clocks, onSessionChange }: WorldClocksProps) {
  const [now, setNow] = useState(new Date());
  const activeClocks = clocks && clocks.length > 0 ? clocks : DEFAULT_CLOCKS;
  const localClock = getLocalClock();
  // Prepend local clock, skip if it duplicates an existing one
  const localDuplicate = activeClocks.some(c => c.timezone === localClock.timezone);
  const allClocks = localDuplicate ? activeClocks : [localClock, ...activeClocks];
    return () => clearInterval(id);
  }, []);

  const utcHour = now.getUTCHours();
  const session = getSession(utcHour);

  useEffect(() => {
    onSessionChange?.(session.label);
  }, [session.label, onSessionChange]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {activeClocks.map((clock) => {
        const timeStr = now.toLocaleTimeString("en-GB", {
          timeZone: clock.timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        const isHighlighted = session.highlightTimezones.includes(clock.timezone);
        const isLocal = localTz === clock.timezone;

        return (
          <div
            key={clock.timezone}
            style={{
              width: 70,
              height: 40,
              borderRadius: 8,
              background: C.card,
              border: `1px solid ${isHighlighted ? C.jade : C.border}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              flexShrink: 0,
              transition: "border-color 0.3s",
            }}
          >
            <span style={{ fontSize: 9, color: C.muted, fontWeight: 600, letterSpacing: 0.5, lineHeight: 1 }}>
              {clock.abbr}
            </span>
            <span
              style={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                color: isHighlighted ? C.jade : C.text,
                fontWeight: 600,
                lineHeight: 1.3,
              }}
            >
              {timeStr}
            </span>
            {isLocal && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -4,
                  fontSize: 7,
                  fontWeight: 700,
                  color: C.bg,
                  background: C.amber,
                  padding: "1px 3px",
                  borderRadius: 3,
                  lineHeight: 1.2,
                }}
              >
                LOCAL
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
