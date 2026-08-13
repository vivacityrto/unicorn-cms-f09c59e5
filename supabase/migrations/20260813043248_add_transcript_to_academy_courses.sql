-- Persist AI Assist Vimeo transcripts on academy_courses so "Generate quiz
-- with AI" survives reload/revisit. Nullable: existing rows stay NULL until
-- a Super Admin runs AI Assist and clicks Save Changes.
alter table public.academy_courses
  add column if not exists transcript text;
