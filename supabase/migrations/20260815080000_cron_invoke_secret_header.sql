-- Send x-cron-invoke-secret on the three cron-only edge functions that
-- previously authorised on a decoded-but-unverified JWT role=service_role
-- claim (reconcile-invite-delivery-status, sync-outlook-calendar-cron,
-- xero-invoice-sync-all).
--
-- THIS MIGRATION IS SEPARATE FROM THE FUNCTION DEPLOY. Do not apply it
-- in the same step as deploying the updated function bodies.
--
-- Prerequisites (fail-closed if either is missing):
--   1. Edge Function secret CRON_INVOKE_SECRET
--      (Dashboard → Edge Functions → Secrets, or `supabase secrets set`).
--   2. Vault secret named cron_invoke_secret with the SAME value:
--        select vault.create_secret(
--          '<same value as CRON_INVOKE_SECRET>',
--          'cron_invoke_secret',
--          'Shared secret for cron-only edge function invoke'
--        );
--
-- Safe apply order:
--   both secrets exist
--   → this migration (cron starts sending the header; old function
--     bodies ignore unknown headers)
--   → deploy the updated functions (new bodies require the header).
--
-- Reverse order (deploy functions first) 401s every cron tick until
-- this migration lands.

create or replace function private.cron_invoke_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'cron_invoke_secret'
  limit 1;
$$;

revoke all on function private.cron_invoke_secret() from public;

comment on function private.cron_invoke_secret() is
  'Returns the vault secret cron_invoke_secret for the x-cron-invoke-secret header on cron-only edge function HTTP posts. Pair with the Deno.env CRON_INVOKE_SECRET edge secret.';

-- job 22
do $$
begin
  perform cron.unschedule('reconcile-invite-delivery-status');
exception when others then
  null;
end $$;

select cron.schedule(
  'reconcile-invite-delivery-status',
  '*/20 * * * *',
  $cron$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/reconcile-invite-delivery-status',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt(),
        'x-cron-invoke-secret', private.cron_invoke_secret()
      ),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);

-- job 11
do $$
begin
  perform cron.unschedule('sync-outlook-calendar-every-30min');
exception when others then
  null;
end $$;

select cron.schedule(
  'sync-outlook-calendar-every-30min',
  '*/30 * * * *',
  $cron$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/sync-outlook-calendar-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt(),
        'x-cron-invoke-secret', private.cron_invoke_secret()
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
  $cron$
);

-- job 28
do $$
begin
  perform cron.unschedule('xero-invoice-sync-all-every-6h');
exception when others then
  null;
end $$;

select cron.schedule(
  'xero-invoice-sync-all-every-6h',
  '0 */6 * * *',
  $cron$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/xero-invoice-sync-all',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt(),
        'x-cron-invoke-secret', private.cron_invoke_secret()
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) as request_id;
  $cron$
);
