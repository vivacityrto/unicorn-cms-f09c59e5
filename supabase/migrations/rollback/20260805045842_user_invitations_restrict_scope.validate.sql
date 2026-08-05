-- Dry-run validation for user_invitations_restrict_scope.
-- Run against the target DB BEFORE applying the migration.
-- Entire script is wrapped in BEGIN...ROLLBACK (no lasting changes).
--
-- Evaluates the RESTRICTIVE predicate for:
--   (a) tenant admin on their own tenant's invite  → USING true
--   (b) same admin on a different tenant's invite → USING false
--   (c) self-accept path: JWT email matches invite email → USING true
--
-- Requires two distinct tenant_ids and one user who is tenant admin on
-- only the first. Adjust the seed SELECTs if the sample CTEs return null.

BEGIN;

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_restrict_scope ON public.user_invitations;

CREATE POLICY user_invitations_restrict_scope
ON public.user_invitations AS RESTRICTIVE FOR ALL TO authenticated
USING (
  is_super_admin_safe((select auth.uid()))
  OR has_tenant_admin_safe(tenant_id, (select auth.uid()))
  OR is_vivacity_team_safe((select auth.uid()))
  OR (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), (
        select u.email from auth.users u where u.id = auth.uid()
      ))))
)
WITH CHECK (
  is_super_admin_safe((select auth.uid()))
  OR has_tenant_admin_safe(tenant_id, (select auth.uid()))
  OR is_vivacity_team_safe((select auth.uid()))
);

DO $$
DECLARE
  v_admin_id uuid;
  v_admin_email text;
  v_own_tenant uuid;
  v_other_tenant uuid;
  v_invite_email text := 'invitee-validate@example.com';
  v_using_a boolean;
  v_using_b boolean;
  v_using_c boolean;
  v_claims jsonb;
BEGIN
  -- Pick a tenant admin who is NOT superadmin / vivacity team, and a second tenant.
  SELECT tm.user_id, tm.tenant_id, u.email
  INTO v_admin_id, v_own_tenant, v_admin_email
  FROM public.tenant_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE public.has_tenant_admin_safe(tm.tenant_id, tm.user_id)
    AND NOT public.is_super_admin_safe(tm.user_id)
    AND NOT public.is_vivacity_team_safe(tm.user_id)
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'validation setup failed: no scoped tenant admin found';
  END IF;

  SELECT t.id
  INTO v_other_tenant
  FROM public.tenants t
  WHERE t.id <> v_own_tenant
  LIMIT 1;

  IF v_other_tenant IS NULL THEN
    RAISE EXCEPTION 'validation setup failed: need a second tenant for cross-tenant denial';
  END IF;

  -- Impersonate the tenant admin (JWT email = admin, not the invitee).
  v_claims := jsonb_build_object(
    'sub', v_admin_id::text,
    'email', v_admin_email,
    'role', 'authenticated'
  );
  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claim.email', v_admin_email, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- (a) own tenant
  SELECT (
    is_super_admin_safe((select auth.uid()))
    OR has_tenant_admin_safe(v_own_tenant, (select auth.uid()))
    OR is_vivacity_team_safe((select auth.uid()))
    OR (lower(v_invite_email) = lower(coalesce((auth.jwt() ->> 'email'), (
          select u.email from auth.users u where u.id = auth.uid()
        ))))
  ) INTO v_using_a;

  -- (b) other tenant
  SELECT (
    is_super_admin_safe((select auth.uid()))
    OR has_tenant_admin_safe(v_other_tenant, (select auth.uid()))
    OR is_vivacity_team_safe((select auth.uid()))
    OR (lower(v_invite_email) = lower(coalesce((auth.jwt() ->> 'email'), (
          select u.email from auth.users u where u.id = auth.uid()
        ))))
  ) INTO v_using_b;

  -- (c) self-accept: JWT email matches the invitation email (no admin rights needed)
  v_claims := jsonb_build_object(
    'sub', v_admin_id::text,
    'email', v_invite_email,
    'role', 'authenticated'
  );
  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  PERFORM set_config('request.jwt.claim.email', v_invite_email, true);

  -- Clear admin privileges for this check by evaluating only the email arm
  -- against a foreign tenant (admin rights on own tenant must not leak).
  SELECT (
    is_super_admin_safe((select auth.uid()))
    OR has_tenant_admin_safe(v_other_tenant, (select auth.uid()))
    OR is_vivacity_team_safe((select auth.uid()))
    OR (lower(v_invite_email) = lower(coalesce((auth.jwt() ->> 'email'), (
          select u.email from auth.users u where u.id = auth.uid()
        ))))
  ) INTO v_using_c;

  IF v_using_a IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL (a): tenant admin should pass USING on own tenant (got %)', v_using_a;
  END IF;
  IF v_using_b IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL (b): tenant admin should be denied on other tenant (got %)', v_using_b;
  END IF;
  IF v_using_c IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL (c): invited email self-accept USING should pass (got %)', v_using_c;
  END IF;

  RAISE NOTICE 'PASS (a) tenant admin own tenant USING = %', v_using_a;
  RAISE NOTICE 'PASS (b) tenant admin other tenant USING = %', v_using_b;
  RAISE NOTICE 'PASS (c) invited-email self-accept USING = %', v_using_c;
END $$;

ROLLBACK;
