/**
 * GAINEDGE_GLOBAL_SIGNAL_POPUP_V1 — guards for the global Falconer notification layer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  MAX_VISIBLE_NOTIFICATIONS, NOTIFICATION_SOURCE_QUALIFIER, applyBaseline,
  createSignalNotificationState, deriveNotification, newEventKey, pushVisible,
  resetSignalNotificationState, statusEventKey, viewSignalHref,
  type FalconerNotificationRow,
} from "@/lib/signal-notifications";

const row = (over: Partial<FalconerNotificationRow> = {}): FalconerNotificationRow => ({
  id: "r1", symbol: "XAUUSD", timeframe: "15m", mode: "live", direction: "long",
  trigger_type: "tpLong", status: "open", opened_at: "2026-08-25T05:00:00Z", ...over,
});

const COMPONENT = readFileSync("src/components/dashboard/GlobalSignalNotifications.tsx", "utf8");
const LAYOUT = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");
const PAGE = readFileSync("src/pages/dashboard/SignalsPage.tsx", "utf8");
const TAB = readFileSync("src/components/signals/FalconerSignalsTab.tsx", "utf8");

describe("baseline and dedupe", () => {
  it("1. baseline rows produce zero notifications", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, [row(), row({ id: "r2", status: "tp1_hit" })]);
    expect(deriveNotification(s, row(), "INSERT")).toBeNull();
    expect(deriveNotification(s, row({ id: "r2", status: "tp1_hit" }), "UPDATE")).toBeNull();
  });

  it("2. a new inserted live row produces exactly one popup", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, []);
    const n = deriveNotification(s, row({ id: "new1" }), "INSERT");
    expect(n).not.toBeNull();
    expect(n!.kind).toBe("new");
    expect(n!.symbol).toBe("XAUUSD");
  });

  it("3. a replayed insert does not produce a second popup", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, []);
    expect(deriveNotification(s, row({ id: "new1" }), "INSERT")).not.toBeNull();
    expect(deriveNotification(s, row({ id: "new1" }), "INSERT")).toBeNull();
  });

  it("4/5. status transition notifies once and replay is ignored", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, [row({ id: "r9", status: "open" })]);
    const n = deriveNotification(s, row({ id: "r9", status: "tp1_hit" }), "UPDATE");
    expect(n!.kind).toBe("status");
    expect(n!.statusLabel).toBe("TP1 hit");
    expect(deriveNotification(s, row({ id: "r9", status: "tp1_hit" }), "UPDATE")).toBeNull();
  });

  it("6. unknown status is prettified, not reinterpreted", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, [row({ id: "r9", status: "open" })]);
    const n = deriveNotification(s, row({ id: "r9", status: "closed_mystery" }), "UPDATE");
    expect(n!.statusLabel).toBe("Closed mystery");
    expect(n!.statusUnknown).toBe(true);
  });

  it("8. backtest records are ignored", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, []);
    expect(deriveNotification(s, row({ id: "b1", mode: "backtest" }), "INSERT")).toBeNull();
  });

  it("9. reset clears dedupe state for a user switch", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, [row()]);
    resetSignalNotificationState(s);
    expect(s.seen.size).toBe(0);
    expect(s.baselineReady).toBe(false);
    // Nothing notifies before a fresh baseline is established.
    expect(deriveNotification(s, row(), "INSERT")).toBeNull();
  });

  it("event keys distinguish new records from status transitions", () => {
    expect(newEventKey("a")).toBe("new:a");
    expect(statusEventKey("a", "tp1_hit")).toBe("status:a:tp1_hit");
  });

  it("visible stack is capped but dedupe history is separate", () => {
    const s = createSignalNotificationState();
    applyBaseline(s, []);
    let stack: ReturnType<typeof pushVisible> = [];
    for (let i = 0; i < 6; i++) {
      const n = deriveNotification(s, row({ id: `x${i}` }), "INSERT");
      stack = pushVisible(stack, n!);
    }
    expect(stack).toHaveLength(MAX_VISIBLE_NOTIFICATIONS);
    // aged-out toasts remain deduped
    expect(deriveNotification(s, row({ id: "x0" }), "INSERT")).toBeNull();
  });
});

describe("scoping, links and copy", () => {
  it("7. subscription and baseline query are scoped to the signed-in user", () => {
    expect(COMPONENT).toContain("filter: `user_id=eq.${userId}`");
    expect(COMPONENT).toContain('.eq("user_id", userId)');
    expect(COMPONENT).toContain('.eq("mode", "live")');
  });

  it("10. View signal deep link opens Falconer and preserves symbol", () => {
    expect(viewSignalHref("XAUUSD")).toBe("/dashboard/signals?tab=falconer&symbol=XAUUSD");
    expect(viewSignalHref("XAU/USD", "r1"))
      .toBe("/dashboard/signals?tab=falconer&symbol=XAU%2FUSD&record=r1");
    expect(PAGE).toContain("readTabParam");
    expect(PAGE).toContain('params.get("symbol")');
    expect(TAB).toContain("initialSymbol");
  });

  it("11. Ask RON reuses the shared context helper", () => {
    expect(COMPONENT).toContain("askRonContextHref(n.symbol, n.timeframe)");
  });

  it("12. copy avoids BUY/SELL board, probability and broker execution language", () => {
    expect(NOTIFICATION_SOURCE_QUALIFIER).toBe("Falconer strategy record · not a broker order");
    expect(COMPONENT).not.toMatch(/\bBUY\b|\bSELL\b/);
    expect(COMPONENT).not.toMatch(/probability|confidence|executed|order placed/i);
  });

  it("13. the legacy TradeNotificationPopup is retired and not mounted", () => {
    expect(existsSync("src/components/dashboard/TradeNotificationPopup.tsx")).toBe(false);
    expect(LAYOUT).not.toContain("TradeNotificationPopup");
    expect(LAYOUT).toContain("<GlobalSignalNotifications />");
  });

  it("15. RON popup delivery stays deferred, with no polling workaround", () => {
    expect(COMPONENT).toMatch(/RON popups are intentionally NOT delivered/);
    expect(COMPONENT).not.toContain("setInterval");
  });
});
