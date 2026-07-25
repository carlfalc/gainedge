
-- (1) Falconer cron: unschedule + reschedule with Vault fallback
do $$
begin
  perform cron.unschedule('falconer-engine-5m');
exception when others then null;
end $$;

create or replace function public.falconer_cron_tick()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'falconer_service_role_key'
  limit 1;

  if v_token is null or length(v_token) = 0 then
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'email_queue_service_role_key'
    limit 1;
  end if;

  if v_token is null or length(v_token) = 0 then
    insert into public.falconer_engine_events (event_type, severity, message, context)
    values (
      'cron_auth_missing',
      'error',
      'falconer-engine cron skipped: no service-role key found in Vault',
      '{}'::jsonb
    );
    return;
  end if;

  perform net.http_post(
    url := 'https://ecsztqtyttnqdnsphxip.supabase.co/functions/v1/falconer-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.falconer_cron_tick() from public;
revoke all on function public.falconer_cron_tick() from anon;
revoke all on function public.falconer_cron_tick() from authenticated;

select cron.schedule(
  'falconer-engine-5m',
  '*/5 * * * *',
  $cron$ select public.falconer_cron_tick(); $cron$
);

-- (2) Retire orphan operational jobs
do $$
declare j text;
begin
  foreach j in array array['compute-market-data-30s','broker-health-monitor-5min'] loop
    begin
      perform cron.unschedule(j);
    exception when others then null;
    end;
  end loop;
end $$;

-- (3) market_data_backfill_jobs
create table if not exists public.market_data_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metaapi_account_id text not null,
  symbol text not null,
  timeframe text not null,
  requested_start timestamptz not null,
  requested_end timestamptz not null,
  cursor_time timestamptz,
  status text not null default 'queued'
    check (status in ('queued','running','complete','failed','cancelled')),
  rows_inserted integer not null default 0,
  pages_completed integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists market_data_backfill_jobs_user_idx
  on public.market_data_backfill_jobs (user_id, created_at desc);
create index if not exists market_data_backfill_jobs_status_idx
  on public.market_data_backfill_jobs (status);

grant select on public.market_data_backfill_jobs to authenticated;
grant all on public.market_data_backfill_jobs to service_role;

alter table public.market_data_backfill_jobs enable row level security;

drop policy if exists "Users read own backfill jobs" on public.market_data_backfill_jobs;
create policy "Users read own backfill jobs"
  on public.market_data_backfill_jobs for select
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists market_data_backfill_jobs_touch on public.market_data_backfill_jobs;
create trigger market_data_backfill_jobs_touch
  before update on public.market_data_backfill_jobs
  for each row execute function public.update_updated_at_column();

-- Enable realtime for progress UI
alter publication supabase_realtime add table public.market_data_backfill_jobs;
