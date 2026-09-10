import type { RelationshipRole } from "@/lib/roles/relationshipRole";

export type TenantUserRowType = "active" | "invited";
export type TenantUserStatus = "active" | "disabled" | "archived" | "invited";
export type TenantUserRelationshipRole = RelationshipRole | null;

/** Typed projection returned by get_client_tenant_users. */
export interface ClientTenantUserRow {
  row_type: TenantUserRowType;
  row_key: string;
  tenant_id: number;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  relationship_role: TenantUserRelationshipRole;
  primary_contact: boolean | null;
  secondary_contact: boolean | null;
  access_scope: string | null;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  invited_at: string | null;
  invite_expires_at: string | null;
  status: TenantUserStatus;
  member_since: string | null;
  last_sent_at: string | null;
  mailgun_message_id: string | null;
  delivery_status?: "delivered" | "bounced" | "failed" | "complained" | null;
  delivery_event_at?: string | null;
  open_count?: number | null;
  first_opened_at?: string | null;
  click_count?: number | null;
  first_clicked_at?: string | null;
}

export interface UserCapacityRpcRow {
  used: number;
  limit: number | null;
  is_unlimited: boolean;
}

export interface UserCapacity {
  used: number;
  limit: number | null;
  isUnlimited: boolean;
  atLimit: boolean;
}

/** Purely derives the UI capacity model from the RPC projection. */
export function mapUserCapacity(row: UserCapacityRpcRow): UserCapacity {
  const used = row.used ?? 0;
  const limit = row.limit;
  const isUnlimited = !!row.is_unlimited;
  return {
    used,
    limit,
    isUnlimited,
    atLimit: !isUnlimited && limit !== null && used >= limit,
  };
}

export interface TenantUser {
  user_uuid: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  mobile_phone: string | null;
  job_title: string | null;
  disabled: boolean;
  last_sign_in_at: string | null;
  created_at: string;
}

export interface TenantMemberInfo {
  user_id: string;
  role: string;
  created_at: string;
  primary_contact?: boolean | null;
  secondary_contact?: boolean | null;
  relationship_role?: RelationshipRole | null;
  position_type?: string | null;
  users: TenantUser;
}

export interface PendingInvite {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface TenantContact {
  id: number;
  first_name: string;
  last_name: string | null;
  email: string;
  position_type: string | null;
  status: "active" | "archived";
  promoted_to_user_id: string | null;
  promoted_at: string | null;
  created_at: string;
}

/** Canonical role, with legacy flag fallback for unmigrated member rows. */
export function resolveTenantMemberRelationshipRole(member: Pick<
  TenantMemberInfo,
  "relationship_role" | "secondary_contact" | "primary_contact" | "role"
>): RelationshipRole {
  if (member.relationship_role) return member.relationship_role;
  if (member.secondary_contact) return "secondary_contact";
  if (member.primary_contact || member.role === "parent") return "primary_contact";
  return "user";
}
