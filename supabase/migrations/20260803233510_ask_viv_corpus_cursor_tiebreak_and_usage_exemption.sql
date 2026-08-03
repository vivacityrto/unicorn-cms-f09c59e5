-- Ask Viv Assistant — fix a real data-loss bug in embed-ask-viv-corpus's
-- incremental cursor, and add a per-user usage-cap exemption.

-- 1. Cursor tiebreak. The `notes` table is a bulk-migrated legacy table
-- where 9,556 of its ~11,337 rows share the EXACT SAME updated_at
-- timestamp (a bulk-import artifact, not a real edit time). The ingestion
-- function's cursor used a plain `.gt(updated_at, since)` filter with no
-- tiebreaker — the very first cron run picked up 150 of those 9,556
-- identical-timestamp rows (the per-batch limit), advanced the cursor to
-- that exact timestamp, and every run since has correctly-per-its-own-logic
-- excluded it — permanently orphaning the other 9,406 rows. This affects
-- only `notes` today, but the column is added for every source since the
-- same failure mode could hit any table with duplicate cursor-column values
-- exceeding one batch.
alter table public.ask_viv_corpus_ingestion_state
  add column if not exists last_id text;

comment on column public.ask_viv_corpus_ingestion_state.last_id is
  'Tiebreaker for the incremental cursor when multiple rows share the same cursorColumn value (e.g. a bulk-import timestamp) — without this, a duplicate-timestamp cluster larger than one batch permanently orphans every row past the batch limit.';

-- 2. Force a full re-backfill of `notes` under the fixed tiebreak logic —
-- this is the only source confirmed to have the duplicate-timestamp gap.
update public.ask_viv_corpus_ingestion_state
  set last_run_at = '1970-01-01T00:00:00Z', last_id = null
  where source_table = 'notes';

-- 3. Per-user daily-cap exemption — same array-of-user-ids shape already
-- used for ask_viv_assistant_beta_user_ids.
alter table public.app_settings
  add column if not exists ask_viv_assistant_unlimited_user_ids uuid[] not null default '{}'::uuid[];

comment on column public.app_settings.ask_viv_assistant_unlimited_user_ids is
  'users.user_uuid values exempt from ask_viv_assistant_daily_token_cap entirely — the usage check short-circuits to "within cap" for these users without even reading their usage row.';

update public.app_settings
  set ask_viv_assistant_unlimited_user_ids =
    array(select distinct unnest(ask_viv_assistant_unlimited_user_ids || array['6df5fa0f-f266-479f-bbd7-3c56856e9a50']::uuid[]));
