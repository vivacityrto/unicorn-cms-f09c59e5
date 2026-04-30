-- Extend match_srto_chunks to return chunk_index so consumers can cite chunk positions.
drop function if exists public.match_srto_chunks(
  vector,
  float,
  integer,
  public.srto_source_type,
  text,
  text
);

create or replace function public.match_srto_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.5,
  match_count     integer default 8,
  filter_source_type public.srto_source_type default null,
  filter_clause      text default null,
  filter_framework   text default null
)
returns table (
  id              uuid,
  chunk_index     integer,
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
    c.chunk_index,
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
  'Semantic search over srto_corpus restricted by RLS (security invoker). '
  'Returns chunk_index for citation precision. Supports optional filters on '
  'source_type, clause, and framework (SRTO_2025 | NATIONAL_CODE_2018 | ESOS_ACT_2000).';

-- Smoke check.
do $$
declare
  zero_vec vector(1536) := array_fill(0::float8, array[1536])::vector;
begin
  perform * from public.match_srto_chunks(zero_vec, 0.5, 1, null, null, null);
  perform * from public.match_srto_chunks(zero_vec, 0.5, 1, null, null, 'SRTO_2025');
  perform * from public.match_srto_chunks(zero_vec, 0.5, 1, null, null, 'NATIONAL_CODE_2018');
end $$;
