/**
 * Canonical list of Vivacity internal staff roles.
 * ONLY edit this file when adding or retiring a role.
 * Everything else imports from here.
 */
export const VIVACITY_STAFF_ROLES = [
  'Super Admin',
  'Team Leader', // transitional — retired 2026-09-15 (zero holders), kept for backward compat like Team Member below; is_vivacity_team access checks still need to recognize it
  'Team Member', // transitional — retiring, kept for backward compat (5 disabled/archived legacy holders)
  'Integrator',
  'BGT',
  'CSC',
  // CET retired 2026-09-15 (zero holders, no backward-compat need) — see dd_unicorn_roles.is_active=false
] as const;

export type VivacityStaffRole = typeof VIVACITY_STAFF_ROLES[number];

/** Predicate — safe to use outside React (hooks, contexts, plain functions). */
export function isVivacityStaffRole(role: string | null | undefined): boolean {
  return VIVACITY_STAFF_ROLES.includes((role ?? '') as VivacityStaffRole);
}
