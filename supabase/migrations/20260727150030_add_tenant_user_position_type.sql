-- ============================================================
-- Add position_type lookup for tenant_users
-- ============================================================
-- Mirrors the dd_relationship_role convention (see
-- 20260518023538_af3ec70f-2687-4995-9adb-2f1f8283b636.sql):
-- a small id/value/label/sort_order/is_active lookup table,
-- authenticated-read-only RLS, consuming column is a text FK
-- to the lookup's `value` column.
--
-- No backfill/data risk: brand-new nullable column, no existing
-- tenant_users rows are touched.

CREATE TABLE public.dd_position_type (
  id          serial        NOT NULL,
  value       text          NOT NULL,
  label       text          NOT NULL,
  sort_order  integer       NOT NULL DEFAULT 0,
  is_active   boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT dd_position_type_pkey PRIMARY KEY (id),
  CONSTRAINT dd_position_type_value_key UNIQUE (value)
);

INSERT INTO public.dd_position_type (value, label, sort_order) VALUES
  ('ceo_owner',        'CEO/Owner',        1),
  ('compliance',       'Compliance',       2),
  ('administration',   'Administration',   3),
  ('finance',          'Finance',          4),
  ('manager',          'Manager',          5),
  ('trainer_assessor', 'Trainer/Assessor', 6);

ALTER TABLE public.dd_position_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_position_type: authenticated read"
  ON public.dd_position_type
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE public.tenant_users
  ADD COLUMN position_type text NULL;

ALTER TABLE public.tenant_users
  ADD CONSTRAINT fk_tenant_users_position_type
    FOREIGN KEY (position_type)
    REFERENCES public.dd_position_type(value)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK SQL — run in order if migration must be reversed
-- ─────────────────────────────────────────────────────────────
/*
ALTER TABLE public.tenant_users DROP CONSTRAINT IF EXISTS fk_tenant_users_position_type;
ALTER TABLE public.tenant_users DROP COLUMN IF EXISTS position_type;
DROP TABLE IF EXISTS public.dd_position_type;
*/
