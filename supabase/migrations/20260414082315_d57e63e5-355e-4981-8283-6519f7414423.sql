
-- Fix SECURITY DEFINER view — recreate as regular view (uses invoker permissions)
DROP VIEW IF EXISTS public.ron_platform_stats;
CREATE VIEW public.ron_platform_stats WITH (security_invoker = true) AS
SELECT
  pattern_active AS pattern_name,
  symbol,
  session,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE result = 'WIN') AS wins,
  COUNT(*) FILTER (WHERE result = 'LOSS') AS losses,
  CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE result = 'WIN')::numeric / COUNT(*) * 100, 1) ELSE 0 END AS win_rate,
  ROUND(AVG(ABS(pnl_pips)) FILTER (WHERE result = 'WIN'), 1) AS avg_win_pips,
  ROUND(AVG(ABS(pnl_pips)) FILTER (WHERE result = 'LOSS'), 1) AS avg_loss_pips,
  ROUND(AVG(confidence), 1) AS avg_confidence
FROM public.signal_outcomes
WHERE pattern_active IS NOT NULL
GROUP BY pattern_active, symbol, session;

-- Allow service role to delete candle history (for cleanup)
CREATE POLICY "Service role can delete old candles"
  ON public.candle_history FOR DELETE
  USING (auth.role() = 'service_role');

-- Fix search_path on enqueue_email
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

-- Fix search_path on read_email_batch
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

-- Fix search_path on delete_email
CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

-- Fix search_path on move_to_dlq
CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;
