-- Persist the focal point used when Academy cards crop Vimeo thumbnails.
ALTER TABLE public.academy_courses
  ADD COLUMN IF NOT EXISTS thumbnail_position TEXT NOT NULL DEFAULT '50% 50%';

ALTER TABLE public.academy_courses
  DROP CONSTRAINT IF EXISTS academy_courses_thumbnail_position_format;

ALTER TABLE public.academy_courses
  ADD CONSTRAINT academy_courses_thumbnail_position_format
  CHECK (thumbnail_position ~ '^(0|[1-9][0-9]?|100)% (0|[1-9][0-9]?|100)%$');
