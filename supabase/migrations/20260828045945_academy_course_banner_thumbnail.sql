-- Separate, optional image + framing for the course-detail page's 16:9 hero
-- banner, independent of the square course-card thumbnail (thumbnail_url/
-- thumbnail_position/thumbnail_fit/thumbnail_zoom). A single image tuned for
-- a square crop often doesn't frame well at 16:9 (or vice versa), so staff
-- can upload a distinct banner image; when banner_thumbnail_url is null, the
-- client-facing hero falls back to the card's thumbnail_url but with its own
-- centred/cover/1x framing default (not the card's position/zoom), since a
-- crop tuned for a square doesn't necessarily suit a wide banner.
ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS banner_thumbnail_url TEXT;

ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS banner_thumbnail_position TEXT NOT NULL DEFAULT '50% 50%';

ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS banner_thumbnail_fit TEXT NOT NULL DEFAULT 'cover';

ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS banner_thumbnail_zoom NUMERIC(3,2) NOT NULL DEFAULT 1.00;

ALTER TABLE public.academy_courses
  DROP CONSTRAINT IF EXISTS academy_courses_banner_thumbnail_position_format;

ALTER TABLE public.academy_courses
  ADD CONSTRAINT academy_courses_banner_thumbnail_position_format
  CHECK (banner_thumbnail_position ~ '^(0|[1-9][0-9]?|100)% (0|[1-9][0-9]?|100)%$');

ALTER TABLE public.academy_courses
  DROP CONSTRAINT IF EXISTS academy_courses_banner_thumbnail_fit_format;

ALTER TABLE public.academy_courses
  ADD CONSTRAINT academy_courses_banner_thumbnail_fit_format
  CHECK (banner_thumbnail_fit IN ('cover', 'contain'));

ALTER TABLE public.academy_courses
  DROP CONSTRAINT IF EXISTS academy_courses_banner_thumbnail_zoom_format;

ALTER TABLE public.academy_courses
  ADD CONSTRAINT academy_courses_banner_thumbnail_zoom_format
  CHECK (banner_thumbnail_zoom >= 1.00 AND banner_thumbnail_zoom <= 1.60);
