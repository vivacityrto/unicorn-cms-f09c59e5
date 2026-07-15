/**
 * Historical admin authorization helpers used by admin-reset-user.
 *
 * Kept for keeper-repo history. Active password-reset / recovery flows use
 * check_permission(..., 'admin.team_users.manage', 'full') instead.
 */

export type AdminAuthProfile = {
  unicorn_role?: string | null;
  user_type?: string | null;
  disabled?: boolean | null;
  archived?: boolean | null;
};

/**
 * True when the caller may administer passwords via the legacy admin-reset-user path:
 * Super Admin on Vivacity / Vivacity Team, and not disabled/archived.
 */
export function canAdministerPasswords(profile: AdminAuthProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.disabled || profile.archived) return false;
  if (profile.unicorn_role !== "Super Admin") return false;
  return profile.user_type === "Vivacity" || profile.user_type === "Vivacity Team";
}
