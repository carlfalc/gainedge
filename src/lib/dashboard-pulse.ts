/**
 * GAINEDGE_DASHBOARD_UI_V1 — pure derivation of the "RON Pulse" items shown at the
 * top of the dashboard.
 *
 * Governance:
 * - Only facts already present in dashboard sources are turned into items.
 * - No persisted Opportunity Context lifecycle exists yet, so no forming /
 *   strengthening / confirmed state is ever emitted. The RON market-state item is
 *   explicitly labelled as watch context.
 * - There is no persisted last-login timestamp, so this is a "Latest market update"
 *   surface, never a "since last login" feed.
 * - When nothing qualifies, callers render the calm empty state.
 */
import { ronSummarySentence } from "@/lib/dashboard-ron-summary";
import { ronStateLabel } from "@/services/ron-snapshots";

export const PULSE_TITLE = "RON Pulse";
export const PULSE_SUBTITLE = "Latest market update";
export const PULSE_EMPTY_TEXT = "No material change in your tracked markets.";

export type PulseKind = "ron_state" | "data_health" | "news" | "session";
export type PulseTone = "jade" | "amber" | "red" | "neutral";

export interface PulseItem {
  id: string;
  kind: PulseKind;
  title: string;
  detail: string;
  /** Source instant this statement is about; null when the source has none. */
  timestamp: string | null;
  /** Human label for what the timestamp means. */
  timestampLabel: string;
  tone: PulseTone;
  /** Optional educational / contextual lines rendered under the detail. */
  context?: string[];
}


export interface PulseSnapshot {
  symbol: string;
  timeframe: string;
  bar_time: string;
  data_health: string;
  features: Record<string, unknown> | null;
  /** Client watch heuristic label, e.g. "WATCH" — never a qualified opportunity. */
  state: string | null;
  /** Directional side of the stored evidence ("LONG" | "SHORT"), or null. */
  bias?: string | null;
}

export interface PulseNews {
  headline: string;
  published_at: string;
  instruments: string[];
}

export interface PulseInput {
  snapshots: PulseSnapshot[];
  news: PulseNews[];
  /** Canonical session label for "now", or null when unavailable. */
  sessionLabel: string | null;
  sessionInstant: string | null;
  marketOpen: boolean;
}

const STATE_RANK: Record<string, number> = { "SETUP FORMING": 3, WATCH: 2, WAIT: 1 };

/** Highest-attention tracked market by client watch heuristic, then by newest bar. */
export function rankSnapshots(snapshots: PulseSnapshot[]): PulseSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const ra = STATE_RANK[a.state ?? ""] ?? 0;
    const rb = STATE_RANK[b.state ?? ""] ?? 0;
    if (ra !== rb) return rb - ra;
    return new Date(b.bar_time).getTime() - new Date(a.bar_time).getTime();
  });
}

export function buildPulseItems(input: PulseInput, max = 4): PulseItem[] {
  const items: PulseItem[] = [];

  // 1. What matters right now — the highest-attention tracked market state.
  const ranked = rankSnapshots(input.snapshots);
  const top = ranked[0];
  if (top && top.state) {
    const rank = STATE_RANK[top.state] ?? 0;
    items.push({
      id: `ron-state-${top.symbol}`,
      kind: "ron_state",
      title: `${top.symbol} ${top.timeframe} · ${ronStateLabel(top.state, top.bias)}`,
      detail: ronSummarySentence(top.features) ?? "Stored snapshot has no readable feature fields.",
      timestamp: top.bar_time,
      timestampLabel: `completed ${top.timeframe} close`,
      tone: rank >= 3 ? "jade" : rank === 2 ? "amber" : "neutral",
    });
  }

  // 2. Data health — only when a tracked snapshot genuinely reports a problem.
  const unhealthy = input.snapshots.filter((s) => s.data_health && s.data_health !== "healthy");
  if (unhealthy.length > 0) {
    const worst = unhealthy[0];
    items.push({
      id: "data-health",
      kind: "data_health",
      title: `Data health: ${worst.data_health}`,
      detail:
        unhealthy.length === 1
          ? `${worst.symbol} ${worst.timeframe} source data is ${worst.data_health}. Statements about it are not a current assessment.`
          : `${unhealthy.length} tracked markets report non-healthy source data. Statements about them are not a current assessment.`,
      timestamp: worst.bar_time,
      timestampLabel: `completed ${worst.timeframe} close`,
      tone: "red",
    });
  }

  // 3. Newest relevant headline. Relevance/adjacency is not causality.
  const newest = [...input.news].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
  )[0];
  if (newest) {
    const tags = newest.instruments.filter(Boolean);
    const edu = buildHeadlineContext(newest.headline, tags);
    items.push({
      id: "news",
      kind: "news",
      title: "Newest headline",
      detail: tags.length
        ? `${newest.headline} · tagged ${tags.slice(0, 4).join(", ")}`
        : newest.headline,
      timestamp: newest.published_at,
      timestampLabel: "published",
      tone: "neutral",
      context: [edu.statusLine, ...edu.lines],
    });
  }

  // 4. Session context + observed best opportunities so far this session.
  if (input.sessionLabel) {
    const now = input.sessionInstant ? new Date(input.sessionInstant) : new Date();
    const statuses = venueStatuses(now);
    const anyOpen = statuses.some((s) => s.open);
    const opps = bestOpportunitiesThisSession(input.snapshots, now);
    items.push({
      id: "session",
      kind: "session",
      title: input.marketOpen ? `Session: ${input.sessionLabel}` : "Market closed",
      detail: input.marketOpen
        ? `Current session context is ${input.sessionLabel}.`
        : `Venue is closed. ${input.sessionLabel} is the last classified session context.`,
      timestamp: input.sessionInstant,
      timestampLabel: "evaluated",
      tone: input.marketOpen ? "neutral" : "amber",
      context: [venueBoardLine(statuses), ...sessionOpportunityLines(opps, anyOpen)],
    });
  }


  return items.slice(0, max);
}

/** Newest source instant across the rendered items — drives the "Updated Xm ago" line. */
export function pulseLatestTimestamp(items: PulseItem[]): string | null {
  const stamps = items
    .map((i) => i.timestamp)
    .filter((t): t is string => !!t && Number.isFinite(new Date(t).getTime()));
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b));
}
