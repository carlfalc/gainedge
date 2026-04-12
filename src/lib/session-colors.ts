/**
 * Canonical trading session definitions used platform-wide.
 * Import these anywhere sessions are referenced to keep colours consistent.
 */

export interface SessionDef {
  key: "asian" | "london" | "new_york";
  label: string;
  color: string;
  startUtcHour: number;
  endUtcHour: number;
}

export const SESSION_COLORS = {
  asian: "#A78BFA",
  london: "#3B82F6",
  new_york: "#FACC15",
} as const;

export const SESSIONS: SessionDef[] = [
  { key: "asian", label: "Asian", color: SESSION_COLORS.asian, startUtcHour: 0, endUtcHour: 8 },
  { key: "london", label: "London", color: SESSION_COLORS.london, startUtcHour: 8, endUtcHour: 16 },
  { key: "new_york", label: "New York", color: SESSION_COLORS.new_york, startUtcHour: 16, endUtcHour: 21 },
];

export type SessionKey = "asian" | "london" | "new_york";

/** Detect which sessions are currently active. */
export function getActiveSessions(): SessionDef[] {
  const h = new Date().getUTCHours();
  return SESSIONS.filter(s => h >= s.startUtcHour && h < s.endUtcHour);
}

/** Get the primary session (most recently started). */
export function getCurrentSession(): SessionDef | null {
  const active = getActiveSessions();
  if (active.length === 0) return null;
  const h = new Date().getUTCHours();
  return active.reduce((a, b) => {
    const aDist = (h - a.startUtcHour + 24) % 24;
    const bDist = (h - b.startUtcHour + 24) % 24;
    return aDist < bDist ? a : b;
  });
}

/** Which sessions have already completed today. */
export function getCompletedSessions(): SessionDef[] {
  const h = new Date().getUTCHours();
  return SESSIONS.filter(s => h >= s.endUtcHour);
}

/** Format a UTC hour as a local time string. */
export function formatLocalHour(utcHour: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, 0));
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}
