// Wrapper around lightweight-charts-indicators for typed access
import { indicatorRegistry } from "lightweight-charts-indicators";

export interface IndicatorMeta {
  id: string;
  name: string;
  shortName: string;
  category: string;
  overlay: boolean;
  group: string; // standard | community | pattern
  inputConfig: Array<{
    id: string;
    type: string;
    title: string;
    defval: any;
    min?: number;
    max?: number;
    options?: string[];
  }>;
  plotConfig: Array<{
    id: string;
    title: string;
    color: string;
    lineWidth: number;
    display?: string;
  }>;
  calculate: (bars: any[], inputs: Record<string, any>) => {
    metadata: { title: string; shorttitle: string; overlay: boolean };
    plots: Record<string, Array<{ time: number; value: number | null }>>;
    fills?: any;
  };
}

// Map category names to our display groups
const CATEGORY_MAP: Record<string, string> = {
  "Moving Averages": "Trend",
  "Trend": "Trend",
  "Channels & Bands": "Volatility",
  "Volatility": "Volatility",
  "Momentum": "Momentum",
  "Oscillators": "Momentum",
  "Volume": "Volume",
  "Candlestick Patterns": "Patterns",
};

export function getDisplayCategory(cat: string): string {
  return CATEGORY_MAP[cat] || "Community";
}

export const DISPLAY_CATEGORIES = [
  "Trend",
  "Momentum",
  "Volatility",
  "Volume",
  "Patterns",
  "Community",
] as const;

// Build the full registry
let _cache: IndicatorMeta[] | null = null;

export function getAllIndicators(): IndicatorMeta[] {
  if (_cache) return _cache;

  _cache = (indicatorRegistry as any[]).map((entry) => {
    // The entry has: id, group, name, shortName, category, overlay, metadata, inputConfig, plotConfig
    // The actual indicator object is accessed via the package exports
    const indicator = (entry as any).indicator || entry;
    return {
      id: entry.id || entry.shortName?.toLowerCase() || entry.name,
      name: entry.name || entry.metadata?.title || "Unknown",
      shortName: entry.shortName || entry.metadata?.shortTitle || entry.id,
      category: entry.category || "Other",
      overlay: entry.overlay ?? entry.metadata?.overlay ?? false,
      group: entry.group || "standard",
      inputConfig: entry.inputConfig || indicator.inputConfig || [],
      plotConfig: entry.plotConfig || indicator.plotConfig || [],
      calculate: indicator.calculate,
    } as IndicatorMeta;
  });

  return _cache;
}

// Get popular/featured indicators for quick access
export const FEATURED_INDICATOR_IDS = [
  "sma", "ema", "rsi", "macd", "bollinger_bands", "supertrend",
  "ichimoku", "vwap", "atr", "stochastic", "cci", "adx",
  "parabolic_sar", "williams_r", "obv", "mfi",
  "hull_ma", "dema", "tema", "keltner_channels",
  "donchian_channels", "awesome_oscillator",
];
