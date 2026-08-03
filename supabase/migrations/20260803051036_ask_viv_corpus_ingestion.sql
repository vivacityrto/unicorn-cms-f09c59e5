-- Ask Viv Assistant Phase C — RAG ingestion plumbing for prose sources
-- (client_notes, notes, email_messages, eos_meeting_summaries,
-- client_timeline_events) into ask_viv_corpus (schema created in Phase A,
-- unused until now).

-- Per-source high-water mark for incremental ingestion — the embed-ask-viv-corpus
-- edge function reads rows changed since this timestamp, then advances it.
-- A per-row DB trigger would be more real-time but far more fragile; polling
-- on a schedule tolerates a failed run without any per-row bookkeeping.
create table public.ask_viv_corpus_ingestion_state (
  source_table text primary key,
  last_run_at timestamptz not null default '1970-01-01T00:00:00Z',
  updated_at timestamptz not null default now()
);

alter table public.ask_viv_corpus_ingestion_state enable row level security;
-- Service-role only — internal cron bookkeeping, not user-facing data, so no
-- policies for authenticated (matches ask_viv_assistant_usage's write model).
grant all on public.ask_viv_corpus_ingestion_state to service_role;

-- Incremental ingestion every 30 minutes.
select cron.schedule(
  'embed-ask-viv-corpus-incremental',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/embed-ask-viv-corpus',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
