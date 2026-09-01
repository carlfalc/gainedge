/**
 * GainEdge Strategy Lab V1 — isolated research contracts.
 *
 * This registry is deliberately separate from RON_AGENT_REGISTRY and Falconer. Strategy
 * Lab may research and rank hypotheses, but it cannot emit broker instructions, mutate a
 * RON decision, or describe a candidate as live-trading approved.
 */

export const STRATEGY_LAB_VERSION = 1;
export const STRATEGY_LAB_MIN_CANDLES = 1_000;
export const STRATEGY_LAB_RECOMMENDED_CANDLES = 20_000;

export const STRATEGY_LAB_CORE_MARKETS = [
  "XAUUSD",
  "NAS100",
  "HK50",
  "GER40",
] as const;

export type StrategyLabMarket = typeof STRATEGY_LAB_CORE_MARKETS[number];

export const STRATEGY_LAB_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
export type StrategyLabTimeframe = typeof STRATEGY_LAB_TIMEFRAMES[number];

export type StrategyLabAgentId =
  | "data_integrity"
  | "trend_structure"
  | "momentum_divergence"
  | "volume_liquidity"
  | "session_venue"
  | "macro_cross_asset"
  | "strategy_builder"
  | "validation_risk";

export type StrategyLabAgentClass =
  | "source_gate"
  | "feature_specialist"
  | "context_specialist"
  | "construction"
  | "promotion_gate";

export interface StrategyLabAgentSpec {
  agent_id: StrategyLabAgentId;
  agent_version: number;
  agent_class: StrategyLabAgentClass;
  purpose: string;
  deterministic: boolean;
  may_block_promotion: boolean;
  limitations: readonly string[];
}

export const STRATEGY_LAB_AGENTS: readonly StrategyLabAgentSpec[] = Object
  .freeze([
    {
      agent_id: "data_integrity",
      agent_version: 1,
      agent_class: "source_gate",
      purpose:
        "Validate genuine OHLCV ordering, bar shape, duplicates and coverage before research.",
      deterministic: true,
      may_block_promotion: true,
      limitations: [
        "Venue-aware expected-closure classification is reported separately from raw time gaps.",
      ],
    },
    {
      agent_id: "trend_structure",
      agent_version: 1,
      agent_class: "feature_specialist",
      purpose:
        "Evaluate EMA regimes, breakouts, pullbacks, Fibonacci zones and price structure.",
      deterministic: true,
      may_block_promotion: false,
      limitations: [
        "Levels are mathematical observations, not guaranteed support or resistance.",
      ],
    },
    {
      agent_id: "momentum_divergence",
      agent_version: 1,
      agent_class: "feature_specialist",
      purpose:
        "Evaluate RSI, MACD, momentum transitions and exhaustion conditions.",
      deterministic: true,
      may_block_promotion: false,
      limitations: [
        "Divergence is descriptive until separately validated out of sample.",
      ],
    },
    {
      agent_id: "volume_liquidity",
      agent_version: 1,
      agent_class: "feature_specialist",
      purpose:
        "Evaluate relative tick volume, breakout participation and liquidity-sweep proxies.",
      deterministic: true,
      may_block_promotion: false,
      limitations: [
        "CFD candle volume is a proxy; it is not exchange order flow or market depth.",
      ],
    },
    {
      agent_id: "session_venue",
      agent_version: 1,
      agent_class: "context_specialist",
      purpose:
        "Bind observations to declared market sessions and venue calendars.",
      deterministic: true,
      may_block_promotion: true,
      limitations: [
        "A session rule is inadmissible when the applicable venue clock is not authoritative.",
      ],
    },
    {
      agent_id: "macro_cross_asset",
      agent_version: 1,
      agent_class: "context_specialist",
      purpose:
        "Apply point-in-time macro-event and cross-asset context when timestamped evidence exists.",
      deterministic: true,
      may_block_promotion: false,
      limitations: [
        "No historical event context is inferred from present-day knowledge; causation is never asserted.",
      ],
    },
    {
      agent_id: "strategy_builder",
      agent_version: 1,
      agent_class: "construction",
      purpose:
        "Compose compatible entry, exit and risk rules and simulate next-bar execution.",
      deterministic: true,
      may_block_promotion: false,
      limitations: [
        "Search is bounded to preregistered candidate families and parameter grids.",
      ],
    },
    {
      agent_id: "validation_risk",
      agent_version: 1,
      agent_class: "promotion_gate",
      purpose:
        "Rank on validation data and confirm the selected champion on an untouched holdout.",
      deterministic: true,
      may_block_promotion: true,
      limitations: [
        "Historical promotion eligibility is not a promise of future profitability.",
      ],
    },
  ]);

export const STRATEGY_LAB_AGENT_IDS: readonly StrategyLabAgentId[] =
  STRATEGY_LAB_AGENTS.map((agent) => agent.agent_id);

export type StrategyFamily =
  | "trend_pullback"
  | "range_breakout"
  | "mean_reversion"
  | "momentum_transition"
  | "liquidity_sweep"
  | "relative_volume_breakout"
  | "fibonacci_pullback";

export interface StrategyLabCostModel {
  spread_bps: number;
  commission_bps: number;
  slippage_bps: number;
}

export const DEFAULT_STRATEGY_LAB_COSTS: StrategyLabCostModel = Object.freeze({
  spread_bps: 1.5,
  commission_bps: 0.5,
  slippage_bps: 1,
});

export interface StrategyLabPromotionGate {
  min_validation_trades: number;
  min_holdout_trades: number;
  min_validation_profit_factor: number;
  min_holdout_profit_factor: number;
  max_holdout_drawdown_pct: number;
  require_positive_holdout_return: boolean;
}

export const STRATEGY_LAB_PROMOTION_GATE_V1: StrategyLabPromotionGate = Object
  .freeze({
    min_validation_trades: 20,
    min_holdout_trades: 15,
    min_validation_profit_factor: 1.2,
    min_holdout_profit_factor: 1.1,
    max_holdout_drawdown_pct: 20,
    require_positive_holdout_return: true,
  });

export function isStrategyLabMarket(
  value: unknown,
): value is StrategyLabMarket {
  return STRATEGY_LAB_CORE_MARKETS.includes(
    String(value ?? "") as StrategyLabMarket,
  );
}

export function isStrategyLabTimeframe(
  value: unknown,
): value is StrategyLabTimeframe {
  return STRATEGY_LAB_TIMEFRAMES.includes(
    String(value ?? "") as StrategyLabTimeframe,
  );
}

export function strategyLabRegistryPayload() {
  return [
    "strategy_lab_version",
    STRATEGY_LAB_VERSION,
    "execution_allowed",
    false,
    "agent_count",
    STRATEGY_LAB_AGENTS.length,
    "agents",
    STRATEGY_LAB_AGENTS.map((agent) => [
      agent.agent_id,
      agent.agent_version,
      agent.agent_class,
      agent.deterministic,
      agent.may_block_promotion,
    ]),
    "core_markets",
    [...STRATEGY_LAB_CORE_MARKETS],
    "timeframes",
    [...STRATEGY_LAB_TIMEFRAMES],
  ];
}
