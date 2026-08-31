/**
 * GAINEDGE_RON_TECHNICAL_SETUP_CATALOG_V1
 *
 * Versioned taxonomy for technical setups that may be detected live and evaluated through
 * the historical cohort engine. This file defines WHAT a setup means; detector modules may
 * implement each definition forward without changing historical semantics.
 *
 * Guardrails:
 *  - all detections use completed bars only;
 *  - every setup is descriptive evidence, never a standalone BUY/SELL instruction;
 *  - levels/zones must carry exact source anchors and prices;
 *  - Fib must be anchored to explicit confirmed swing endpoints, never redrawn to fit outcome;
 *  - historical outcome statistics use the same frozen setup definition as the live detection.
 */
export const RON_TECHNICAL_SETUP_CATALOG_VERSION = 1;

export const RON_TECHNICAL_SETUP_IDS = [
  "supply_zone_rejection",
  "supply_zone_break",
  "demand_zone_rejection",
  "demand_zone_break",
  "support_retest_hold",
  "support_break",
  "resistance_retest_reject",
  "resistance_break",
  "classical_pivot_reaction",
  "classical_pivot_break",
  "fib_retracement_reaction",
  "fib_retracement_break",
  "fib_extension_reached",
  "ema_9_21_bull_cross",
  "ema_9_21_bear_cross",
  "ema_21_50_bull_cross",
  "ema_21_50_bear_cross",
  "ema_stack_bullish",
  "ema_stack_bearish",
  "price_ema_reclaim",
  "price_ema_rejection",
] as const;

export type RonTechnicalSetupId = typeof RON_TECHNICAL_SETUP_IDS[number];

export const FIB_LEVELS = [0.382, 0.5, 0.618, 0.786, 1.272, 1.618] as const;
export const CLASSICAL_PIVOT_LEVELS = ["P", "R1", "R2", "R3", "S1", "S2", "S3"] as const;
export const EMA_PERIODS = [9, 21, 50, 200] as const;

export interface TechnicalSetupDefinition {
  id: RonTechnicalSetupId;
  family: "supply_demand" | "support_resistance" | "pivot" | "fibonacci" | "ema";
  direction: "bullish" | "bearish" | "contextual";
  definition: string;
  required_evidence: readonly string[];
}

export const RON_TECHNICAL_SETUP_CATALOG: readonly TechnicalSetupDefinition[] = [
  { id: "supply_zone_rejection", family: "supply_demand", direction: "bearish", definition: "Price revisits a previously identified supply zone and closes back below/away from the zone after a completed-bar test.", required_evidence: ["zone_low", "zone_high", "zone_origin_anchor", "test_anchor"] },
  { id: "supply_zone_break", family: "supply_demand", direction: "bullish", definition: "A completed bar closes decisively above a previously identified supply zone.", required_evidence: ["zone_low", "zone_high", "zone_origin_anchor", "break_anchor"] },
  { id: "demand_zone_rejection", family: "supply_demand", direction: "bullish", definition: "Price revisits a previously identified demand zone and closes back above/away from the zone after a completed-bar test.", required_evidence: ["zone_low", "zone_high", "zone_origin_anchor", "test_anchor"] },
  { id: "demand_zone_break", family: "supply_demand", direction: "bearish", definition: "A completed bar closes decisively below a previously identified demand zone.", required_evidence: ["zone_low", "zone_high", "zone_origin_anchor", "break_anchor"] },
  { id: "support_retest_hold", family: "support_resistance", direction: "bullish", definition: "Price retests a confirmed support level/zone and the completed bar closes back above it.", required_evidence: ["support_price_or_zone", "level_origin", "retest_anchor"] },
  { id: "support_break", family: "support_resistance", direction: "bearish", definition: "A completed bar closes below a confirmed support level/zone beyond the configured ATR-normalised tolerance.", required_evidence: ["support_price_or_zone", "break_anchor", "atr_tolerance"] },
  { id: "resistance_retest_reject", family: "support_resistance", direction: "bearish", definition: "Price retests a confirmed resistance level/zone and the completed bar closes back below it.", required_evidence: ["resistance_price_or_zone", "level_origin", "retest_anchor"] },
  { id: "resistance_break", family: "support_resistance", direction: "bullish", definition: "A completed bar closes above a confirmed resistance level/zone beyond the configured ATR-normalised tolerance.", required_evidence: ["resistance_price_or_zone", "break_anchor", "atr_tolerance"] },
  { id: "classical_pivot_reaction", family: "pivot", direction: "contextual", definition: "Price tests one of P/R1/R2/R3/S1/S2/S3 calculated only from the prior completed trading session and rejects/holds on a completed bar.", required_evidence: ["prior_session_high", "prior_session_low", "prior_session_close", "pivot_level", "test_anchor"] },
  { id: "classical_pivot_break", family: "pivot", direction: "contextual", definition: "A completed bar closes through a prior-session classical pivot level beyond the configured tolerance.", required_evidence: ["pivot_level", "break_anchor", "atr_tolerance"] },
  { id: "fib_retracement_reaction", family: "fibonacci", direction: "contextual", definition: "Price tests a declared 38.2/50/61.8/78.6 retracement derived from explicit confirmed swing endpoints and reacts on a completed bar.", required_evidence: ["swing_start_anchor", "swing_end_anchor", "swing_start_price", "swing_end_price", "fib_level", "test_anchor"] },
  { id: "fib_retracement_break", family: "fibonacci", direction: "contextual", definition: "A completed bar closes through a declared retracement level derived from explicit confirmed swing endpoints.", required_evidence: ["swing_start_anchor", "swing_end_anchor", "fib_level", "break_anchor"] },
  { id: "fib_extension_reached", family: "fibonacci", direction: "contextual", definition: "Price reaches a declared 127.2 or 161.8 extension from explicit confirmed swing endpoints on a completed bar.", required_evidence: ["swing_start_anchor", "swing_end_anchor", "fib_level", "reach_anchor"] },
  { id: "ema_9_21_bull_cross", family: "ema", direction: "bullish", definition: "EMA9 is at/below EMA21 on the previous completed bar and above EMA21 on the current completed bar.", required_evidence: ["ema9_previous", "ema21_previous", "ema9_current", "ema21_current"] },
  { id: "ema_9_21_bear_cross", family: "ema", direction: "bearish", definition: "EMA9 is at/above EMA21 on the previous completed bar and below EMA21 on the current completed bar.", required_evidence: ["ema9_previous", "ema21_previous", "ema9_current", "ema21_current"] },
  { id: "ema_21_50_bull_cross", family: "ema", direction: "bullish", definition: "EMA21 is at/below EMA50 on the previous completed bar and above EMA50 on the current completed bar.", required_evidence: ["ema21_previous", "ema50_previous", "ema21_current", "ema50_current"] },
  { id: "ema_21_50_bear_cross", family: "ema", direction: "bearish", definition: "EMA21 is at/above EMA50 on the previous completed bar and below EMA50 on the current completed bar.", required_evidence: ["ema21_previous", "ema50_previous", "ema21_current", "ema50_current"] },
  { id: "ema_stack_bullish", family: "ema", direction: "bullish", definition: "Completed-bar EMA stack is 9 > 21 > 50 > 200.", required_evidence: ["ema9", "ema21", "ema50", "ema200"] },
  { id: "ema_stack_bearish", family: "ema", direction: "bearish", definition: "Completed-bar EMA stack is 9 < 21 < 50 < 200.", required_evidence: ["ema9", "ema21", "ema50", "ema200"] },
  { id: "price_ema_reclaim", family: "ema", direction: "contextual", definition: "Price closes back through a declared EMA after having closed on the opposite side on the previous completed bar.", required_evidence: ["ema_period", "previous_close", "current_close", "ema_previous", "ema_current"] },
  { id: "price_ema_rejection", family: "ema", direction: "contextual", definition: "Price tests a declared EMA and the completed bar closes back on the original side without a reclaim.", required_evidence: ["ema_period", "bar_high", "bar_low", "bar_close", "ema_current"] },
] as const;

export function technicalSetupDefinition(id: RonTechnicalSetupId): TechnicalSetupDefinition {
  const found = RON_TECHNICAL_SETUP_CATALOG.find((s) => s.id === id);
  if (!found) throw new Error(`unknown_technical_setup:${id}`);
  return found;
}

export function technicalSetupCatalogPayload() {
  return [
    "ron_technical_setup_catalog_version", RON_TECHNICAL_SETUP_CATALOG_VERSION,
    "setup_ids", [...RON_TECHNICAL_SETUP_IDS],
    "fib_levels", [...FIB_LEVELS],
    "classical_pivot_levels", [...CLASSICAL_PIVOT_LEVELS],
    "ema_periods", [...EMA_PERIODS],
    "completed_bars_only", true,
    "historical_definition_must_match_live_definition", true,
    "standalone_trade_instruction", false,
  ];
}
