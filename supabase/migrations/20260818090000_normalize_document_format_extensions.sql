-- `documents.format` is consumed by the delivery function as an extension.
-- The Manage Documents UI previously saved presentation labels instead
-- ("Word" / "Excel"), which yielded invalid `.word` / `.excel` output names.
UPDATE public.documents
SET format = CASE lower(trim(format))
  WHEN 'word' THEN 'docx'
  WHEN 'excel' THEN 'xlsx'
  WHEN 'powerpoint' THEN 'pptx'
  ELSE format
END
WHERE lower(trim(coalesce(format, ''))) IN ('word', 'excel', 'powerpoint');
