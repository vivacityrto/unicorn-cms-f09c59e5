-- Reset the stages table (confirmed safe - no FK constraints)
TRUNCATE TABLE public.stages;

-- Copy all stage records from unicorn1 using legacy IDs
INSERT INTO public.stages (id, name, shortname, description, videourl, dateimported)
OVERRIDING SYSTEM VALUE
SELECT id, name, shortname, description, videourl, dateimported
FROM unicorn1.stages;

-- Reset the sequence to prevent ID conflicts
SELECT setval(
  pg_get_serial_sequence('public.stages', 'id'), 
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.stages), 
  false
);