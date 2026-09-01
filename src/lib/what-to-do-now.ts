/**
 * GAINEDGE_WHAT_TO_DO_NOW_V1 — a plain-English "what to do now" briefing built ONLY
 * from stored RON evidence (latest snapshot features/patterns + latest stored
 * opportunity-context row + broker quote freshness).
 *
 * Truthfulness rules:
 * - No probability, no confidence score, no invented entry/stop/target.
 * - Every line is derived from a field that is actually present; absent fields are omitted.
 * - When RON has no qualified opportunity, the briefing says WAIT — it never manufactures one.
 */
import { ronStateFrom, ronBiasFrom, type RonState, type RonBias } from "@/services/ron-snapshots";
import { ronSummarySentence } from "@/lib/dashboard-ron-summary";

export interface WhatToDoNowContext {
  lifecycle?: string | null;
  execution_allowed?: boolean | null;
  execution_path?: string | null;
  direction_context?: string | null;
  setup_family?: string | null;
  data_state?: string | null;
  data_blocked?: boolean | null;
  evaluation_anchor?: string | null;
  reason_tokens?: unknown;
}

export interface WhatToDoNowInput {
  symbol: string;
  timeframe: string;
  features: Record<string, any> | null | undefined;
  patterns?: any[] | null;
  barTime?: string | null;
  context?: WhatToDoNowContext | null;
  quoteFresh?: boolean;
  marketOpen?: boolean;
}

export interface WhatToDoNowBriefing {
  action: "WAIT" | "PREPARE" | "MONITOR" | "NO DATA";
  bias: RonBias | null;
  headline: string;
  state: RonState | null;
  whatRonSees: string[];
  whatToDo: string[];
  invalidations: string[];
  caveats: string[];
}

const tokens = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t) => typeof t === "string").map((t) => String(t).replace(/_/g, " ")) : [];

const numOf = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

export function buildWhatToDoNow(input: WhatToDoNowInput): WhatToDoNowBriefing {
  const { symbol, timeframe, features, context } = input;

  if (!features) {
    return {
      action: "NO DATA",
      bias: null,
      state: null,
      headline: `RON has no stored ${timeframe} evidence for ${symbol} right now.`,
      whatRonSees: [],
      whatToDo: ["Do nothing on this instrument until RON has a completed-bar snapshot."],
      invalidations: [],
      caveats: ["Nothing here is estimated or filled in — the evidence simply is not stored yet."],
    };
  }

  const { state } = ronStateFrom(features);
  const bias = ronBiasFrom(features);
  const lifecycle = (context?.lifecycle ?? "").toString().toUpperCase();
  const executionAllowed = context?.execution_allowed === true;

  const action: WhatToDoNowBriefing["action"] =
    executionAllowed ? "PREPARE" : state === "SETUP FORMING" ? "MONITOR" : "WAIT";

  const dirWord = bias === "LONG" ? "long" : bias === "SHORT" ? "short" : "either";

  const headline =
    action === "PREPARE"
      ? `RON has a qualified ${dirWord} context on ${symbol} ${timeframe}. Prepare, do not chase.`
      : action === "MONITOR"
        ? `A ${dirWord} setup is forming on ${symbol} ${timeframe}. Watch it, do not act yet.`
        : `No qualified opportunity on ${symbol} ${timeframe}. The correct action is to wait.`;

  // ── What RON sees ──
  const whatRonSees: string[] = [];
  const sentence = ronSummarySentence(features);
  if (sentence) whatRonSees.push(sentence);

  const adx = numOf(features.adx14);
  const rsi = numOf(features.rsi14);
  const atr = numOf(features.atr_pct);
  if (adx != null) whatRonSees.push(`ADX ${adx.toFixed(1)} — ${adx < 20 ? "no trend to lean on" : adx < 25 ? "trend only waking up" : "trend is established"}.`);
  if (rsi != null) whatRonSees.push(`RSI ${rsi.toFixed(1)} — ${rsi > 70 ? "stretched high" : rsi < 30 ? "stretched low" : "mid-range, no extreme"}.`);
  if (atr != null) whatRonSees.push(`ATR ${atr.toFixed(3)}% of price — position size must respect this range, not a fixed lot.`);

  const pats = (input.patterns ?? []).filter(Boolean).slice(0, 3);
  for (const p of pats) {
    const name = String(p?.name ?? p?.pattern ?? "").replace(/_/g, " ");
    if (!name) continue;
    const dir = p?.direction ? ` (${String(p.direction)})` : "";
    whatRonSees.push(`Pattern on record: ${name}${dir}.`);
  }
  if (!pats.length) whatRonSees.push("No completed named pattern is on record for the latest bars.");

  if (context?.setup_family && context.setup_family !== "none") {
    whatRonSees.push(`Stored setup family: ${String(context.setup_family).replace(/_/g, " ")}.`);
  }

  // ── What to do ──
  const whatToDo: string[] = [];
  if (action === "PREPARE") {
    whatToDo.push(`Plan the ${dirWord} side only. Define entry, stop and target BEFORE the next ${timeframe} bar closes.`);
    whatToDo.push("Size from the ATR range above, not from conviction.");
    whatToDo.push("If price has already moved away from the level RON read, stand down — do not chase.");
  } else if (action === "MONITOR") {
    whatToDo.push(`Watch the next ${timeframe} closes for confirmation of the ${dirWord} side. Nothing to execute yet.`);
    whatToDo.push("Mark the level you would act at, and the level that would prove you wrong.");
    whatToDo.push("Do not pre-position ahead of confirmation.");
  } else {
    whatToDo.push("No action. Staying flat is the trade here.");
    whatToDo.push(`Re-check after the next completed ${timeframe} bar, or use this button again.`);
  }
  if (input.marketOpen === false) whatToDo.push("This market is currently closed — anything you see is last stored state.");

  // ── Invalidation ──
  const invalidations: string[] = [];
  if (bias === "LONG") invalidations.push("A close back below the structure RON read invalidates the long read.");
  if (bias === "SHORT") invalidations.push("A close back above the structure RON read invalidates the short read.");
  if (adx != null && adx < 20) invalidations.push("With ADX under 20 the market can reverse without warning — treat continuation as unproven.");
  if (lifecycle) invalidations.push(`Stored lifecycle state: ${lifecycle.replace(/_/g, " ")}.`);

  // ── Caveats ──
  const caveats: string[] = [];
  if (input.barTime) caveats.push(`Read from the completed ${timeframe} bar at ${new Date(input.barTime).toISOString().replace("T", " ").slice(0, 16)}Z.`);
  if (input.quoteFresh === false) caveats.push("The live broker quote is not fresh — price shown may lag.");
  if (context?.data_blocked) caveats.push("RON flagged a data problem for this instrument; treat the read as degraded.");
  if (context?.execution_path) caveats.push(`Execution path on record: ${String(context.execution_path).replace(/_/g, " ")}.`);
  const rt = tokens(context?.reason_tokens);
  if (rt.length) caveats.push(`Reasons on record: ${rt.slice(0, 4).join(", ")}.`);
  caveats.push("This is stored evidence in plain English. It is not advice, and it contains no probability.");

  return { action, bias, state, headline, whatRonSees, whatToDo, invalidations, caveats };
}
