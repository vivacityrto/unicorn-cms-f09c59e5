/**
 * Transforms a raw Supabase action_link (one-time /auth/v1/verify?token=...)
 * into a scanner-safe /activate landing-page URL that defers token consumption
 * until the user clicks through.
 *
 * Shared by:
 *  - src/components/profile/AdminActions.tsx (Copy Recovery Link)
 *  - src/components/client/TenantUsersTab.tsx (Copy Recovery Link)
 *
 * Keep these in sync — the two buttons must produce identical link formats.
 */
export function buildActivateUrlFromActionLink(actionLink: string, email: string): string {
  const u = new URL(actionLink); // throws on invalid URL — callers handle
  const token = u.searchParams.get('token');
  const type = u.searchParams.get('type') || 'recovery';
  if (!token) throw new Error('Recovery link missing token');
  return `${window.location.origin}/activate?token=${token}&type=${encodeURIComponent(type)}&email=${encodeURIComponent(email)}`;
}
