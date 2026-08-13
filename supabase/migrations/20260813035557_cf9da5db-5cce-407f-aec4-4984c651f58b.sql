DO $$
DECLARE v_token text;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='falconer_service_role_key' LIMIT 1;
  IF v_token IS NULL THEN
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key' LIMIT 1;
  END IF;
  PERFORM net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-recover-15m',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
END $$;