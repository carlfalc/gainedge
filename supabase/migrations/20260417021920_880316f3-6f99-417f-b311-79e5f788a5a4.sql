CREATE INDEX IF NOT EXISTS idx_signals_user_symbol_created
  ON public.signals (user_id, symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candle_history_symbol_tf_ts
  ON public.candle_history (symbol, timeframe, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_scan_results_user_symbol_scanned
  ON public.scan_results (user_id, symbol, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_user_symbol_resolved
  ON public.signal_outcomes (user_id, symbol, resolved_at DESC);