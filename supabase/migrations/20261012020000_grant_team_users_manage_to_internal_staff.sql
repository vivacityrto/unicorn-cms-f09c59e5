-- Let internal Vivacity staff edit other users' profiles.
--
-- Carl-approved 2026-10-12: grant admin.team_users.manage at 'full' to every
-- internal staff role except Super Admin (which already holds it). The
-- permission already gates the update-user-profile Edge Function and the
-- users_staff_edit_scope_restrict / users_contact_fields_protected RLS
-- policies, so no policy change is needed -- holders simply pass the
-- "manage" branch of each.
--
-- WARNING -- this permission is the app's "Super Admin equivalent" gate, used
-- by 19 Edge Functions. Reviewed and explicitly accepted by Carl on
-- 2026-10-12; full list in
-- docs/audit-log/entries/2026-10-12-internal-staff-edit-user-profiles.md.
-- Holders can, among other things: generate a recovery login link for any user
-- (generate-recovery-link), set unicorn_role / superadmin_level on any user
-- including themselves (update-user-role, service-role write, so
-- users_no_privilege_escalation does not apply), delete users (delete-user),
-- disable/archive users, change user_type/email via update-user-profile, and
-- read personal contact details. Only internal-role *invitations* keep a
-- database backstop (enforce_invitation_role_ceiling checks
-- is_super_admin_safe()).
-- To reverse: set these five rows back to level 'none'.
--
-- INSERT ... SELECT from dd_unicorn_roles so a role that does not exist in a
-- given environment is skipped rather than failing the FK.
INSERT INTO public.role_permissions (role, feature_key, level)
SELECT r.value, 'admin.team_users.manage', 'full'::public.permission_level
FROM public.dd_unicorn_roles r
WHERE r.value IN ('Team Leader', 'Team Member', 'Integrator', 'BGT', 'CSC')
ON CONFLICT (role, feature_key) DO UPDATE
  SET level = EXCLUDED.level,
      updated_at = now();

-- update_team_member_profile was hard-wired to Super Admin callers and to
-- 'Super Admin' / 'Team Member' targets, so it rejected Integrator, BGT and CSC
-- profiles even for a Super Admin. Gate the caller on the permission instead
-- and accept any Vivacity-type target. Same signature, so CREATE OR REPLACE
-- does not create an overload. Writes the same columns as before.
CREATE OR REPLACE FUNCTION public.update_team_member_profile(
  p_target_user_id UUID,
  p_linkedin_url TEXT DEFAULT NULL,
  p_booking_url TEXT DEFAULT NULL,
  p_working_days JSONB DEFAULT NULL,
  p_working_hours JSONB DEFAULT NULL,
  p_availability_note TEXT DEFAULT NULL,
  p_public_holiday_region TEXT DEFAULT NULL,
  p_leave_from DATE DEFAULT NULL,
  p_leave_until DATE DEFAULT NULL,
  p_away_message TEXT DEFAULT NULL,
  p_cover_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_user_id UUID;
  v_target_user_type TEXT;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.check_permission(v_current_user_id, 'admin.team_users.manage', 'full') THEN
    RETURN jsonb_build_object('success', false, 'error',
           'You do not have permission to update other team members profiles');
  END IF;

  SELECT user_type INTO v_target_user_type
  FROM public.users
  WHERE user_uuid = p_target_user_id;

  IF v_target_user_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
  END IF;

  IF v_target_user_type NOT IN ('Vivacity', 'Vivacity Team') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not a team member');
  END IF;

  IF p_cover_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE user_uuid = p_cover_user_id
        AND user_type IN ('Vivacity', 'Vivacity Team')
        AND COALESCE(disabled, false) = false
        AND archived IS DISTINCT FROM true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error',
             'Invalid cover contact - must be an active team member');
    END IF;
  END IF;

  UPDATE public.users
  SET
    linkedin_url = COALESCE(p_linkedin_url, linkedin_url),
    booking_url = COALESCE(p_booking_url, booking_url),
    working_days = COALESCE(p_working_days, working_days),
    working_hours = COALESCE(p_working_hours, working_hours),
    availability_note = COALESCE(p_availability_note, availability_note),
    public_holiday_region = COALESCE(p_public_holiday_region, public_holiday_region),
    leave_from = p_leave_from,
    leave_until = p_leave_until,
    away_message = p_away_message,
    cover_user_id = p_cover_user_id,
    updated_at = NOW()
  WHERE user_uuid = p_target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_team_member_profile(uuid, text, text, jsonb, jsonb, text, text, date, date, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
