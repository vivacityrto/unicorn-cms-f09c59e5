/**
 * Relationship role helper — single source of truth for the new
 * `tenant_users.relationship_role` enum and its mappings.
 *
 * See plan: .lovable/plan.md (Relationship Role UI — Phase 3).
 */

export type RelationshipRole =
  | 'primary_contact'
  | 'secondary_contact'
  | 'user'
  | 'academy_user';

export const RELATIONSHIP_ROLE_OPTIONS: {
  value: RelationshipRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'primary_contact',
    label: 'Primary Contact',
    description:
      'Main admin for this organisation. Exactly one per organisation.',
  },
  {
    value: 'secondary_contact',
    label: 'Secondary Contact',
    description: 'Backup admin. Up to one per organisation.',
  },
  {
    value: 'user',
    label: 'User',
    description: 'Standard team member. Full access to their organisation.',
  },
  {
    value: 'academy_user',
    label: 'Academy User',
    description:
      'Vivacity Academy access only. No access to documents, consultation, or other modules.',
  },
];

export function relationshipRoleLabel(
  rr: RelationshipRole | null | undefined,
): string {
  if (!rr) return '—';
  return RELATIONSHIP_ROLE_OPTIONS.find((o) => o.value === rr)?.label ?? rr;
}

/**
 * Derive the legacy `users.unicorn_role` from a relationship_role.
 * Server will override based on relationship_role anyway, but the API
 * contract still requires a non-null unicorn_role in the payload.
 */
export function unicornRoleFromRelationship(
  rr: RelationshipRole,
): 'Admin' | 'User' {
  return rr === 'primary_contact' || rr === 'secondary_contact'
    ? 'Admin'
    : 'User';
}

/**
 * Derive the legacy `users.user_type` from a relationship_role
 * (matches the mapping `accept_invitation_v2` uses).
 */
export function userTypeFromRelationship(
  rr: RelationshipRole,
): 'Client Parent' | 'Client Child' {
  return rr === 'primary_contact' || rr === 'secondary_contact'
    ? 'Client Parent'
    : 'Client Child';
}

/**
 * Legacy `tenant_users` patch for backward compat.
 *
 * IMPORTANT: We intentionally DO NOT write `secondary_contact` here.
 * The new `relationship_role` column is the source of truth for
 * secondary status. The legacy `secondary_contact` boolean is left
 * untouched (and will be dropped post-launch).
 */
export function legacyTenantUserPatch(rr: RelationshipRole): {
  role: 'parent' | 'child';
  primary_contact: boolean;
} {
  if (rr === 'primary_contact')
    return { role: 'parent', primary_contact: true };
  if (rr === 'secondary_contact')
    return { role: 'parent', primary_contact: false };
  return { role: 'child', primary_contact: false };
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  return EMAIL_REGEX.test(s.trim());
}

/**
 * Postgres unique-constraint violation (SQLSTATE 23505).
 * Used to detect concurrent role changes that hit
 * `uniq_tenant_one_primary_contact` or `uniq_tenant_one_secondary_contact`.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === '23505';
}

/**
 * Fallback mapping for displaying a role label when only the legacy
 * `unicorn_role` is available (e.g. legacy `user_invitations` rows
 * with a null `relationship_role`).
 */
export function relationshipLabelFromUnicornRole(
  unicornRole: string | null | undefined,
): string {
  if (!unicornRole) return '—';
  if (unicornRole === 'Admin') return 'Primary Contact';
  if (unicornRole === 'User') return 'User';
  // Vivacity-team roles (Super Admin, Team Leader, Team Member) pass through.
  return unicornRole;
}
