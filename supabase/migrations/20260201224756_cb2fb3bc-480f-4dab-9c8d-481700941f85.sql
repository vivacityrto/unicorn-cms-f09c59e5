-- Migrate documents from unicorn1 to public (with OVERRIDING SYSTEM VALUE)
INSERT INTO public.documents (
  id,
  title,
  description,
  format,
  stage,
  watermark,
  versiondate,
  versionnumber,
  versionlastupdated,
  isclientdoc,
  category,
  createdat,
  updated_at
)
OVERRIDING SYSTEM VALUE
SELECT 
  id::bigint,
  name,
  description,
  format,
  stage_id,
  watermark,
  versiondate::date,
  versionnumber,
  versionlastupdated,
  isclientdoc,
  category,
  dateimported,
  COALESCE(versionlastupdated, dateimported)
FROM unicorn1.documents;