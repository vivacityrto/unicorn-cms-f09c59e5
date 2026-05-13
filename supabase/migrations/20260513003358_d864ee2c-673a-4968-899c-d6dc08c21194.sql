-- ============================================================================
-- Phase 1 pilot: dd_evidence_type lookup
-- Scope: public.dd_evidence_type (new), public.document_links.evidence_type
-- Legacy public.evidence_type enum is intentionally retained for rollback.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fail-fast preconditions
-- ----------------------------------------------------------------------------
DO $precheck$
DECLARE
  v_col_type text;
BEGIN
  -- 1) Target lookup table must not already exist
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dd_evidence_type'
  ) THEN
    RAISE EXCEPTION 'precondition_failed: public.dd_evidence_type already exists';
  END IF;

  -- 2) document_links.evidence_type must still be the enum type
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_col_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.document_links'::regclass
    AND a.attname  = 'evidence_type'
    AND NOT a.attisdropped;

  IF v_col_type IS NULL THEN
    RAISE EXCEPTION 'precondition_failed: public.document_links.evidence_type not found';
  END IF;

  IF v_col_type <> 'evidence_type' THEN
    RAISE EXCEPTION 'precondition_failed: public.document_links.evidence_type is %, expected enum evidence_type', v_col_type;
  END IF;

  -- 3) FK must not already exist
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.document_links'::regclass
      AND conname  = 'document_links_evidence_type_fkey'
  ) THEN
    RAISE EXCEPTION 'precondition_failed: constraint document_links_evidence_type_fkey already exists';
  END IF;
END
$precheck$;

-- ----------------------------------------------------------------------------
-- 1. Create dd_evidence_type (matches dd_accounting_system shape)
-- ----------------------------------------------------------------------------
CREATE TABLE public.dd_evidence_type (
  id          serial PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS: read for authenticated; writes restricted to service role / migrations
ALTER TABLE public.dd_evidence_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_evidence_type_read_authenticated"
  ON public.dd_evidence_type
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Seed locked values (sort_order 10/20/30/40/50/60, all active)
INSERT INTO public.dd_evidence_type (value, label, sort_order, is_active) VALUES
  ('policy',    'Policy',    10, true),
  ('procedure', 'Procedure', 20, true),
  ('record',    'Record',    30, true),
  ('form',      'Form',      40, true),
  ('template',  'Template',  50, true),
  ('other',     'Other',     60, true);

-- ----------------------------------------------------------------------------
-- 4. Convert document_links.evidence_type from enum to text
--    Nullability preserved (NULL still allowed). No DB-level default.
--    idx_document_links_evidence_type is automatically rebuilt as text btree.
-- ----------------------------------------------------------------------------
ALTER TABLE public.document_links
  ALTER COLUMN evidence_type TYPE text
  USING evidence_type::text;

-- ----------------------------------------------------------------------------
-- 5. Add FK to dd_evidence_type(value) using NOT VALID + VALIDATE pattern
-- ----------------------------------------------------------------------------
ALTER TABLE public.document_links
  ADD CONSTRAINT document_links_evidence_type_fkey
  FOREIGN KEY (evidence_type)
  REFERENCES public.dd_evidence_type(value)
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.document_links
  VALIDATE CONSTRAINT document_links_evidence_type_fkey;

-- ----------------------------------------------------------------------------
-- 6. Phase-1 rollback safety: legacy enum public.evidence_type is intentionally
--    retained. Phase-2 follow-up ticket will drop it after the bake-in window.
-- ----------------------------------------------------------------------------
COMMENT ON TYPE public.evidence_type IS
  'Legacy enum retained for Phase-1 rollback of dd_evidence_type pilot. Drop in Phase 2 after bake-in.';
