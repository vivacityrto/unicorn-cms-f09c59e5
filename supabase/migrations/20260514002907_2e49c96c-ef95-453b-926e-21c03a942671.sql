-- Migrate task_status enum -> dd_task_status lookup table.
-- Additive; legacy public.task_status enum is intentionally retained for rollback.

CREATE TABLE public.dd_task_status (
  id          serial      PRIMARY KEY,
  value       text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dd_task_status IS
  'Lookup table for task status. Replaces legacy public.task_status enum. Seeded byte-identical to the enum values; legacy enum retained for rollback.';

CREATE INDEX dd_task_status_sort_order_idx ON public.dd_task_status (sort_order);
CREATE INDEX dd_task_status_is_active_idx  ON public.dd_task_status (is_active);

INSERT INTO public.dd_task_status (value, label, sort_order, is_active) VALUES
  ('backlog',     'Backlog',     0, true),
  ('not_started', 'Not Started', 1, true),
  ('in_progress', 'In Progress', 2, true),
  ('blocked',     'Blocked',     3, true),
  ('completed',   'Completed',   4, true),
  ('cancelled',   'Cancelled',   5, true);

ALTER TABLE public.dd_task_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_task_status_select_authenticated"
  ON public.dd_task_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "dd_task_status_insert_service_role"
  ON public.dd_task_status FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "dd_task_status_update_service_role"
  ON public.dd_task_status FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "dd_task_status_delete_service_role"
  ON public.dd_task_status FOR DELETE TO service_role USING (true);

REVOKE ALL ON public.dd_task_status FROM PUBLIC;
GRANT SELECT ON public.dd_task_status TO authenticated;
GRANT ALL    ON public.dd_task_status TO service_role;

DO $$
DECLARE
  v_total       integer;
  v_distinct    integer;
  v_nulls       integer;
  v_orders      integer[];
  v_rls_enabled boolean;
BEGIN
  SELECT count(*) INTO v_total FROM public.dd_task_status;
  ASSERT v_total = 6, format('Expected 6 rows, found %s', v_total);

  SELECT count(DISTINCT value) INTO v_distinct
  FROM public.dd_task_status
  WHERE value IN ('backlog','not_started','in_progress','blocked','completed','cancelled');
  ASSERT v_distinct = 6, format('Expected 6 distinct seeded values, found %s', v_distinct);

  SELECT count(*) INTO v_nulls
  FROM public.dd_task_status
  WHERE value IS NULL OR label IS NULL OR sort_order IS NULL OR is_active IS NULL;
  ASSERT v_nulls = 0, format('Found %s null required-field values', v_nulls);

  SELECT array_agg(sort_order ORDER BY sort_order) INTO v_orders
  FROM public.dd_task_status;
  ASSERT v_orders = ARRAY[0,1,2,3,4,5], format('Sort order mismatch: %s', v_orders);

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE oid = 'public.dd_task_status'::regclass;
  ASSERT v_rls_enabled = true, 'RLS not enabled on dd_task_status';
END
$$;