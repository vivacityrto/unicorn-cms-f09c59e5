BEGIN;

CREATE TABLE public.dd_srto_source (
  id          serial      PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_srto_source ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_srto_source_read_authenticated"
  ON public.dd_srto_source
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.dd_srto_source (value, label, sort_order) VALUES
  ('outcome_standards',       'Outcome Standards',       10),
  ('compliance_requirements', 'Compliance Requirements', 20),
  ('credential_policy',       'Credential Policy',       30),
  ('practice_guide',          'Practice Guide',          40),
  ('national_code',           'National Code',           50),
  ('cricos_practice_guide',   'CRICOS Practice Guide',   60),
  ('esos_act',                'ESOS Act',                70);

DROP INDEX IF EXISTS public.srto_corpus_source_type_idx;

DROP FUNCTION IF EXISTS public.match_srto_chunks(
  extensions.vector,
  double precision,
  integer,
  public.srto_source_type,
  text,
  text
);

ALTER TABLE public.srto_corpus
  ALTER COLUMN source_type TYPE text
  USING source_type::text;

CREATE INDEX srto_corpus_source_type_idx
  ON public.srto_corpus USING btree (source_type);

ALTER TABLE public.srto_corpus
  ADD CONSTRAINT srto_corpus_source_type_fkey
  FOREIGN KEY (source_type)
  REFERENCES public.dd_srto_source (value)
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.srto_corpus
  VALIDATE CONSTRAINT srto_corpus_source_type_fkey;

CREATE OR REPLACE FUNCTION public.match_srto_chunks(
  query_embedding     extensions.vector,
  match_threshold     double precision DEFAULT 0.5,
  match_count         integer          DEFAULT 8,
  filter_source_type  text             DEFAULT NULL,
  filter_clause       text             DEFAULT NULL,
  filter_framework    text             DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  chunk_index     integer,
  source_document text,
  source_type     text,
  framework       text,
  clause          text,
  quality_area    text,
  heading         text,
  content         text,
  similarity      double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION public.match_srto_chunks(
  extensions.vector,
  double precision,
  integer,
  text,
  text,
  text
) TO PUBLIC;

COMMIT;