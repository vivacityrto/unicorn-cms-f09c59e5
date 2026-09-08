-- Phase 2.6 stabilization Packet P4-D — two independent, confirmed-live
-- production bugs, each root-caused and written up in
-- docs/kb/reference/l10-real-bugs-found-2026-09-04.md, fixed together
-- after Carl's explicit authorization (2026-09-08) since both are
-- single-statement, low-risk, additive schema changes.
--
-- L10 item #3 — "Import Stage" has never worked.
-- public.stages.id has no default/sequence at the DB level; every insert
-- that doesn't supply an explicit id (useStageExportImport.tsx's Import
-- Stage flow) has always failed with a NOT NULL violation. Fix: add an
-- owned sequence and DEFAULT nextval(...), matching the existing
-- tenants.id convention (nextval('tenants_id_seq'::regclass)) already used
-- elsewhere in this schema — not IDENTITY, to stay consistent. The
-- sequence starts above the current max(id) so it never collides with
-- rows inserted by the existing MAX(id)+1 workaround code paths (e.g.
-- usePackageBuilder.tsx's createStage, useStageDuplication.tsx) — those
-- continue to work unchanged since supplying an explicit id always
-- overrides a column default.
--
-- L10 item #4 — "Archive Package" has always failed.
-- public.packages_status_check only allows 'active'/'inactive'.
-- usePackageBuilder.tsx's archivePackage() sets status = 'archived',
-- which has always thrown a 23514 CHECK violation on every Archive click.
-- The Package Builder list UI already has separate filter/count-badge/
-- bucketing logic for an "Archived" state (PackageBuilderOverview.tsx,
-- PackageBuilderEditor.tsx) — this was clearly an intended third status,
-- not something to quietly collapse into 'inactive'. Fix: widen the CHECK
-- constraint to also allow 'archived'.
--
-- migration-target-project: yxkgdalkbrriasiyyrwk

DO $$
BEGIN
  -- L10 #3: stages.id sequence/default.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stages' AND column_name = 'id'
  ) THEN
    IF (
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stages' AND column_name = 'id'
    ) IS NULL THEN
      CREATE SEQUENCE IF NOT EXISTS public.stages_id_seq OWNED BY public.stages.id;
      PERFORM setval('public.stages_id_seq', COALESCE((SELECT max(id) FROM public.stages), 0) + 1, false);
      ALTER TABLE public.stages ALTER COLUMN id SET DEFAULT nextval('public.stages_id_seq'::regclass);
      RAISE NOTICE 'P4-D #3: added stages_id_seq default to public.stages.id';
    ELSE
      RAISE NOTICE 'P4-D #3: public.stages.id already has a default in this environment, skipping';
    END IF;
  END IF;

  IF (
    SELECT column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stages' AND column_name = 'id'
  ) IS NULL THEN
    RAISE EXCEPTION 'P4-D #3 postflight failed: public.stages.id still has no default';
  END IF;

  -- L10 #4: packages_status_check widen.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.packages'::regclass AND conname = 'packages_status_check'
  ) THEN
    ALTER TABLE public.packages DROP CONSTRAINT packages_status_check;
  END IF;

  ALTER TABLE public.packages
    ADD CONSTRAINT packages_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

  RAISE NOTICE 'P4-D #4: packages_status_check now allows active/inactive/archived';
END
$$;
