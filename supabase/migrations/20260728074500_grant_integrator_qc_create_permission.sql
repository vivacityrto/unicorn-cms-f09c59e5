-- Grant Integrator role_permissions access to schedule QCs (eos.qc.create).
--
-- Context: EosQC.tsx's "Schedule QC" button is gated by usePermission('eos.qc.create'),
-- which reads role_permissions. The original 65-feature seed (migration 20260609052540)
-- set eos.qc.create = 'none' for Integrator, contradicting the older hardcoded
-- useRBAC.tsx ROLE_PERMISSIONS map, which already granted 'qc:schedule' to Integrator.
-- PermissionTooltip reads the legacy useRBAC source, so Integrators saw a disabled
-- button with no explanatory tooltip (the two systems disagreed).
--
-- Decision (Carl, 2026-07-28): Integrator should be able to schedule QCs, matching
-- Team Leader. This migration aligns role_permissions with that decision so both
-- permission systems agree.

DO $$
DECLARE
  v_before jsonb;
  v_id     bigint;
BEGIN
  SELECT id, to_jsonb(rp) INTO v_id, v_before
  FROM public.role_permissions rp
  WHERE role = 'Integrator' AND feature_key = 'eos.qc.create';

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'role_permissions row not found for role=Integrator, feature_key=eos.qc.create';
  END IF;

  UPDATE public.role_permissions
  SET level = 'full', updated_at = now()
  WHERE id = v_id;

  INSERT INTO public.permission_change_log (actor_uuid, entity, entity_id, action, before, after, reason)
  VALUES (
    NULL,
    'role_permissions',
    v_id::text,
    'update',
    v_before,
    to_jsonb((SELECT rp FROM public.role_permissions rp WHERE id = v_id)),
    'Grant Integrator qc:schedule access (hotfix, aligns role_permissions with the legacy useRBAC.tsx grant) - Carl, 2026-07-28'
  );
END $$;
