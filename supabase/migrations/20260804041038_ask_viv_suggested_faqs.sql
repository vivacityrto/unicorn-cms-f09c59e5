-- Ask Viv Assistant — suggested FAQ prompts, mined from real staff usage.
--
-- Cache table populated by the generate-ask-viv-faqs edge function (cron,
-- daily): clusters real user questions from ask_viv_turns (role='user',
-- mode='assistant', across ALL staff — not per-user) into a handful of
-- representative, rephrased FAQ prompts via a cheap Haiku call. Truncate-
-- and-replace on each run, same as any derived/ephemeral suggestion cache —
-- there's no history value in old rows once a fresher clustering exists.
--
-- Read policy mirrors srto_corpus_read exactly: any authenticated internal
-- Vivacity staff user (present in `users`), not tenant-scoped — this is
-- platform-wide usage-pattern content, not client data.
create table public.ask_viv_suggested_faqs (
  id uuid primary key default gen_random_uuid(),
  prompt_text text not null,
  category text,
  occurrence_count integer not null default 1,
  rank integer not null,
  generated_at timestamptz not null default now()
);

create index ask_viv_suggested_faqs_rank_idx on public.ask_viv_suggested_faqs (rank);

alter table public.ask_viv_suggested_faqs enable row level security;

create policy "ask_viv_suggested_faqs_read"
on public.ask_viv_suggested_faqs
for select
to authenticated
using (
  exists (select 1 from users u where u.user_uuid = (select auth.uid()))
);

select cron.schedule(
  'generate-ask-viv-faqs-daily',
  '17 3 * * *',
  $$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/generate-ask-viv-faqs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt()
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
