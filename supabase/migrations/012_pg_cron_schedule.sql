-- Enable pg_cron and pg_net extensions (required for scheduled edge function calls)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Grant cron usage to postgres role
grant usage on schema cron to postgres;

-- Remove any existing schedule to avoid duplicates on re-run
select cron.unschedule('schedule-crawls-hourly')
where exists (
  select 1 from cron.job where jobname = 'schedule-crawls-hourly'
);

-- Schedule the schedule-crawls edge function to run every hour
-- It dispatches crawl jobs for all pages that are due
select cron.schedule(
  'schedule-crawls-hourly',               -- job name
  '0 * * * *',                            -- every hour on the hour
  $$
  select
    net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/schedule-crawls',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
