DO $$
DECLARE v_token text; h jsonb;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key' LIMIT 1;
  h := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_token);
  PERFORM net.http_post(url:='https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/ron-calibrate', headers:=h,
    body:='{"source_as_of":"2026-08-12T06:09:00.000Z","persist":true}'::jsonb, timeout_milliseconds:=150000);
END $$;