/**
 * Server-side resolution of who a Teams event run will register: a Contact
 * Directory Group's CURRENT membership, plus any people added for this event
 * only, minus any Group members skipped for this event only.
 *
 * The browser only ever supplies a group id and lists of member KEYS
 * (`user:12`, `contact:5`). Membership, names, emails and active/inactive
 * state are all read here from the source tables, so a stale browser list,
 * forged ids or a tampered count can never influence who is registered.
 *
 * Source of truth: tenant_contact_groups / tenant_contact_group_members
 * (members reference tenant_users.id for users, tenant_contacts.id for
 * contacts). Names + email for users come from users via tenant_users.user_id.
 */
import type { AdminClient } from "./server.ts";
import {
  classifyEventMembers,
  fingerprintKeys,
  memberKey,
  parseMemberKey,
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

/** A person to look up: their source type + id, and a fallback tenant when the record is gone. */
interface MemberRef {
  memberType: "user" | "contact";
  memberId: number;
  fallbackTenantId: number | null;
}

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/** Looks the people up in their source tables and shapes them as ResolvedMembers. */
async function hydrateMembers(admin: AdminClient, refs: MemberRef[]): Promise<ResolvedMember[] | null> {
  const userMemberIds = refs.filter((m) => m.memberType === "user").map((m) => m.memberId);
  const contactMemberIds = refs.filter((m) => m.memberType === "contact").map((m) => m.memberId);

  const tenantUsers = new Map<number, TenantUserRow>();
  for (const ids of chunks(userMemberIds.filter(Number.isFinite), CHUNK)) {
    const { data, error } = await admin.from("tenant_users").select("id, tenant_id, user_id").in("id", ids);
    if (error) return null;
    for (const row of (data ?? []) as TenantUserRow[]) tenantUsers.set(row.id, row);
  }

  const users = new Map<string, UserRow>();
  const authIds = [...new Set([...tenantUsers.values()].map((t) => t.user_id))];
  for (const ids of chunks(authIds, CHUNK)) {
    const { data, error } = await admin
      .from("users")
      .select("user_uuid, first_name, last_name, email, disabled, archived")
      .in("user_uuid", ids);
    if (error) return null;
    for (const row of (data ?? []) as UserRow[]) users.set(row.user_uuid, row);
  }

  const contacts = new Map<number, ContactRow>();
  for (const ids of chunks(contactMemberIds.filter(Number.isFinite), CHUNK)) {
    const { data, error } = await admin
      .from("tenant_contacts")
      .select("id, tenant_id, first_name, last_name, email, status")
      .in("id", ids);
    if (error) return null;
    for (const row of (data ?? []) as ContactRow[]) contacts.set(row.id, row);
  }

  return refs.map((ref): ResolvedMember => {
    if (ref.memberType === "user") {
      const tenantUser = tenantUsers.get(ref.memberId);
      const user = tenantUser ? users.get(tenantUser.user_id) : undefined;
      return {
        memberType: "user",
        memberId: ref.memberId,
        tenantId: tenantUser?.tenant_id ?? ref.fallbackTenantId ?? 0,
        firstName: user?.first_name ?? null,
        lastName: user?.last_name ?? null,
        email: user?.email ?? null,
        sourceStatus: !user ? "missing" : user.disabled ? "disabled" : user.archived ? "archived" : "active",
      };
    }
    const contact = contacts.get(ref.memberId);
    return {
      memberType: "contact",
      memberId: ref.memberId,
      tenantId: contact?.tenant_id ?? ref.fallbackTenantId ?? 0,
      firstName: contact?.first_name ?? null,
      lastName: contact?.last_name ?? null,
      email: contact?.email ?? null,
      sourceStatus: !contact ? "missing" : contact.status === "active" ? "active" : "archived",
    };
  });
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

  const members = await hydrateMembers(
    admin,
    memberRows.map((row) => ({
      memberType: row.member_type,
      memberId: Number(row.member_id),
      fallbackTenantId: row.tenant_id,
    })),
  );
  if (!members) return { ok: false, reason: "query_failed" };
  return { ok: true, group: { id: group.id, name: group.name }, members };
}

/**
 * Looks up people added for this event only, by key. A key whose record no
 * longer exists is dropped (there is no tenant to attach a result row to) and
 * counted, so the preview can say so.
 */
export async function loadMembersByKeys(
  admin: AdminClient,
  keys: string[],
): Promise<{ ok: true; members: ResolvedMember[]; missing: number } | { ok: false }> {
  const refs: MemberRef[] = [];
  for (const key of keys) {
    const parsed = parseMemberKey(key);
    if (parsed) refs.push({ ...parsed, fallbackTenantId: null });
  }
  if (refs.length === 0) return { ok: true, members: [], missing: 0 };
  const hydrated = await hydrateMembers(admin, refs);
  if (!hydrated) return { ok: false };
  const found = hydrated.filter((m) => m.sourceStatus !== "missing");
  return { ok: true, members: found, missing: hydrated.length - found.length };
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
  /** Group members + people added for this event (what the preview token's count covers). */
  memberCount: number;
  alreadyProcessed: Set<string>;
  /** Normalised request keys, echoed so preview and register bind to the same values. */
  extraKeys: string[];
  skippedKeys: string[];
  /** Extras whose record no longer exists. */
  extrasMissing: number;
}

export type ResolveFailure = "not_found" | "query_failed";

/** Full server-side resolve used by both preview and register. */
export async function resolveGroupForEvent(
  admin: AdminClient,
  params: {
    eventType: TeamsEventType;
    eventId: string;
    groupId: number;
    extraKeys?: string[];
    skippedKeys?: string[];
  },
): Promise<{ ok: true; resolved: ResolvedGroupForEvent } | { ok: false; reason: ResolveFailure }> {
  const extraKeys = [...new Set(params.extraKeys ?? [])].sort();
  const skippedKeys = [...new Set(params.skippedKeys ?? [])].sort();

  const loaded = await loadGroupMembers(admin, params.groupId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };

  const extras = await loadMembersByKeys(admin, extraKeys);
  if (!extras.ok) return { ok: false, reason: "query_failed" };

  const classification = classifyEventMembers({
    groupMembers: loaded.members,
    extras: extras.members,
    skippedKeys,
  });
  const eligibleEmails = classification.members.flatMap((m) => (m.kind === "eligible" ? [m.normalisedEmail] : []));
  const processed = await loadAlreadyProcessed(admin, params.eventType, params.eventId, eligibleEmails);
  if (!processed.ok) return { ok: false, reason: "query_failed" };

  return {
    ok: true,
    resolved: {
      group: loaded.group,
      classification,
      // Binds the Group's membership AND the event-only changes: adding or
      // skipping anyone after the preview invalidates the confirmation.
      fingerprint: await fingerprintKeys([
        ...loaded.members.map(memberKey),
        ...extraKeys.map((k) => `+${k}`),
        ...skippedKeys.map((k) => `-${k}`),
      ]),
      memberCount: loaded.members.length + extraKeys.length,
      alreadyProcessed: processed.emails,
      extraKeys,
      skippedKeys,
      extrasMissing: extras.missing,
    },
  };
}
