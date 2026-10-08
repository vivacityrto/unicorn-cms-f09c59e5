/**
 * Server-side resolution of a Contact Directory Group's CURRENT membership.
 *
 * The browser only ever supplies a group id. Membership, names, emails and
 * active/inactive state are all read here from the source tables, so a stale
 * browser list, forged member ids or a tampered count can never influence
 * who is registered.
 *
 * Source of truth: tenant_contact_groups / tenant_contact_group_members
 * (members reference tenant_users.id for users, tenant_contacts.id for
 * contacts). Names + email for users come from users via tenant_users.user_id.
 */
import type { AdminClient } from "./server.ts";
import {
  classifyMembers,
  membershipFingerprint,
  type MembershipClassification,
  type ResolvedMember,
} from "./membership.ts";
import type { TeamsEventType } from "./preview-token.ts";

const PAGE = 1000;
const CHUNK = 100;

interface GroupRow {
  id: number;
  name: string;
}
interface MemberRow {
  member_type: "user" | "contact";
  member_id: string;
  tenant_id: number;
}
interface TenantUserRow {
  id: number;
  tenant_id: number;
  user_id: string;
}
interface UserRow {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  disabled: boolean | null;
  archived: boolean | null;
}
interface ContactRow {
  id: number;
  tenant_id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string;
}

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export type GroupLoadResult =
  | { ok: true; group: { id: number; name: string }; members: ResolvedMember[] }
  | { ok: false; reason: "not_found" | "query_failed" };

export async function loadGroupMembers(admin: AdminClient, groupId: number): Promise<GroupLoadResult> {
  const { data: groupData, error: groupError } = await admin
    .from("tenant_contact_groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (groupError) return { ok: false, reason: "query_failed" };
  const group = groupData as GroupRow | null;
  if (!group) return { ok: false, reason: "not_found" };

  const memberRows: MemberRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("tenant_contact_group_members")
      .select("member_type, member_id, tenant_id")
      .eq("group_id", groupId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, reason: "query_failed" };
    const page = (data ?? []) as MemberRow[];
    memberRows.push(...page);
    if (page.length < PAGE) break;
  }

  const userMemberIds = memberRows.filter((m) => m.member_type === "user").map((m) => Number(m.member_id));
  const contactMemberIds = memberRows.filter((m) => m.member_type === "contact").map((m) => Number(m.member_id));

  const tenantUsers = new Map<number, TenantUserRow>();
  for (const ids of chunks(userMemberIds.filter(Number.isFinite), CHUNK)) {
    const { data, error } = await admin.from("tenant_users").select("id, tenant_id, user_id").in("id", ids);
    if (error) return { ok: false, reason: "query_failed" };
    for (const row of (data ?? []) as TenantUserRow[]) tenantUsers.set(row.id, row);
  }

  const users = new Map<string, UserRow>();
  const authIds = [...new Set([...tenantUsers.values()].map((t) => t.user_id))];
  for (const ids of chunks(authIds, CHUNK)) {
    const { data, error } = await admin
      .from("users")
      .select("user_uuid, first_name, last_name, email, disabled, archived")
      .in("user_uuid", ids);
    if (error) return { ok: false, reason: "query_failed" };
    for (const row of (data ?? []) as UserRow[]) users.set(row.user_uuid, row);
  }

  const contacts = new Map<number, ContactRow>();
  for (const ids of chunks(contactMemberIds.filter(Number.isFinite), CHUNK)) {
    const { data, error } = await admin
      .from("tenant_contacts")
      .select("id, tenant_id, first_name, last_name, email, status")
      .in("id", ids);
    if (error) return { ok: false, reason: "query_failed" };
    for (const row of (data ?? []) as ContactRow[]) contacts.set(row.id, row);
  }

  const members: ResolvedMember[] = memberRows.map((row) => {
    const memberId = Number(row.member_id);
    if (row.member_type === "user") {
      const tenantUser = tenantUsers.get(memberId);
      const user = tenantUser ? users.get(tenantUser.user_id) : undefined;
      return {
        memberType: "user",
        memberId,
        tenantId: tenantUser?.tenant_id ?? row.tenant_id,
        firstName: user?.first_name ?? null,
        lastName: user?.last_name ?? null,
        email: user?.email ?? null,
        sourceStatus: !user ? "missing" : user.disabled ? "disabled" : user.archived ? "archived" : "active",
      };
    }
    const contact = contacts.get(memberId);
    return {
      memberType: "contact",
      memberId,
      tenantId: contact?.tenant_id ?? row.tenant_id,
      firstName: contact?.first_name ?? null,
      lastName: contact?.last_name ?? null,
      email: contact?.email ?? null,
      sourceStatus: !contact ? "missing" : contact.status === "active" ? "active" : "archived",
    };
  });

  return { ok: true, group: { id: group.id, name: group.name }, members };
}

/** Emails (normalised) that already hold a local success row for this event. */
export async function loadAlreadyProcessed(
  admin: AdminClient,
  eventType: TeamsEventType,
  eventId: string,
  normalisedEmails: string[],
): Promise<{ ok: true; emails: Set<string> } | { ok: false }> {
  const found = new Set<string>();
  for (const emails of chunks(normalisedEmails, 200)) {
    const { data, error } = await admin
      .from("teams_event_registration_items")
      .select("normalised_email")
      .eq("event_type", eventType)
      .eq("graph_event_id", eventId)
      .in("result_status", ["registered", "invited"])
      .in("normalised_email", emails);
    if (error) return { ok: false };
    for (const row of (data ?? []) as Array<{ normalised_email: string | null }>) {
      if (row.normalised_email) found.add(row.normalised_email);
    }
  }
  return { ok: true, emails: found };
}

export interface ResolvedGroupForEvent {
  group: { id: number; name: string };
  classification: MembershipClassification;
  fingerprint: string;
  memberCount: number;
  alreadyProcessed: Set<string>;
}

export type ResolveFailure = "not_found" | "query_failed";

/** Full server-side resolve used by both preview and register. */
export async function resolveGroupForEvent(
  admin: AdminClient,
  params: { eventType: TeamsEventType; eventId: string; groupId: number },
): Promise<{ ok: true; resolved: ResolvedGroupForEvent } | { ok: false; reason: ResolveFailure }> {
  const loaded = await loadGroupMembers(admin, params.groupId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };

  const classification = classifyMembers(loaded.members);
  const eligibleEmails = classification.members.flatMap((m) => (m.kind === "eligible" ? [m.normalisedEmail] : []));
  const processed = await loadAlreadyProcessed(admin, params.eventType, params.eventId, eligibleEmails);
  if (!processed.ok) return { ok: false, reason: "query_failed" };

  return {
    ok: true,
    resolved: {
      group: loaded.group,
      classification,
      fingerprint: await membershipFingerprint(loaded.members),
      memberCount: loaded.members.length,
      alreadyProcessed: processed.emails,
    },
  };
}
