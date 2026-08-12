CREATE OR REPLACE FUNCTION public.ron_invoke_worker(_fn text, _payload jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_token text;
  v_id bigint;
BEGIN
  IF _fn NOT IN ('ron-snapshot', 'ron-label', 'ron-calibrate', 'ron-quality', 'ron-research', 'ron-robustness') THEN
    RAISE EXCEPTION 'ron_invoke_worker: function % not allowed', _fn;
  END IF;

  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets
  WHERE name = 'falconer_service_role_key' LIMIT 1;
  IF v_token IS NULL OR length(v_token) = 0 THEN
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key' LIMIT 1;
  END IF;
  IF v_token IS NULL OR length(v_token) = 0 THEN
    RAISE EXCEPTION 'ron_invoke_worker: no service-role key in Vault';
  END IF;

  SELECT net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/' || _fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := _payload,
    timeout_milliseconds := 150000
  ) INTO v_id;
  RETURN v_id;
END;
$function$;