ALTER TABLE public.falconer_trades
  ADD COLUMN IF NOT EXISTS filled1 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS filled2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS filled3 boolean NOT NULL DEFAULT false;