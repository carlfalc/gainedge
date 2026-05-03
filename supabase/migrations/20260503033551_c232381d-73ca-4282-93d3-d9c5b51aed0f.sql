CREATE OR REPLACE FUNCTION public.bulk_insert_candles(candles jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer := 0;
BEGIN
  INSERT INTO public.candle_history (symbol, timeframe, "timestamp", open, high, low, close, volume)
  SELECT
    (c->>'symbol')::text,
    (c->>'timeframe')::text,
    (c->>'timestamp')::timestamptz,
    (c->>'open')::numeric,
    (c->>'high')::numeric,
    (c->>'low')::numeric,
    (c->>'close')::numeric,
    COALESCE((c->>'volume')::integer, 0)
  FROM jsonb_array_elements(candles) c
  ON CONFLICT (symbol, timeframe, "timestamp") DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_insert_candles(jsonb) TO anon, authenticated;