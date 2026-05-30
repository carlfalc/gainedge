-- Track partial-fill progress for live Falconer positions so the engine can mirror
-- the backtest's scale-out behaviour (close qty1 at TP1, qty2 at TP2, ride qty3 to TP3 / HA-flip).
-- Additive + idempotent: safe to re-run.
ALTER TABLE public.falconer_trades
  ADD COLUMN IF NOT EXISTS filled1 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS filled2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS filled3 boolean NOT NULL DEFAULT false;
