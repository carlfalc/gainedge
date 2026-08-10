DO $$
DECLARE v_token text;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets
  WHERE name = 'falconer_service_role_key' LIMIT 1;
  IF v_token IS NULL OR length(v_token) = 0 THEN
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key' LIMIT 1;
  END IF;
  IF v_token IS NULL THEN RAISE NOTICE 'no vault key'; RETURN; END IF;

  PERFORM net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-snapshot',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_token),
    body := jsonb_build_object('mode','backfill','start','2026-08-10T01:00:00Z','end','2026-08-10T23:59:00Z','limit',200)
  );
END $$;