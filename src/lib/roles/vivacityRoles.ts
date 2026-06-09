/**
 * Canonical list of Vivacity internal staff roles.
 * ONLY edit this file when adding or retiring a role.
 * Everything else imports from here.
 */
export const VIVACITY_STAFF_ROLES = [
  'Super Admin',
  'Team Leader',
  'Team Member', // transitional — retiring, kept for backward compat
  'Integrator',
  'BGT',
  'CSC',
  'CET',
] as const;

export type VivacityStaffRole = typeof VIVACITY_STAFF_ROLES[number];

/** Predicate — safe to use outside React (hooks, contexts, plain functions). */
export function isVivacityStaffRole(role: string | null | undefined): boolean {
  return VIVACITY_STAFF_ROLES.includes((role ?? '') as VivacityStaffRole);
}
