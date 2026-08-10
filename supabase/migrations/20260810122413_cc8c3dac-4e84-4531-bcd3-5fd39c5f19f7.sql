CREATE OR REPLACE FUNCTION public.ron_verify_cron_token(_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ok boolean := false;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets s
    WHERE s.name IN ('falconer_service_role_key', 'email_queue_service_role_key', 'ron_cron_key')
      AND s.decrypted_secret IS NOT NULL
      AND length(s.decrypted_secret) > 0
      AND s.decrypted_secret = _token
  ) INTO ok;
  RETURN ok;
END;
$$;

REVOKE ALL ON FUNCTION public.ron_verify_cron_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ron_verify_cron_token(text) FROM anon;
REVOKE ALL ON FUNCTION public.ron_verify_cron_token(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ron_verify_cron_token(text) TO service_role;

REVOKE ALL ON FUNCTION public.ron_snapshot_cron_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ron_snapshot_cron_tick() FROM anon;
REVOKE ALL ON FUNCTION public.ron_snapshot_cron_tick() FROM authenticated;