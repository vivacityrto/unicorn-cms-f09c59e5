-- Follow-up to 20260729050455_fix_broken_fk_relationships_and_tga_status.sql.
--
-- Fixing that migration's FK for stage_release_reviews.reviewer_user_id
-- exposed a second, previously-hidden relationship error on the same
-- /admin/reviews query: stage_releases.stage_id has a FK to the deprecated
-- documents_stages table (per docs/stage-registry.md, "the authoritative
-- stage catalogue lives in the stages table; documents_stages is
-- deprecated"), not to stages -- so the frontend's `stage:stages(name)`
-- embed had no relationship to resolve.
--
-- stage_releases is completely empty in prod (confirmed via a read-only
-- count before writing this migration), so repointing the FK is zero-risk:
-- nothing to violate the new constraint, nothing to backfill.

ALTER TABLE public.stage_releases
  DROP CONSTRAINT stage_releases_stage_id_fkey;

ALTER TABLE public.stage_releases
  ADD CONSTRAINT stage_releases_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;
