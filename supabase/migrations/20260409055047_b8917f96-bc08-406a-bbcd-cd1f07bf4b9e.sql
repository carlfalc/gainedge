
-- Create falconer_knowledge table
CREATE TABLE public.falconer_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version TEXT NOT NULL DEFAULT 'v2',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.falconer_knowledge ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read rules (platform reference data)
CREATE POLICY "Authenticated users can read rules"
  ON public.falconer_knowledge FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can mutate (edge functions + admin via service key)
-- No INSERT/UPDATE/DELETE policies for anon/authenticated

-- SEED ENTRY RULES
INSERT INTO public.falconer_knowledge (category, rule_name, rule_text, priority, version) VALUES
('entry_rules', 'EMA Crossover Confirmation', 'Only signal when EMA4 crosses EMA17 on a CLOSED candle. The crossover must be confirmed on a completed candle, never a forming candle.', 10, 'v2'),
('entry_rules', 'Multiple Confluence Required', 'Require at least 3 confirming factors: EMA crossover confirmed + RSI confirming direction (above 55 for BUY, below 45 for SELL) + one of: MACD aligned, ADX above 25, StochRSI confirming, or volume above 20-candle average.', 9, 'v2'),
('entry_rules', 'Pullback Entry Preferred', 'Best entries are on pullbacks to the fast EMA after confirmed crossover. If price has moved more than 60% of average candle range away from crossover point, mark as WAIT for pullback rather than chasing.', 8, 'v2'),
('entry_rules', 'Fresh Crossover Only', 'Only trade the first crossover. If EMA4 and EMA17 have crossed 3+ times in the last 20 candles (choppy market), output NO_TRADE.', 9, 'v2'),
('entry_rules', 'Trend Alignment', 'BUY signals have higher confidence when the SMA50 is sloping upward. SELL signals have higher confidence when SMA50 slopes downward. If signal direction conflicts with SMA50 direction, reduce confidence by 2.', 8, 'v2');

-- SEED NO TRADE RULES
INSERT INTO public.falconer_knowledge (category, rule_name, rule_text, priority, version) VALUES
('no_trade_rules', 'Low ADX Filter', 'If ADX below 18, market is not trending. Output NO_TRADE regardless of crossover signal.', 10, 'v2'),
('no_trade_rules', 'Choppy Market Detection', 'If there have been 3+ alternating EMA crossovers in the last 25 candles, market is choppy. NO_TRADE.', 9, 'v2'),
('no_trade_rules', 'Overtrading Prevention', 'Maximum 2 new signals per instrument per 2-hour window. If 2 signals already fired in the window, suppress new ones.', 8, 'v2'),
('no_trade_rules', 'RSI Extreme Caution', 'If RSI above 75, do not take BUY signals (overbought). If RSI below 25, do not take SELL signals (oversold). These are potential reversal zones.', 8, 'v2'),
('no_trade_rules', 'Tight Range Filter', 'If the last 10 candles have a total range less than 50% of the 50-candle average range, market is too quiet. NO_TRADE.', 7, 'v2');

-- SEED RISK MANAGEMENT RULES
INSERT INTO public.falconer_knowledge (category, rule_name, rule_text, priority, version) VALUES
('risk_management', 'Minimum R:R 2:1', 'Never generate a signal with less than 2:1 reward-to-risk. If nearest structure does not support 2:1, skip the trade.', 10, 'v2'),
('risk_management', 'Stop Loss Behind Structure', 'Place SL behind the nearest swing high (for SELL) or swing low (for BUY) from the last 20 candles. Add a small buffer of 0.1% beyond the swing point.', 9, 'v2'),
('risk_management', 'Correlated Pairs Filter', 'NAS100 and US30 are correlated. AUDUSD and NZDUSD are correlated. If both pairs in a correlated group have active signals, only keep the one with higher confidence.', 8, 'v2');

-- SEED EXIT RULES
INSERT INTO public.falconer_knowledge (category, rule_name, rule_text, priority, version) VALUES
('exit_rules', 'Take Profit at Structure', 'Set TP at the nearest significant swing high (for BUY) or swing low (for SELL) within the last 50 candles. This is where price is likely to find resistance or support.', 8, 'v2'),
('exit_rules', 'Time Based Expiry', 'If a signal has not hit TP or SL within 20 candle periods, mark as EXPIRED.', 7, 'v2');

-- SEED SESSION RULES
INSERT INTO public.falconer_knowledge (category, rule_name, rule_text, priority, version) VALUES
('session_rules', 'Asian Session Caution', 'During Asian session (00:00-08:00 UTC), use tighter TP targets (reduce by 30%) as volatility is lower. Gold and forex pairs tend to range.', 7, 'v2'),
('session_rules', 'London Open Power', 'London session open (08:00-09:00 UTC) often sets the daily direction. Signals firing in this window get +1 confidence bonus.', 7, 'v2'),
('session_rules', 'NY/London Overlap', 'During 13:00-17:00 UTC overlap, volume is highest. Signals in this window get +1 confidence bonus. Use wider TP targets.', 7, 'v2');

-- SEED MARKET STRUCTURE
INSERT INTO public.falconer_knowledge (category, rule_name, rule_text, priority, version) VALUES
('market_structure', 'Swing Point Detection', 'Identify swing highs and swing lows from the last 30 candles. A swing high is a candle whose high is higher than the 3 candles before and after it. Use these for SL and TP placement.', 8, 'v2');
