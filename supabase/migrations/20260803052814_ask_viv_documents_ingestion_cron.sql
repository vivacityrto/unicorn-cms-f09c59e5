-- Ask Viv Assistant Phase D — cron for embed-ask-viv-documents, mirroring the
-- Phase C prose-source ingestion cron. Reuses ask_viv_corpus_ingestion_state
-- (already generic on source_table) — no new tracking table needed.
select cron.schedule(
  'embed-ask-viv-documents-incremental',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/embed-ask-viv-documents',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
