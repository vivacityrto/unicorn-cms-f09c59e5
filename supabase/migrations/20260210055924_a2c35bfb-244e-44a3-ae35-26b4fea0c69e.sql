
CREATE TABLE public.dd_note_tags (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.dd_note_tags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (for dropdowns)
CREATE POLICY "dd_note_tags_select" ON public.dd_note_tags
  FOR SELECT TO authenticated USING (true);

-- Only Super Admins can manage
CREATE POLICY "dd_note_tags_manage" ON public.dd_note_tags
  FOR ALL TO authenticated
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Seed existing free-text tags
INSERT INTO public.dd_note_tags (code, label)
SELECT DISTINCT unnest(tags) AS code, unnest(tags) AS label
FROM public.notes
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
ON CONFLICT (code) DO NOTHING;
