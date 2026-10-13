-- =====================================================================
-- When a client leaves "active", deactivate its people (and restore them
-- when it comes back)
--
-- Requested by Dave via Carl: if a client's status moves away from active,
-- its users should be disabled and its contacts archived, so the status of
-- the people reflects the status of the client.
--
-- Design
--   * Trigger on tenants (AFTER UPDATE OF status). Active -> anything else
--     deactivates the client's people. Anything else -> active restores ONLY
--     the people this cascade deactivated (people disabled for any other
--     reason stay as they are). Nothing is deleted.
--   * USERS are disabled (users.disabled = true, the same flag the app already
--     uses to block login). Skipped, always:
--       - Vivacity internal staff and Super Admins;
--       - anyone who also belongs to ANOTHER client that is still active
--         (34 people belong to more than one client). Membership is
--         tenant_users plus users.tenant_id, because the two disagree for
--         some people.
--   * CONTACTS (no login) are archived (tenant_contacts.status = 'archived').
--     A contact that was promoted to a user is never restored.
--   * Every person touched is written to tenant_status_cascade_actions, which
--     is how a later reactivation knows exactly who to restore. One summary
--     row per run goes to client_audit_log (counts only).
--   * The work lives in two functions so a one-off clean-up of clients that
--     are already non-active can reuse it deliberately (with a dry run first),
--     rather than being a hidden side effect of this migration. THIS MIGRATION
--     CHANGES NO EXISTING PERSON: it only installs the trigger and functions.
--
-- Legacy trigger fixed in the same migration
--   update_tenant_status() (fired when a user's disabled/archived/tenant_id
--   changes) rewrote tenants.status to 'active' or 'inactive' for ANY client,
--   so disabling people at a cancelled client would have flipped it to
--   'inactive', and enabling one person at a cancelled client would have
--   flipped it to 'active'. It now only moves a client between 'active' and
--   'inactive' and leaves every other status (cancelled, on_hold, ...) alone.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_cascade_tenant_status_to_people ON public.tenants;
--   DROP FUNCTION IF EXISTS public.trg_cascade_tenant_status_to_people();
--   DROP FUNCTION IF EXISTS public.cascade_deactivate_tenant_people(bigint, text, boolean);
--   DROP FUNCTION IF EXISTS public.cascade_restore_tenant_people(bigint);
--   DROP TABLE IF EXISTS public.tenant_status_cascade_actions;
--   and re-create update_tenant_status() without the status guard (see
--   the previous definition in the audit entry).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 1 — who the cascade changed (the restore ledger)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.tenant_status_cascade_actions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           bigint      NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_uuid           uuid        NULL,
  tenant_contact_id   bigint      NULL,
  new_tenant_status   text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  restored_at         timestamptz NULL,
  CONSTRAINT tenant_status_cascade_one_subject_check
    CHECK (num_nonnulls(user_uuid, tenant_contact_id) = 1)
);

CREATE INDEX idx_tenant_status_cascade_open_users
  ON public.tenant_status_cascade_actions (user_uuid) WHERE restored_at IS NULL AND user_uuid IS NOT NULL;
CREATE INDEX idx_tenant_status_cascade_open_contacts
  ON public.tenant_status_cascade_actions (tenant_id, tenant_contact_id) WHERE restored_at IS NULL AND tenant_contact_id IS NOT NULL;

ALTER TABLE public.tenant_status_cascade_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_status_cascade_actions_select" ON public.tenant_status_cascade_actions
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin_safe((SELECT auth.uid()))
    OR public.is_vivacity_staff((SELECT auth.uid()))
  );

REVOKE ALL ON public.tenant_status_cascade_actions FROM anon, authenticated;
GRANT SELECT ON public.tenant_status_cascade_actions TO authenticated;
GRANT ALL ON public.tenant_status_cascade_actions TO service_role;

-- ─────────────────────────────────────────────────────────────
-- SECTION 2 — deactivate (also used, with p_dry_run, for a reviewed clean-up)
-- ─────────────────────────────────────────────────────────────

CREATE FUNCTION public.cascade_deactivate_tenant_people(
  p_tenant_id  bigint,
  p_new_status text,
  p_dry_run    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_user_ids    uuid[];
  v_contact_ids bigint[];
BEGIN
  SELECT COALESCE(array_agg(u.user_uuid), '{}')
    INTO v_user_ids
    FROM public.users u
   WHERE NOT u.disabled
     AND NOT u.is_vivacity_internal
     AND NOT public.is_super_admin_safe(u.user_uuid)
     AND (
       u.tenant_id = p_tenant_id
       OR EXISTS (
         SELECT 1 FROM public.tenant_users tu
          WHERE tu.user_id = u.user_uuid AND tu.tenant_id = p_tenant_id
       )
     )
     -- Still belongs to another client that is active: leave them alone.
     AND NOT EXISTS (
       SELECT 1
         FROM public.tenants t2
        WHERE t2.id <> p_tenant_id
          AND t2.status = 'active'
          AND (
            t2.id = u.tenant_id
            OR EXISTS (
              SELECT 1 FROM public.tenant_users tu2
               WHERE tu2.user_id = u.user_uuid AND tu2.tenant_id = t2.id
            )
          )
     );

  SELECT COALESCE(array_agg(tc.id), '{}')
    INTO v_contact_ids
    FROM public.tenant_contacts tc
   WHERE tc.tenant_id = p_tenant_id
     AND tc.status = 'active';

  IF NOT p_dry_run THEN
    IF cardinality(v_user_ids) > 0 THEN
      INSERT INTO public.tenant_status_cascade_actions (tenant_id, user_uuid, new_tenant_status)
      SELECT p_tenant_id, x, p_new_status FROM unnest(v_user_ids) AS x;

      UPDATE public.users
         SET disabled = true, updated_at = now()
       WHERE user_uuid = ANY (v_user_ids);
    END IF;

    IF cardinality(v_contact_ids) > 0 THEN
      INSERT INTO public.tenant_status_cascade_actions (tenant_id, tenant_contact_id, new_tenant_status)
      SELECT p_tenant_id, x, p_new_status FROM unnest(v_contact_ids) AS x;

      UPDATE public.tenant_contacts
         SET status = 'archived', updated_at = now()
       WHERE id = ANY (v_contact_ids);
    END IF;

    IF cardinality(v_user_ids) > 0 OR cardinality(v_contact_ids) > 0 THEN
      INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
      VALUES (
        p_tenant_id, auth.uid(), 'tenant_status_cascade_deactivated', 'tenant', p_tenant_id::text,
        jsonb_build_object(
          'new_tenant_status', p_new_status,
          'users_disabled', cardinality(v_user_ids),
          'contacts_archived', cardinality(v_contact_ids)
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'dry_run', p_dry_run,
    'users', to_jsonb(v_user_ids),
    'contacts', to_jsonb(v_contact_ids)
  );
END;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 3 — restore (only what the cascade deactivated)
-- ─────────────────────────────────────────────────────────────

CREATE FUNCTION public.cascade_restore_tenant_people(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_user_ids    uuid[];
  v_contact_ids bigint[];
BEGIN
  -- Anyone the cascade disabled (for ANY client) who belongs to this client.
  -- Not limited to this client's own ledger rows: a person skipped when this
  -- client left active (because another client was still active) may have been
  -- disabled later by that other client, and must come back with this one.
  SELECT COALESCE(array_agg(DISTINCT l.user_uuid), '{}')
    INTO v_user_ids
    FROM public.tenant_status_cascade_actions l
    JOIN public.users u ON u.user_uuid = l.user_uuid
   WHERE l.restored_at IS NULL
     AND l.user_uuid IS NOT NULL
     AND (
       u.tenant_id = p_tenant_id
       OR EXISTS (
         SELECT 1 FROM public.tenant_users tu
          WHERE tu.user_id = u.user_uuid AND tu.tenant_id = p_tenant_id
       )
     );

  SELECT COALESCE(array_agg(DISTINCT l.tenant_contact_id), '{}')
    INTO v_contact_ids
    FROM public.tenant_status_cascade_actions l
   WHERE l.restored_at IS NULL
     AND l.tenant_id = p_tenant_id
     AND l.tenant_contact_id IS NOT NULL;

  IF cardinality(v_user_ids) > 0 THEN
    UPDATE public.users
       SET disabled = false, updated_at = now()
     WHERE user_uuid = ANY (v_user_ids)
       AND disabled;

    UPDATE public.tenant_status_cascade_actions
       SET restored_at = now()
     WHERE restored_at IS NULL AND user_uuid = ANY (v_user_ids);
  END IF;

  IF cardinality(v_contact_ids) > 0 THEN
    -- A contact promoted to a user was archived by the promotion, not by us.
    UPDATE public.tenant_contacts
       SET status = 'active', updated_at = now()
     WHERE id = ANY (v_contact_ids)
       AND tenant_id = p_tenant_id
       AND status = 'archived'
       AND promoted_to_user_id IS NULL;

    UPDATE public.tenant_status_cascade_actions
       SET restored_at = now()
     WHERE restored_at IS NULL AND tenant_id = p_tenant_id AND tenant_contact_id = ANY (v_contact_ids);
  END IF;

  IF cardinality(v_user_ids) > 0 OR cardinality(v_contact_ids) > 0 THEN
    INSERT INTO public.client_audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (
      p_tenant_id, auth.uid(), 'tenant_status_cascade_restored', 'tenant', p_tenant_id::text,
      jsonb_build_object('users_restored', cardinality(v_user_ids), 'contacts_restored', cardinality(v_contact_ids))
    );
  END IF;

  RETURN jsonb_build_object('tenant_id', p_tenant_id, 'users', to_jsonb(v_user_ids), 'contacts', to_jsonb(v_contact_ids));
END;
$fn$;

-- Only the trigger (and a deliberate, reviewed clean-up as service role) may call these.
REVOKE ALL ON FUNCTION public.cascade_deactivate_tenant_people(bigint, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cascade_restore_tenant_people(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cascade_deactivate_tenant_people(bigint, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cascade_restore_tenant_people(bigint) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- SECTION 4 — the trigger on tenants
-- ─────────────────────────────────────────────────────────────

CREATE FUNCTION public.trg_cascade_tenant_status_to_people()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active' THEN
    PERFORM public.cascade_deactivate_tenant_people(NEW.id, NEW.status, false);
  ELSIF OLD.status IS DISTINCT FROM 'active' AND NEW.status = 'active' AND pg_trigger_depth() = 1 THEN
    -- Depth 1 = the status was changed directly. When it was flipped by the
    -- legacy "any enabled user makes the client active" trigger (depth > 1),
    -- re-enabling one person must not silently restore everyone else.
    PERFORM public.cascade_restore_tenant_people(NEW.id);
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_cascade_tenant_status_to_people
  AFTER UPDATE OF status ON public.tenants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_cascade_tenant_status_to_people();

REVOKE ALL ON FUNCTION public.trg_cascade_tenant_status_to_people() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- SECTION 5 — legacy trigger: stop overwriting deliberate statuses
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_tenant_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update the tenant's status based on all its users. Only ever moves a
  -- client between 'active' and 'inactive': a deliberately set status such as
  -- cancelled, on_hold or terminated is never overwritten.
  UPDATE public.tenants t
  SET status = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.tenant_id = t.id
      AND u.disabled = false
      AND u.archived = false
    ) THEN 'active'
    ELSE 'inactive'
  END
  WHERE t.id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND t.status IN ('active', 'inactive');

  RETURN COALESCE(NEW, OLD);
END;
$function$;
