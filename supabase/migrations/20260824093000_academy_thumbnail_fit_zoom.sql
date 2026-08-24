ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS thumbnail_fit TEXT NOT NULL DEFAULT 'cover';

ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS thumbnail_zoom NUMERIC(3,2) NOT NULL DEFAULT 1.00;

ALTER TABLE public.academy_courses
  DROP CONSTRAINT IF EXISTS academy_courses_thumbnail_fit_format;

ALTER TABLE public.academy_courses
  ADD CONSTRAINT academy_courses_thumbnail_fit_format
  CHECK (thumbnail_fit IN ('cover', 'contain'));

ALTER TABLE public.academy_courses
  DROP CONSTRAINT IF EXISTS academy_courses_thumbnail_zoom_format;

ALTER TABLE public.academy_courses
  ADD CONSTRAINT academy_courses_thumbnail_zoom_format
  CHECK (thumbnail_zoom >= 1.00 AND thumbnail_zoom <= 1.60);
