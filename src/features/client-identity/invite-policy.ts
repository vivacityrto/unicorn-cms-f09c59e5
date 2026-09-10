/**
 * The client-portal invitation ceiling is intentionally narrower than the
 * internal Vivacity role catalogue. Keep this mapping pure so callers can
 * share the policy without importing React Query or Supabase.
 */

export type InviteAccessLevel = "academy" | "secondary" | "user";

export interface ClientInviteRoleMapping {
  unicorn_role: "Admin" | "User";
  relationship_role: "academy_user" | "secondary_contact" | "user";
}

export const CLIENT_INVITE_ROLE_MAP: Readonly<
  Record<InviteAccessLevel, ClientInviteRoleMapping>
> = {
  academy: { unicorn_role: "User", relationship_role: "academy_user" },
  secondary: { unicorn_role: "Admin", relationship_role: "secondary_contact" },
  user: { unicorn_role: "User", relationship_role: "user" },
};

export function mapClientInviteAccess(
  accessLevel: InviteAccessLevel,
): ClientInviteRoleMapping {
  return CLIENT_INVITE_ROLE_MAP[accessLevel];
}
