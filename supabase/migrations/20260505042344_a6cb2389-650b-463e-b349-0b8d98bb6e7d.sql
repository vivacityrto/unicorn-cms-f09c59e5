-- ============================================================================
-- M3: suggest_items client-visibility enforcement
-- Phase 3 of 3 (M1 schema, M2 backfill, M3 behaviour)
--
-- Changes:
--   1. Recreate suggest_items_select policy — non-staff require
--      is_client_visible = true in addition to has_tenant_access_safe.
--      Staff (super admin / vivacity team) bypass unchanged.
--   2. BEFORE INSERT trigger suggest_items_force_client_visibility —
--      forces is_client_visible = true for any insert by a non-staff user.
--   3. BEFORE UPDATE trigger suggest_items_visibility_guard —
--      (a) reverts non-staff attempts to mutate is_client_visible,
--      (b) auto-flips is_client_visible = true when suggest_release_status_id
--          transitions to the dd_suggest_release_status row where code='released'.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK (run as a single transaction):
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS suggest_items_force_client_visibility ON public.suggest_items;
-- DROP TRIGGER IF EXISTS suggest_items_visibility_guard       ON public.suggest_items;
-- DROP FUNCTION IF EXISTS public.suggest_items_force_client_visibility();
-- DROP FUNCTION IF EXISTS public.suggest_items_visibility_guard();
--
-- DROP POLICY IF EXISTS suggest_items_select ON public.suggest_items;
-- CREATE POLICY suggest_items_select ON public.suggest_items
--   FOR SELECT
--   USING (
--     (NOT is_deleted) AND (
--       is_super_admin_safe(auth.uid())
--       OR is_vivacity_team_safe(auth.uid())
--       OR has_tenant_access_safe((tenant_id)::bigint, auth.uid())
--     )
--   );
-- COMMIT;
--
-- ----------------------------------------------------------------------------
-- VERIFICATION (run after apply):
--   a. Staff JWT:    SELECT count(*) FROM suggest_items;            -- sees all (8)
--   b. Client JWT:   SELECT count(*) FROM suggest_items;            -- only own tenant
--                                                                    -- AND is_client_visible
--   c. Non-staff insert: lands with is_client_visible = true regardless of payload.
--   d. Non-staff update: SET is_client_visible = false → silently reverted to true.
--   e. Status flip:  UPDATE ... SET suggest_release_status_id =
--                      '74722d84-873b-4355-9551-2e3105a5b5e2'    -- 'released'
--                    → is_client_visible auto-set to true.
-- ============================================================================

-- 1. SELECT policy swap -------------------------------------------------------
DROP POLICY IF EXISTS suggest_items_select ON public.suggest_items;

CREATE POLICY suggest_items_select ON public.suggest_items
  FOR SELECT
  USING (
    (NOT is_deleted) AND (
      is_super_admin_safe(auth.uid())
      OR is_vivacity_team_safe(auth.uid())
      OR (
        has_tenant_access_safe((tenant_id)::bigint, auth.uid())
        AND is_client_visible = true
      )
    )
  );

-- 2. BEFORE INSERT: force is_client_visible = true for non-staff --------------
CREATE OR REPLACE FUNCTION public.suggest_items_force_client_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin_safe(auth.uid()) OR is_vivacity_team_safe(auth.uid())) THEN
    NEW.is_client_visible := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS suggest_items_force_client_visibility ON public.suggest_items;
CREATE TRIGGER suggest_items_force_client_visibility
  BEFORE INSERT ON public.suggest_items
  FOR EACH ROW
  EXECUTE FUNCTION public.suggest_items_force_client_visibility();

-- 3. BEFORE UPDATE: guard flag + auto-flip on release -------------------------
CREATE OR REPLACE FUNCTION public.suggest_items_visibility_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean;
  v_released_id uuid;
BEGIN
  v_is_staff := is_super_admin_safe(auth.uid()) OR is_vivacity_team_safe(auth.uid());

  -- (a) Non-staff cannot mutate is_client_visible
  IF NOT v_is_staff AND NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
    NEW.is_client_visible := OLD.is_client_visible;
  END IF;

  -- (b) Auto-flip to true on transition to release_status='released'
  IF NEW.suggest_release_status_id IS DISTINCT FROM OLD.suggest_release_status_id THEN
    SELECT id INTO v_released_id
      FROM public.dd_suggest_release_status
     WHERE code = 'released'
     LIMIT 1;

    IF v_released_id IS NOT NULL
       AND NEW.suggest_release_status_id = v_released_id THEN
      NEW.is_client_visible := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS suggest_items_visibility_guard ON public.suggest_items;
CREATE TRIGGER suggest_items_visibility_guard
  BEFORE UPDATE ON public.suggest_items
  FOR EACH ROW
  EXECUTE FUNCTION public.suggest_items_visibility_guard();