// Global Ask RON entry point.
// Opens the existing /dashboard/ai page in a new tab.
// The optional context argument is accepted for call-site compatibility only —
// it is intentionally NOT transmitted, persisted, or appended to the URL.
export const ASK_RON_ROUTE = "/dashboard/ai";

export function openRonPopout(_context: Record<string, string | undefined> = {}) {
  if (typeof window === "undefined") return;
  window.open(ASK_RON_ROUTE, "_blank", "noopener");
}