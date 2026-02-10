
-- Drop the old bigint version that's causing ambiguity
DROP FUNCTION IF EXISTS public.persist_tga_scope_items(bigint, text, jsonb);
