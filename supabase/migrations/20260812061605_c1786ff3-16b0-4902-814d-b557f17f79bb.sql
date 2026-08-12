DO $$
DECLARE v_token text; v_url text := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-calibrate'; h jsonb;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key' LIMIT 1;
  IF v_token IS NULL THEN RAISE EXCEPTION 'no email_queue key'; END IF;
  h := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token);
  PERFORM net.http_post(url:=v_url, headers:=h, body:='{"source_as_of":"2026-08-12T06:09:00.000Z","source_bar_cutoff":"2026-08-12T05:00:00.000Z","persist":false}'::jsonb, timeout_milliseconds:=150000);
  PERFORM net.http_post(url:=v_url, headers:=h, body:='{"source_as_of":"2026-08-12T06:09:00.000Z","calibration_version":999,"persist":false}'::jsonb, timeout_milliseconds:=150000);
END $$;