// GAINEDGE_ASK_RON_GLOBAL_CONTEXT_BRIDGE_V1
// Global Ask RON entry point. Opens the existing /dashboard/ai page in a new tab.
// The only context that can ever survive is an exact stored-record
// {instrument,timeframe} pair explicitly present on the RON Decision route.
// Nothing else is read, transported, persisted, or appended to the URL.
import { askRonContextHref, parseAskRonContext } from "@/lib/ask-ron-context";

export const ASK_RON_ROUTE = "/dashboard/ai";

/** Only route the V1 bridge is allowed to carry a stored pair from. */
const CONTEXT_ROUTE = "/dashboard/ron-decision";

/** Privacy-safe route data only. */
export interface RonPopoutContext {
  page?: string;
  search?: string;
}

export function openRonPopout(context: RonPopoutContext = {}) {
  if (typeof window === "undefined") return;

  const page = typeof context.page === "string" ? context.page : undefined;
  const search = typeof context.search === "string" ? context.search : undefined;

  if (page === CONTEXT_ROUTE && search) {
    const pair = parseAskRonContext(new URLSearchParams(search));
    if (pair) {
      window.open(askRonContextHref(pair.instrument, pair.timeframe), "_blank", "noopener");
      return;
    }
  }

  window.open(ASK_RON_ROUTE, "_blank", "noopener");
}