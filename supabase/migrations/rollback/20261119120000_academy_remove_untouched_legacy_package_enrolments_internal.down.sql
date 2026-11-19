-- Rollback for 20261119120000: put the removed legacy package enrolments back with their original ids.
-- A learner who has since enrolled in the same course keeps their newer row (the unique key skips the old one).
-- The backup table is kept; drop it by hand once you are sure it is no longer needed.
insert into public.academy_enrollments
overriding system value
select * from public._bak_academy_enrollments_legacy_auto_20261119
on conflict do nothing;
