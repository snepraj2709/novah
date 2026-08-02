create or replace function public.configure_notification_cron(
  input_cron_secret text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cron_job_name constant text := 'novah-process-notifications-10m';
  vault_secret_name constant text := 'novah_cron_secret';
  existing_secret_id uuid;
  scheduled_job_id bigint;
  job_command constant text := $command$
    select net.http_post(
      url := 'https://fqinppulljqefbvukcpg.supabase.co/functions/v1/process-notifications',
      body := '{}'::jsonb,
      headers := pg_catalog.jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select secret.decrypted_secret
          from vault.decrypted_secrets as secret
          where secret.name = 'novah_cron_secret'
        )
      ),
      timeout_milliseconds := 120000
    );
  $command$;
begin
  if (select auth.role()) <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;

  if
    input_cron_secret is null
    or pg_catalog.char_length(input_cron_secret) < 32
    or pg_catalog.char_length(input_cron_secret) > 256
    or input_cron_secret ~ '[[:space:]]'
  then
    raise check_violation using message = 'Invalid Cron secret';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(cron_job_name, 0)
  );

  select secret.id
  into existing_secret_id
  from vault.secrets as secret
  where secret.name = vault_secret_name;

  if existing_secret_id is null then
    perform vault.create_secret(
      input_cron_secret,
      vault_secret_name,
      'Novah process-notifications Bearer secret',
      null
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      input_cron_secret,
      vault_secret_name,
      'Novah process-notifications Bearer secret',
      null
    );
  end if;

  perform cron.unschedule(job.jobid)
  from cron.job as job
  where job.jobname = cron_job_name;

  select cron.schedule(
    cron_job_name,
    '*/10 * * * *',
    job_command
  ) into scheduled_job_id;

  return scheduled_job_id;
end;
$$;

revoke all on function public.configure_notification_cron(text)
from public, anon, authenticated;
grant execute on function public.configure_notification_cron(text)
to service_role;
