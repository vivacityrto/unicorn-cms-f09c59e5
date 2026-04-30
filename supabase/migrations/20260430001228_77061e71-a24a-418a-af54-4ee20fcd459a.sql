-- Step 1: Extend the source_type enum with National Code values.
alter type public.srto_source_type add value if not exists 'national_code';
alter type public.srto_source_type add value if not exists 'cricos_practice_guide';
alter type public.srto_source_type add value if not exists 'esos_act';

-- Step 2: Add framework column to srto_corpus.
alter table public.srto_corpus
  add column if not exists framework text not null default 'SRTO_2025'
  check (framework in ('SRTO_2025', 'NATIONAL_CODE_2018', 'ESOS_ACT_2000'));

update public.srto_corpus
  set framework = 'SRTO_2025'
  where framework is null;

-- Step 3: Index for framework-filtered queries.
create index if not exists srto_corpus_framework_idx
  on public.srto_corpus (framework);

-- Step 4: Replace match_srto_chunks to accept an optional framework filter.
-- Do NOT set search_path = public; the pgvector operators live in the
-- `extensions` schema and must remain resolvable.
drop function if exists public.match_srto_chunks(
  vector,
  float,
  integer,
  public.srto_source_type,
  text
);

create or replace function public.match_srto_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count     integer default 8,
  filter_source_type public.srto_source_type default null,
  filter_clause      text default null,
  filter_framework   text default null
)
returns table (
  id              uuid,
  source_document text,
  source_type     public.srto_source_type,
  framework       text,
  clause          text,
  quality_area    text,
  heading         text,
  content         text,
  similarity      float
)
language sql
stable
security invoker
as $$
  select
    c.id,
    c.source_document,
    c.source_type,
    c.framework,
    c.clause,
    c.quality_area,
    c.heading,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.srto_corpus c
  where (filter_source_type is null or c.source_type = filter_source_type)
    and (filter_clause      is null or c.clause      = filter_clause)
    and (filter_framework   is null or c.framework   = filter_framework)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.match_srto_chunks is
  'Cosine-similarity retrieval over srto_corpus with optional framework filter. security_invoker preserves RLS.';

-- Smoke-test: confirm new signature compiles and accepts a framework filter.
do $$
declare
  zero_vec vector(1536) := array_fill(0::real, array[1536])::vector(1536);
begin
  perform * from public.match_srto_chunks(zero_vec, 0.7, 1, null, null, 'NATIONAL_CODE_2018');
end $$;