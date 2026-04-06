import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSeedData(userId: string | undefined) {
  const seeded = useRef(false);

  useEffect(() => {
    if (!userId || seeded.current) return;
    seeded.current = true;

    (async () => {
      // Check if user already has signals (i.e., already seeded)
      const { count } = await supabase
        .from("signals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      if (count && count > 0) return;

      // Seed scan_results
      const scanInserts = [
        { user_id: userId, symbol: "NAS100", timeframe: "15", candle_type: "heiken_ashi", direction: "BUY", confidence: 6, entry_price: 24059, take_profit: 24277, stop_loss: 23950, risk_reward: "2:1", adx: 28.4, rsi: 62, macd_status: "Bullish", stoch_rsi: 71, ema_fast_value: 24050, ema_slow_value: 24020, ema_crossover_status: "CONFIRMED", ema_crossover_direction: "BULLISH", supertrend_status: "BUY", verdict: "HIGH_CONVICTION", reasoning: "EMA 4 crossed above EMA 17 on 15m HA. ADX >25 confirms trend. RSI not overbought. MACD histogram positive and expanding.", session: "london" },
        { user_id: userId, symbol: "US30", timeframe: "15", candle_type: "heiken_ashi", direction: "BUY", confidence: 5, entry_price: 42180, take_profit: 42340, stop_loss: 42100, risk_reward: "2:1", adx: 24.1, rsi: 58, macd_status: "Bullish", stoch_rsi: 64, ema_fast_value: 42170, ema_slow_value: 42140, ema_crossover_status: "CONFIRMED", ema_crossover_direction: "BULLISH", supertrend_status: "BUY", verdict: "MEDIUM", reasoning: "Moderate bullish setup. EMA crossover confirmed. ADX near threshold. Correlation warning with NAS100.", session: "london" },
        { user_id: userId, symbol: "AUDUSD", timeframe: "15", candle_type: "heiken_ashi", direction: "WAIT", confidence: 3, entry_price: null, take_profit: null, stop_loss: null, risk_reward: null, adx: 14.2, rsi: 49, macd_status: "Neutral", stoch_rsi: 45, ema_fast_value: 0.658, ema_slow_value: 0.6575, ema_crossover_status: "NONE", ema_crossover_direction: null, supertrend_status: "NEUTRAL", verdict: "LOW", reasoning: "No clear trend. ADX below 20 signals ranging market. Wait for breakout.", session: "london" },
        { user_id: userId, symbol: "NZDUSD", timeframe: "15", candle_type: "heiken_ashi", direction: "WAIT", confidence: 3, entry_price: null, take_profit: null, stop_loss: null, risk_reward: null, adx: 12.8, rsi: 47, macd_status: "Neutral", stoch_rsi: 42, ema_fast_value: 0.592, ema_slow_value: 0.5915, ema_crossover_status: "NONE", ema_crossover_direction: null, supertrend_status: "NEUTRAL", verdict: "LOW", reasoning: "Choppy price action. Correlated with AUDUSD.", session: "london" },
        { user_id: userId, symbol: "XAUUSD", timeframe: "15", candle_type: "heiken_ashi", direction: "NO_TRADE", confidence: 2, entry_price: null, take_profit: null, stop_loss: null, risk_reward: null, adx: 10.5, rsi: 51, macd_status: "Bearish", stoch_rsi: 38, ema_fast_value: 2340, ema_slow_value: 2345, ema_crossover_status: "NONE", ema_crossover_direction: null, supertrend_status: "SELL", verdict: "NO_TRADE", reasoning: "Low conviction. ADX very weak. News event approaching.", session: "asian" },
      ];
      await supabase.from("scan_results").insert(scanInserts);

      // Seed signals
      const signalInserts = [
        { user_id: userId, symbol: "NAS100", direction: "BUY", confidence: 6, entry_price: 24059, take_profit: 24277, stop_loss: 23950, risk_reward: "2:1", result: "pending", pnl: null, notes: "EMA crossover confirmed on 15m HA." },
        { user_id: userId, symbol: "US30", direction: "BUY", confidence: 5, entry_price: 42100, take_profit: 42260, stop_loss: 42020, risk_reward: "2:1", result: "win", pnl: 320, closed_at: "2026-04-05T14:30:00Z", notes: "London overlap entry. ADX 26." },
        { user_id: userId, symbol: "NAS100", direction: "BUY", confidence: 7, entry_price: 23950, take_profit: 24180, stop_loss: 23835, risk_reward: "2:1", result: "win", pnl: 460, closed_at: "2026-04-05T10:00:00Z", notes: "Strong EMA separation. RSI bounce from 40." },
        { user_id: userId, symbol: "XAUUSD", direction: "SELL", confidence: 4, entry_price: 2340, take_profit: 2325, stop_loss: 2348, risk_reward: "1.9:1", result: "loss", pnl: -160, closed_at: "2026-04-04T15:45:00Z", notes: "Bearish divergence on RSI. Stopped out by news." },
        { user_id: userId, symbol: "AUDUSD", direction: "BUY", confidence: 5, entry_price: 0.658, take_profit: 0.661, stop_loss: 0.6565, risk_reward: "2:1", result: "win", pnl: 180, closed_at: "2026-04-04T09:30:00Z", notes: "Asian session breakout." },
        { user_id: userId, symbol: "NAS100", direction: "BUY", confidence: 8, entry_price: 23800, take_profit: 24020, stop_loss: 23690, risk_reward: "2:1", result: "win", pnl: 440, closed_at: "2026-04-03T14:00:00Z", notes: "All indicators aligned." },
        { user_id: userId, symbol: "US30", direction: "SELL", confidence: 3, entry_price: 41950, take_profit: 41830, stop_loss: 42010, risk_reward: "2:1", result: "loss", pnl: -120, closed_at: "2026-04-03T10:15:00Z", notes: "Counter-trend attempt. Low ADX." },
        { user_id: userId, symbol: "NZDUSD", direction: "BUY", confidence: 4, entry_price: 0.592, take_profit: 0.5945, stop_loss: 0.5907, risk_reward: "1.9:1", result: "win", pnl: 125, closed_at: "2026-04-02T09:00:00Z", notes: "London open momentum." },
        { user_id: userId, symbol: "NAS100", direction: "BUY", confidence: 6, entry_price: 23650, take_profit: 23870, stop_loss: 23540, risk_reward: "2:1", result: "win", pnl: 440, closed_at: "2026-04-01T14:30:00Z", notes: "Strong trend day." },
        { user_id: userId, symbol: "XAUUSD", direction: "SELL", confidence: 5, entry_price: 2355, take_profit: 2340, stop_loss: 2363, risk_reward: "1.9:1", result: "win", pnl: 300, closed_at: "2026-04-01T10:00:00Z", notes: "Bearish EMA cross. ADX expanding." },
      ];
      await supabase.from("signals").insert(signalInserts);

      // Seed journal entries
      const journalInserts = [
        { user_id: userId, entry_date: "2026-04-01", session_summary: "London session. 2 trades, both winners.", notes: "Great start to the month. Both setups hit TP with clean entries.", tags: ["EMA Cross", "Trend Day"], mood: "confident" },
        { user_id: userId, entry_date: "2026-04-02", session_summary: "Asian session setup on NZDUSD.", notes: "Only one setup met conviction threshold. Patience paid off.", tags: ["Patience"], mood: "disciplined" },
        { user_id: userId, entry_date: "2026-04-03", session_summary: "Mixed day. 1W 1L.", notes: "NAS100 was excellent but US30 counter-trend attempt was a mistake.", tags: ["Lesson", "Counter-trend"], mood: "neutral" },
        { user_id: userId, entry_date: "2026-04-04", session_summary: "NY session. News event caused loss.", notes: "XAUUSD stopped out by news spike. Should have checked calendar.", tags: ["News Impact"], mood: "frustrated" },
        { user_id: userId, entry_date: "2026-04-05", session_summary: "2 wins, $780 profit.", notes: "Perfect day. Both setups from London overlap. High conviction entries only.", tags: ["London Overlap", "Perfect Day"], mood: "confident" },
      ];
      await supabase.from("journal_entries").insert(journalInserts);

      // Seed backtest results
      const backtestInserts = [
        { user_id: userId, symbol: "NAS100", timeframe: "15", candle_type: "heiken_ashi", ema_fast: 4, ema_slow: 17, period_months: 6, total_trades: 142, win_rate: 68, profit_factor: 1.92, net_pnl: 8420, max_drawdown: -1240, avg_rr: 1.7, sharpe_ratio: 1.84, expectancy: 59.3, equity_curve: [0, 200, 150, 400, 600, 550, 800, 1100, 950, 1200, 1500, 1400, 1800, 2100, 2000, 2400, 2800, 2700, 3200, 3600, 3500, 4000, 4400, 4200, 4800, 5200, 5600, 5400, 6000, 6400, 6200, 6800, 7200, 7000, 7600, 8000, 7800, 8420] },
      ];
      await supabase.from("backtest_results").insert(backtestInserts);

      // Seed insights
      const insightInserts = [
        { user_id: userId, insight_type: "best_time", symbol: "XAUUSD", title: "Best Time to Trade", description: "XAUUSD performs best during London/NY overlap, 13:00-16:00 UTC. Win rate: 78%", data: { session: "london_ny_overlap", time: "13:00-16:00", winRate: 78 }, severity: "info" },
        { user_id: userId, insight_type: "best_time", symbol: "NAS100", title: "Best Time to Trade", description: "NAS100 performs best during NY open 14:30-16:00 UTC. Win rate: 74%", data: { session: "new_york", time: "14:30-16:00", winRate: 74 }, severity: "info" },
        { user_id: userId, insight_type: "biggest_moves", symbol: "XAUUSD", title: "Biggest Moves", description: "XAUUSD avg 320 pips during FOMC days (+4.2x normal)", data: { avgMove: 320, multiplier: 4.2 }, severity: "info" },
        { user_id: userId, insight_type: "edge", title: "Your Edge", description: "EMA Cross + ADX > 25 combined with London session produces 82% win rate", data: { winRate: 82, setup: "EMA Cross + ADX > 25" }, severity: "info" },
        { user_id: userId, insight_type: "risk_alert", title: "Counter-trend Asian Losses", description: "Trading against trend in Asian session has only 28% win rate", data: { winRate: 28 }, severity: "critical", estimated_impact: -520 },
        { user_id: userId, insight_type: "pattern", title: "Over-trading after winning streaks", description: "You tend to increase position frequency after 3+ consecutive wins. Win rate drops from 72% to 38%.", severity: "warning", estimated_impact: -840 },
        { user_id: userId, insight_type: "pattern", title: "Friday afternoon performance drop", description: "Your win rate drops to 45% after 18:00 UTC on Fridays.", severity: "warning", estimated_impact: -320 },
        { user_id: userId, insight_type: "weekly_digest", title: "Weekly Summary", description: "This week you performed best on Thursday during London overlap — 4 wins, 0 losses, +$680 P&L.", week_start: "2026-03-31", data: { bestDay: "Thursday", bestSession: "london_ny_overlap", winRate: 80 }, severity: "info" },
        { user_id: userId, insight_type: "instrument_intelligence", symbol: "NAS100", title: "NAS100 Intelligence", description: "Focus on NY session. Thursday shows consistently highest win rate. EMA 4/17 cross signals are your best setup.", data: { bestSession: "New York (14:30–21:00 UTC)", optimalEMA: "4/17", winByDay: { Mon: 65, Tue: 72, Wed: 68, Thu: 78, Fri: 60 } }, severity: "info" },
        { user_id: userId, insight_type: "instrument_intelligence", symbol: "XAUUSD", title: "XAUUSD Intelligence", description: "Avoid Asian session — your win rate drops to 35%. Best on Thu during London/NY overlap.", data: { bestSession: "London/NY Overlap (13:00–16:00 UTC)", optimalEMA: "5/13", winByDay: { Mon: 55, Tue: 62, Wed: 70, Thu: 72, Fri: 48 } }, severity: "warning" },
      ];
      await supabase.from("insights").insert(insightInserts);
    })();
  }, [userId]);
}
