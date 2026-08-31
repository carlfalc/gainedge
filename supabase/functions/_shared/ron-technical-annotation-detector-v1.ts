/**
 * GAINEDGE_RON_TECHNICAL_ANNOTATION_DETECTOR_V1
 *
 * Pure completed-bar detector that turns exact candle geometry into chart-ready RON
 * annotations. It never reads the future, never emits a score/probability and never creates
 * an order. All timestamps and prices come from the supplied genuine candle window.
 */
import {
  atr,
  ema,
  sessionIndexOf,
  type Candle,
} from "./falconer-strategy.ts";
import {
  validateRonChartAnnotationV1,
  type RonChartAnnotationDirection,
  type RonChartAnnotationLifecycle,
  type RonChartAnnotationV1,
  type RonChartGeometryV1,
} from "./ron-chart-annotation-v1.ts";

export const RON_TECHNICAL_ANNOTATION_DETECTOR_VERSION = 1;
const MAX_ANNOTATIONS = 14;

type Swing = {
  index: number;
  kind: "high" | "low";
  price: number;
};

const iso = (t: number) => new Date(t).toISOString();
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const round = (n: number) => Number(n.toFixed(8));

function makeAnnotation(args: {
  symbol: string;
  timeframe: string;
  asOf: string;
  subtype: string;
  direction: RonChartAnnotationDirection;
  lifecycle: RonChartAnnotationLifecycle;
  sourceAgent: string;
  originIndex: number;
  originTime: number;
  originPrice: number;
  geometry: RonChartGeometryV1;
  currentIndex: number;
  currentTime: number;
  currentPrice: number;
  retestCount?: number;
  testedNow?: boolean;
}): RonChartAnnotationV1 | null {
  const id = [
    args.symbol, args.timeframe, args.subtype, args.originTime, args.currentTime,
  ].join(":").replace(/[^A-Za-z0-9:._-]/g, "_");
  const row: RonChartAnnotationV1 = {
    annotation_version: 1,
    id,
    symbol: args.symbol,
    timeframe: args.timeframe,
    kind: args.geometry.type,
    subtype: args.subtype,
    direction: args.direction,
    lifecycle: args.lifecycle,
    source_agent: args.sourceAgent,
    source_setup_id: args.subtype,
    as_of_bar_time: args.asOf,
    origin_anchor: {
      bar_time: iso(args.originTime),
      bar_index: args.originIndex,
      price: round(args.originPrice),
    },
    last_test_anchor: args.testedNow ? {
      bar_time: iso(args.currentTime),
      bar_index: args.currentIndex,
      price: round(args.currentPrice),
    } : null,
    retest_count: args.retestCount ?? null,
    geometry: args.geometry,
    evidence_refs: [
      `candle_history:${args.symbol}:${args.timeframe}:${iso(args.originTime)}`,
      `candle_history:${args.symbol}:${args.timeframe}:${args.asOf}`,
    ],
    provenance: {
      detector_version: RON_TECHNICAL_ANNOTATION_DETECTOR_VERSION,
      completed_bars_only: true,
      source_window_bars: args.currentIndex + 1,
    },
  };
  return validateRonChartAnnotationV1(row).ok ? row : null;
}

function confirmedSwings(candles: readonly Candle[]): Swing[] {
  const out: Swing[] = [];
  // Two bars on each side: the right-side confirmation bars are already completed and
  // strictly before/equal to the supplied cutoff.
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const left = candles.slice(i - 2, i);
    const right = candles.slice(i + 1, i + 3);
    if (left.every((b) => b.high < c.high) && right.every((b) => b.high <= c.high)) {
      out.push({ index: i, kind: "high", price: c.high });
    }
    if (left.every((b) => b.low > c.low) && right.every((b) => b.low >= c.low)) {
      out.push({ index: i, kind: "low", price: c.low });
    }
  }
  return out;
}

function retests(
  candles: readonly Candle[], from: number, low: number, high: number,
): number {
  let n = 0;
  let inTest = false;
  for (let i = from + 1; i < candles.length; i++) {
    const hit = candles[i].high >= low && candles[i].low <= high;
    if (hit && !inTest) n++;
    inTest = hit;
  }
  return n;
}

function pushLevelAndZone(
  rows: RonChartAnnotationV1[],
  symbol: string,
  timeframe: string,
  candles: readonly Candle[],
  swing: Swing,
  side: "support" | "resistance",
  atrNow: number,
) {
  const i = candles.length - 1;
  const bar = candles[i];
  const asOf = iso(bar.time);
  const tolerance = Math.max(atrNow * 0.12, Math.abs(bar.close) * 0.00002);
  const isSupport = side === "support";
  const levelTouched = bar.high >= swing.price - tolerance && bar.low <= swing.price + tolerance;
  const broken = isSupport
    ? bar.close < swing.price - tolerance
    : bar.close > swing.price + tolerance;
  const held = levelTouched && !broken;
  const subtype = broken
    ? (isSupport ? "support_break" : "resistance_break")
    : held
    ? (isSupport ? "support_retest_hold" : "resistance_retest_reject")
    : (isSupport ? "support_level" : "resistance_level");
  const direction: RonChartAnnotationDirection = broken
    ? (isSupport ? "bearish" : "bullish")
    : (isSupport ? "bullish" : "bearish");
  const lifecycle: RonChartAnnotationLifecycle = broken
    ? "broken"
    : held ? "retested" : "current";
  const level = makeAnnotation({
    symbol, timeframe, asOf, subtype, direction, lifecycle,
    sourceAgent: "pattern_context",
    originIndex: swing.index,
    originTime: candles[swing.index].time,
    originPrice: swing.price,
    geometry: { type: "level", price: round(swing.price) },
    currentIndex: i, currentTime: bar.time, currentPrice: bar.close,
    retestCount: retests(candles, swing.index, swing.price - tolerance, swing.price + tolerance),
    testedNow: levelTouched,
  });
  if (level) rows.push(level);

  const width = Math.max(atrNow * 0.25, Math.abs(swing.price) * 0.00005);
  const zoneLow = isSupport ? swing.price : swing.price - width;
  const zoneHigh = isSupport ? swing.price + width : swing.price;
  const zoneTouched = bar.high >= zoneLow && bar.low <= zoneHigh;
  const zoneBroken = isSupport ? bar.close < zoneLow : bar.close > zoneHigh;
  const zoneSubtype = zoneBroken
    ? (isSupport ? "demand_zone_break" : "supply_zone_break")
    : zoneTouched
    ? (isSupport ? "demand_zone_rejection" : "supply_zone_rejection")
    : (isSupport ? "demand_zone" : "supply_zone");
  const zoneDirection: RonChartAnnotationDirection = zoneBroken
    ? (isSupport ? "bearish" : "bullish")
    : (isSupport ? "bullish" : "bearish");
  const zone = makeAnnotation({
    symbol, timeframe, asOf, subtype: zoneSubtype, direction: zoneDirection,
    lifecycle: zoneBroken ? "broken" : zoneTouched ? "retested" : "current",
    sourceAgent: "session_market_structure",
    originIndex: swing.index,
    originTime: candles[swing.index].time,
    originPrice: swing.price,
    geometry: { type: "zone", low: round(zoneLow), high: round(zoneHigh) },
    currentIndex: i, currentTime: bar.time, currentPrice: bar.close,
    retestCount: retests(candles, swing.index, zoneLow, zoneHigh),
    testedNow: zoneTouched,
  });
  if (zone) rows.push(zone);
}

function addPivots(
  rows: RonChartAnnotationV1[],
  symbol: string,
  timeframe: string,
  candles: readonly Candle[],
  atrNow: number,
) {
  const i = candles.length - 1;
  const bar = candles[i];
  const currentSession = sessionIndexOf(bar.time, "auto");
  const prior = candles
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => sessionIndexOf(c.time, "auto") === currentSession - 1);
  if (!prior.length) return;
  const high = Math.max(...prior.map(({ c }) => c.high));
  const low = Math.min(...prior.map(({ c }) => c.low));
  const last = prior[prior.length - 1];
  const close = last.c.close;
  const p = (high + low + close) / 3;
  const range = high - low;
  const candidates = [
    ["P", p],
    ["R1", 2 * p - low],
    ["R2", p + range],
    ["R3", high + 2 * (p - low)],
    ["S1", 2 * p - high],
    ["S2", p - range],
    ["S3", low - 2 * (high - p)],
  ] as const;
  const tolerance = Math.max(atrNow * 0.12, Math.abs(bar.close) * 0.00002);
  const nearest = [...candidates]
    .sort((a, b) => Math.abs(a[1] - bar.close) - Math.abs(b[1] - bar.close))
    .slice(0, 3);
  for (const [level, rawPrice] of nearest) {
    const price = round(rawPrice);
    const touched = bar.high >= price - tolerance && bar.low <= price + tolerance;
    const direction: RonChartAnnotationDirection = level.startsWith("S")
      ? "bullish" : level.startsWith("R") ? "bearish" : "contextual";
    const row = makeAnnotation({
      symbol, timeframe, asOf: iso(bar.time),
      subtype: touched ? "classical_pivot_reaction" : "classical_pivot_level",
      direction, lifecycle: touched ? "retested" : "current",
      sourceAgent: "session_market_structure",
      originIndex: last.index, originTime: last.c.time, originPrice: close,
      geometry: {
        type: "pivot", level, price,
        source_session: {
          start_time: iso(prior[0].c.time),
          end_time: iso(last.c.time + 15 * 60_000),
          high: round(high), low: round(low), close: round(close),
        },
      },
      currentIndex: i, currentTime: bar.time, currentPrice: bar.close,
      testedNow: touched,
    });
    if (row) rows.push(row);
  }
}

function lastAlternatingSwingPair(swings: readonly Swing[]): [Swing, Swing] | null {
  for (let i = swings.length - 1; i > 0; i--) {
    if (swings[i - 1].kind !== swings[i].kind) return [swings[i - 1], swings[i]];
  }
  return null;
}

function addFibonacci(
  rows: RonChartAnnotationV1[],
  symbol: string,
  timeframe: string,
  candles: readonly Candle[],
  swings: readonly Swing[],
  atrNow: number,
) {
  const pair = lastAlternatingSwingPair(swings);
  if (!pair) return;
  const [start, end] = pair;
  const i = candles.length - 1;
  const bar = candles[i];
  const up = start.kind === "low" && end.kind === "high";
  const span = Math.abs(end.price - start.price);
  if (!(span > 0)) return;
  const ratios = [0.382, 0.5, 0.618, 0.786] as const;
  const levels = ratios.map((ratio) => ({
    ratio,
    price: up ? end.price - span * ratio : end.price + span * ratio,
  })).sort((a, b) => Math.abs(a.price - bar.close) - Math.abs(b.price - bar.close)).slice(0, 2);
  const tolerance = Math.max(atrNow * 0.12, Math.abs(bar.close) * 0.00002);
  for (const level of levels) {
    const price = round(level.price);
    const touched = bar.high >= price - tolerance && bar.low <= price + tolerance;
    const row = makeAnnotation({
      symbol, timeframe, asOf: iso(bar.time),
      subtype: touched ? "fib_retracement_reaction" : "fib_retracement_level",
      direction: up ? "bullish" : "bearish",
      lifecycle: touched ? "retested" : "current",
      sourceAgent: "pattern_context",
      originIndex: start.index, originTime: candles[start.index].time, originPrice: start.price,
      geometry: {
        type: "fib", ratio: level.ratio, price,
        swing_start: {
          bar_time: iso(candles[start.index].time),
          bar_index: start.index,
          price: round(start.price),
        },
        swing_end: {
          bar_time: iso(candles[end.index].time),
          bar_index: end.index,
          price: round(end.price),
        },
      },
      currentIndex: i, currentTime: bar.time, currentPrice: bar.close,
      testedNow: touched,
    });
    if (row) rows.push(row);
  }
}

function addEmaEvents(
  rows: RonChartAnnotationV1[],
  symbol: string,
  timeframe: string,
  candles: readonly Candle[],
) {
  if (candles.length < 2) return;
  const closes = candles.map((c) => c.close);
  const i = candles.length - 1;
  const bar = candles[i];
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const pairs = [
    [9, 21, e9, e21],
    [21, 50, e21, e50],
  ] as const;
  let crossed = false;
  for (const [fastPeriod, slowPeriod, fast, slow] of pairs) {
    const bull = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const bear = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    if (!bull && !bear) continue;
    crossed = true;
    const subtype = `ema_${fastPeriod}_${slowPeriod}_${bull ? "bull" : "bear"}_cross`;
    const row = makeAnnotation({
      symbol, timeframe, asOf: iso(bar.time), subtype,
      direction: bull ? "bullish" : "bearish", lifecycle: "detected",
      sourceAgent: "pattern_context",
      originIndex: i, originTime: bar.time, originPrice: bar.close,
      geometry: {
        type: "ema_event", event: "cross",
        fast_period: fastPeriod, slow_period: slowPeriod,
        event_anchor: { bar_time: iso(bar.time), bar_index: i, price: round(bar.close) },
        fast_value: round(fast[i]), slow_value: round(slow[i]),
      },
      currentIndex: i, currentTime: bar.time, currentPrice: bar.close,
      testedNow: true,
    });
    if (row) rows.push(row);
  }
  if (crossed) return;
  const bullish = e9[i] > e21[i] && e21[i] > e50[i] && e50[i] > e200[i];
  const bearish = e9[i] < e21[i] && e21[i] < e50[i] && e50[i] < e200[i];
  if (!bullish && !bearish) return;
  const row = makeAnnotation({
    symbol, timeframe, asOf: iso(bar.time),
    subtype: bullish ? "ema_stack_bullish" : "ema_stack_bearish",
    direction: bullish ? "bullish" : "bearish", lifecycle: "current",
    sourceAgent: "pattern_context",
    originIndex: i, originTime: bar.time, originPrice: bar.close,
    geometry: {
      type: "ema_event", event: "stack",
      fast_period: 9, slow_period: 200,
      event_anchor: { bar_time: iso(bar.time), bar_index: i, price: round(bar.close) },
      fast_value: round(e9[i]), slow_value: round(e200[i]),
    },
    currentIndex: i, currentTime: bar.time, currentPrice: bar.close,
  });
  if (row) rows.push(row);
}

export function detectRonTechnicalAnnotationsV1(
  symbol: string,
  timeframe: string,
  candles: readonly Candle[],
): RonChartAnnotationV1[] {
  if (!symbol || !timeframe || candles.length < 8) return [];
  const i = candles.length - 1;
  const bar = candles[i];
  if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(finite)) return [];
  const atrValues = atr([...candles], 14);
  const atrNow = finite(atrValues[i]) && atrValues[i] > 0
    ? atrValues[i]
    : Math.max(bar.high - bar.low, Math.abs(bar.close) * 0.0001);
  const swings = confirmedSwings(candles);
  const support = [...swings].reverse().find((s) => s.kind === "low" && s.price < bar.close);
  const resistance = [...swings].reverse().find((s) => s.kind === "high" && s.price > bar.close);

  const rows: RonChartAnnotationV1[] = [];
  if (support) pushLevelAndZone(rows, symbol, timeframe, candles, support, "support", atrNow);
  if (resistance) pushLevelAndZone(rows, symbol, timeframe, candles, resistance, "resistance", atrNow);
  addPivots(rows, symbol, timeframe, candles, atrNow);
  addFibonacci(rows, symbol, timeframe, candles, swings, atrNow);
  addEmaEvents(rows, symbol, timeframe, candles);

  return rows.slice(0, MAX_ANNOTATIONS);
}

export function technicalAnnotationDetectorPayloadV1() {
  return [
    "detector_version", RON_TECHNICAL_ANNOTATION_DETECTOR_VERSION,
    "completed_bars_only", true,
    "families", ["supply_demand", "support_resistance", "pivot", "fibonacci", "ema"],
    "maximum_annotations_per_snapshot", MAX_ANNOTATIONS,
    "trade_instruction", false,
  ];
}
