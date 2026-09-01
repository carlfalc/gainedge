export const STRATEGY_LAB_V2_VERSION = 2 as const;
export const STRATEGY_LAB_V2_GRAMMAR_VERSION = "2.0.0" as const;
export const STRATEGY_LAB_V2_EXECUTION_ALLOWED = false as const;

export const STRATEGY_LAB_V2_MARKETS = ["XAUUSD", "NAS100", "HK50", "GER40"] as const;
export const STRATEGY_LAB_V2_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"] as const;

export type StrategyLabV2Market = typeof STRATEGY_LAB_V2_MARKETS[number];
export type StrategyLabV2Timeframe = typeof STRATEGY_LAB_V2_TIMEFRAMES[number];

export const STRATEGY_LAB_V2_SEARCH_AGENTS = [
  { agent_id: "trend_structure", families: ["ema_cross", "trend_pullback"] },
  { agent_id: "breakout_volatility", families: ["donchian_breakout", "volatility_breakout"] },
  { agent_id: "mean_reversion", families: ["bollinger_reversion", "rsi_reversion"] },
  { agent_id: "momentum", families: ["macd_momentum", "roc_momentum"] },
  { agent_id: "price_action", families: ["liquidity_sweep", "fibonacci_pullback"] },
  { agent_id: "volume_liquidity", families: ["relative_volume_breakout"] },
  { agent_id: "strategy_composer", families: ["hybrid_composer"] },
] as const;

export type StrategyLabV2AgentId = typeof STRATEGY_LAB_V2_SEARCH_AGENTS[number]["agent_id"];
export type StrategyLabV2Family = typeof STRATEGY_LAB_V2_SEARCH_AGENTS[number]["families"][number];

export type StrategyLabV2Verdict =
  | "VIABLE_STRATEGY_FOUND"
  | "NO_VIABLE_STRATEGY_FOUND"
  | "INCONCLUSIVE_INSUFFICIENT_DATA";

export type StrategyLabV2Status =
  | "queued"
  | "auditing_data"
  | "searching"
  | "stress_testing"
  | "locked_holdout"
  | "viable_strategy_found"
  | "no_viable_strategy"
  | "inconclusive"
  | "failed"
  | "cancelled";

export interface StrategyLabV2Costs {
  spread_bps: number;
  commission_bps: number;
  slippage_bps: number;
}

export const DEFAULT_STRATEGY_LAB_V2_COSTS: StrategyLabV2Costs = {
  spread_bps: 1.5,
  commission_bps: 0.5,
  slippage_bps: 1,
};

export interface StrategyGenomeV2 {
  family: StrategyLabV2Family;
  direction: "both" | "long" | "short";
  fast_ema: number;
  slow_ema: number;
  lookback: number;
  atr_period: number;
  stop_atr: number;
  reward_risk: number;
  rsi_period: number;
  oversold: number;
  overbought: number;
  volume_multiplier: number;
  max_bars: number;
  bollinger_period: number;
  bollinger_std: number;
  macd_fast: number;
  macd_slow: number;
  macd_signal: number;
  roc_period: number;
  trend_filter: boolean;
  confirmation: "none" | "rsi" | "macd" | "volume";
  exit_model: "fixed_target" | "trailing_atr";
  break_even_r: number | null;
  utc_start_hour: number | null;
  utc_end_hour: number | null;
}

export interface StrategyLabV2Metrics {
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  win_rate_lower_95: number;
  profit_factor: number;
  expectancy_r: number;
  net_return_pct: number;
  max_drawdown_pct: number;
  average_win_r: number;
  average_loss_r: number;
  longest_losing_streak: number;
}

export interface StrategyLabV2FoldResult {
  fold: number;
  start_index: number;
  end_index: number;
  metrics: StrategyLabV2Metrics;
}

export interface StrategyLabV2CandidateResult {
  candidate_hash: string;
  generation: number;
  parent_hashes: string[];
  genome: StrategyGenomeV2;
  score: number;
  metrics: StrategyLabV2Metrics;
  folds: StrategyLabV2FoldResult[];
  positive_fold_ratio: number;
  disqualified: boolean;
  disqualification_reasons: string[];
}

export interface StrategyLabV2Trade {
  direction: "long" | "short";
  signal_time: number;
  opened_at: number;
  closed_at: number;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  gross_r: number;
  cost_r: number;
  net_r: number;
  exit_reason: "stop" | "target" | "trailing_stop" | "time_stop" | "segment_end";
}

export interface StrategyLabV2Audit {
  candles: number;
  first_candle: number | null;
  last_candle: number | null;
  duplicates: number;
  invalid_rows: number;
  out_of_order: number;
  large_gaps: number;
  inferred_interval_minutes: number | null;
  development_end_index: number;
  holdout_start_index: number;
  sufficient_for_search: boolean;
  warnings: string[];
}

export const STRATEGY_LAB_V2_GATES = {
  minimum_candles: 3_000,
  minimum_development_oos_trades: 60,
  minimum_holdout_trades: 15,
  minimum_positive_fold_ratio: 0.6,
  minimum_development_profit_factor: 1.15,
  minimum_holdout_profit_factor: 1.1,
  minimum_probability_pf_above_one: 0.75,
  maximum_holdout_drawdown_pct: 25,
  require_positive_holdout_return: true,
} as const;

export const STRATEGY_LAB_V2_SEARCH_BUDGETS = {
  standard: { per_agent: 96, generations: 4, bootstrap_runs: 200 },
  deep: { per_agent: 256, generations: 6, bootstrap_runs: 500 },
  maximum: { per_agent: 512, generations: 8, bootstrap_runs: 1_000 },
} as const;

export type StrategyLabV2SearchDepth = keyof typeof STRATEGY_LAB_V2_SEARCH_BUDGETS;

export function isStrategyLabV2Market(value: string): value is StrategyLabV2Market {
  return (STRATEGY_LAB_V2_MARKETS as readonly string[]).includes(value);
}

export function isStrategyLabV2Timeframe(value: string): value is StrategyLabV2Timeframe {
  return (STRATEGY_LAB_V2_TIMEFRAMES as readonly string[]).includes(value);
}

export function isStrategyLabV2Agent(value: string): value is StrategyLabV2AgentId {
  return STRATEGY_LAB_V2_SEARCH_AGENTS.some((agent) => agent.agent_id === value);
}
