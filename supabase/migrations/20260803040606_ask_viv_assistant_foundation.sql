-- Ask Viv Assistant (new, separate conversational RAG bot) — Phase A foundation.
-- Additive only: does not touch the existing floating Ask Viv panel, srto_corpus,
-- compliance-assistant, or any of the 8 phases already shipped this session.

-- 1. New vector table for RAG over notes/emails/EOS/timeline/document content,
-- mirroring srto_corpus's proven chunking/embedding/HNSW pattern, with tenant_id
-- added since most of this content is tenant-scoped (unlike global Standards content).
create table public.ask_viv_corpus (
  id uuid primary key default gen_random_uuid(),
  tenant_id int8,                    -- null for non-tenant content (EOS/internal)
  source_type text not null,          -- 'note' | 'email' | 'timeline_event' | 'eos' | 'document'
  source_table text not null,         -- e.g. 'client_notes', 'client_timeline_events'
  source_id text not null,            -- the originating row's id, as text
  heading text,
  content text not null,
  chunk_index integer not null,
  chunk_total integer not null,
  token_count integer not null,
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ask_viv_corpus_source_chunk_hash_uniq
  on public.ask_viv_corpus (source_table, source_id, chunk_index, content_hash);
create index ask_viv_corpus_embedding_hnsw
  on public.ask_viv_corpus using hnsw (embedding extensions.vector_cosine_ops) with (m = 16, ef_construction = 64);
create index ask_viv_corpus_tenant_idx
  on public.ask_viv_corpus (tenant_id) where tenant_id is not null;
create index ask_viv_corpus_source_type_idx
  on public.ask_viv_corpus using btree (source_type);

alter table public.ask_viv_corpus enable row level security;

-- Reads: any authenticated Vivacity-internal user, tenant-scoped where tenant_id is set
-- (matches the existing ask-viv-fact-builder access model — internal staff only, and
-- every internal staff role already has access to every individual tenant's data).
create policy ask_viv_corpus_read on public.ask_viv_corpus for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.user_uuid = auth.uid() and u.is_vivacity_internal = true
        and coalesce(u.archived, false) = false and coalesce(u.disabled, false) = false
    )
  );
-- No insert/update/delete policies for authenticated users — ingestion is service-role only.

-- 2. Vector search RPC, copied directly from match_srto_chunks's exact shape.
create or replace function public.match_ask_viv_corpus(
  query_embedding    extensions.vector,
  match_threshold    double precision default 0.5,
  match_count        integer default 8,
  filter_tenant_id   int8 default null,
  filter_source_type text default null
)
returns table (
  id            uuid,
  tenant_id     int8,
  source_type   text,
  source_table  text,
  source_id     text,
  heading       text,
  content       text,
  chunk_index   integer,
  metadata      jsonb,
  similarity    double precision
)
language sql stable
set search_path to 'public', 'extensions'
as $function$
  select c.id, c.tenant_id, c.source_type, c.source_table, c.source_id,
         c.heading, c.content, c.chunk_index, c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.ask_viv_corpus c
  where (filter_tenant_id is null or c.tenant_id = filter_tenant_id or c.tenant_id is null)
    and (filter_source_type is null or c.source_type = filter_source_type)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$function$;

grant execute on function public.match_ask_viv_corpus(
  extensions.vector, double precision, integer, int8, text
) to authenticated;

-- 3. Daily usage tracking for the new direct-Anthropic integration — there is no
-- Lovable-Gateway-style cost dashboard for this, so real usage must be logged from
-- day one, with a hard cap to protect against a bug or a runaway tool-use loop.
create table public.ask_viv_assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  usage_date date not null default current_date,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  request_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

alter table public.ask_viv_assistant_usage enable row level security;

create policy ask_viv_assistant_usage_select_own on public.ask_viv_assistant_usage
  for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies for authenticated users — written service-role only,
-- from the edge function after each real Anthropic call.

-- 4. Rollout flag + daily cap value, same single-row app_settings pattern already
-- used for ask_viv_llm_generation_*.
alter table public.app_settings
  add column if not exists ask_viv_assistant_enabled boolean not null default false,
  add column if not exists ask_viv_assistant_beta_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists ask_viv_assistant_all_staff boolean not null default false,
  add column if not exists ask_viv_assistant_daily_token_cap bigint not null default 500000;

comment on column public.app_settings.ask_viv_assistant_enabled is
  'Master kill switch for the new Ask Viv Assistant (Claude Sonnet, tool-use, RAG). Separate from ask_viv_llm_generation_enabled, which gates the existing floating panel''s Compliance mode.';
comment on column public.app_settings.ask_viv_assistant_beta_user_ids is
  'Specific users.user_uuid values granted access to Ask Viv Assistant during the beta rollout ring.';
comment on column public.app_settings.ask_viv_assistant_all_staff is
  'Final rollout ring: when true (and the master flag is also true), all Vivacity staff get Ask Viv Assistant, not just Super Admin and beta_user_ids.';
comment on column public.app_settings.ask_viv_assistant_daily_token_cap is
  'Per-user daily total (input+output) token cap for Ask Viv Assistant, adjustable without a deploy. Exceeding it returns a graceful limit-reached message instead of calling Anthropic.';

-- 5. Conversation summarization support — added to the existing ask_viv_conversations
-- table from Phase 5 (this session), so long-running Assistant conversations don't
-- grow raw turn history unboundedly.
alter table public.ask_viv_conversations
  add column if not exists context_summary text,
  add column if not exists context_summary_covers_turns int not null default 0;

comment on column public.ask_viv_conversations.context_summary is
  'Condensed summary of the earliest turns in this conversation, once raw turn count exceeds the summarization threshold. Null until that threshold is first crossed.';
comment on column public.ask_viv_conversations.context_summary_covers_turns is
  'How many of the earliest turns are already folded into context_summary — only turns after this count are still sent to the model verbatim.';
