create extension if not exists vector with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'srto_source_type') then
    create type public.srto_source_type as enum (
      'outcome_standards',
      'compliance_requirements',
      'credential_policy',
      'practice_guide'
    );
  end if;
end $$;

create table if not exists public.srto_corpus (
  id              uuid primary key default gen_random_uuid(),
  source_document text not null,
  source_type     public.srto_source_type not null,
  source_version  text,
  clause          text,
  quality_area    text,
  heading         text,
  content         text not null,
  token_count     integer not null,
  chunk_index     integer not null,
  chunk_total     integer not null,
  content_hash    text not null,
  embedding       extensions.vector(1536) not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.srto_corpus is
  'Embedded chunks of the SRTO 2025 corpus for semantic retrieval. Read-only library table; writes occur only via the embed-srto-corpus edge function with the service role key. updated_at is set explicitly by the embed function on upsert (no trigger, to avoid coupling with the shared set_updated_at() trigger used by other modules).';

create unique index if not exists srto_corpus_doc_chunk_hash_uniq
  on public.srto_corpus (source_document, chunk_index, content_hash);

create index if not exists srto_corpus_embedding_hnsw
  on public.srto_corpus
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists srto_corpus_clause_idx
  on public.srto_corpus (clause) where clause is not null;
create index if not exists srto_corpus_quality_area_idx
  on public.srto_corpus (quality_area) where quality_area is not null;
create index if not exists srto_corpus_source_type_idx
  on public.srto_corpus (source_type);

alter table public.srto_corpus enable row level security;

drop policy if exists srto_corpus_read on public.srto_corpus;
create policy srto_corpus_read
on public.srto_corpus
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.user_uuid = auth.uid()
  )
);

create or replace function public.match_srto_chunks(
  query_embedding    extensions.vector(1536),
  match_threshold    float default 0.7,
  match_count        integer default 8,
  filter_source_type public.srto_source_type default null,
  filter_clause      text default null
)
returns table (
  id              uuid,
  source_document text,
  source_type     public.srto_source_type,
  clause          text,
  quality_area    text,
  heading         text,
  content         text,
  similarity      float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.source_document,
    c.source_type,
    c.clause,
    c.quality_area,
    c.heading,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.srto_corpus c
  where (filter_source_type is null or c.source_type = filter_source_type)
    and (filter_clause      is null or c.clause      = filter_clause)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.match_srto_chunks is
  'Cosine-similarity retrieval over srto_corpus. security invoker preserves RLS — caller must satisfy srto_corpus_read.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'srto-source-documents',
  'srto-source-documents',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists srto_source_super_admin_read on storage.objects;
create policy srto_source_super_admin_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'srto-source-documents'
  and exists (
    select 1 from public.users u
    where u.user_uuid = auth.uid()
      and u.unicorn_role = 'Super Admin'
  )
);

-- Smoke test: prove type, unique, RPC, and HNSW all work.
do $$
declare
  zero_vec extensions.vector(1536);
  inserted_id uuid;
  hits int;
begin
  -- pgvector input format is '[0,0,...,0]' (square brackets, comma-separated).
  zero_vec := ('[' || array_to_string(array_fill(0::float, array[1536]), ',') || ']')::extensions.vector(1536);

  insert into public.srto_corpus (
    source_document, source_type, content, token_count,
    chunk_index, chunk_total, content_hash, embedding
  ) values (
    '__smoke_test__', 'practice_guide', 'smoke', 1,
    0, 1, 'smoke-hash', zero_vec
  )
  returning id into inserted_id;

  select count(*) into hits from public.match_srto_chunks(zero_vec, 0.0, 1);

  delete from public.srto_corpus where id = inserted_id;

  if hits < 1 then
    raise exception 'srto_corpus smoke test failed: expected >= 1 match, got %', hits;
  end if;

  raise notice 'srto_corpus smoke test passed (% match)', hits;
end $$;
