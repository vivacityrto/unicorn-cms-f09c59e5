ALTER TABLE public.staff_engagements
  ADD COLUMN first_name text NOT NULL DEFAULT '',
  ADD COLUMN last_name text NOT NULL DEFAULT '';

ALTER TABLE public.staff_engagements DROP COLUMN person_name;

ALTER TABLE public.staff_engagements
  ALTER COLUMN first_name DROP DEFAULT,
  ALTER COLUMN last_name DROP DEFAULT;