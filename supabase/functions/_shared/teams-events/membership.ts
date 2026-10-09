/**
 * Classification of a Contact Directory Group's current membership for a
 * Teams event run. Pure: the server resolves the rows from the database
 * (never from browser-supplied ids or counts) and passes them in here.
 *
 * Rules (brief sections 5.1 and 6):
 *   - only active members with a valid email and both names are eligible
 *   - duplicate normalised emails are processed once and the rest reported
 *   - a Unicorn user wins over a directory contact sharing the same email
 */
import { normaliseEmail } from "./emails.ts";

export type MemberType = "user" | "contact";

/** State of the underlying source record, resolved server-side. */
export type MemberSourceStatus = "active" | "disabled" | "archived" | "missing";

/** Where a person came from for this event: the Group, or added for this event only. */
export type MemberInclusion = "group" | "extra";

export interface ResolvedMember {
  memberType: MemberType;
  /** tenant_users.id (user) or tenant_contacts.id (contact). */
  memberId: number;
  tenantId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  sourceStatus: MemberSourceStatus;
  /** Defaults to "group". */
  inclusion?: MemberInclusion;
}

export type ExclusionReason =
  | "inactive"
  | "missing_record"
  | "invalid_email"
  | "missing_name"
  | "skipped_for_event";

export type ClassifiedMember =
  | { kind: "eligible"; member: ResolvedMember; normalisedEmail: string }
  | {
    kind: "excluded";
    member: ResolvedMember;
    normalisedEmail: string | null;
    reason: ExclusionReason;
  }
  | {
    kind: "duplicate";
    member: ResolvedMember;
    normalisedEmail: string;
    /** Key (`user:12`) of the member that was kept for this email. */
    duplicateOf: string;
  };

export interface MembershipClassification {
  members: ClassifiedMember[];
  counts: {
    total: number;
    eligible: number;
    excluded: number;
    duplicate: number;
  };
}

export function memberKey(member: Pick<ResolvedMember, "memberType" | "memberId">): string {
  return `${member.memberType}:${member.memberId}`;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function exclusionFor(member: ResolvedMember): { reason: ExclusionReason; email: string | null } | null {
  const email = normaliseEmail(member.email);
  if (member.sourceStatus === "missing") return { reason: "missing_record", email };
  if (member.sourceStatus !== "active") return { reason: "inactive", email };
  if (!email) return { reason: "invalid_email", email: null };
  // Graph requires both names for an app-only registration; we never invent one.
  if (!trimmedOrNull(member.firstName) || !trimmedOrNull(member.lastName)) {
    return { reason: "missing_name", email };
  }
  return null;
}

/** Deterministic order: users before contacts, then ascending id. */
function compareMembers(a: ResolvedMember, b: ResolvedMember): number {
  const rank = (m: ResolvedMember) => (m.memberType === "user" ? 0 : 1);
  return rank(a) - rank(b) || a.memberId - b.memberId;
}

export function classifyMembers(input: ResolvedMember[]): MembershipClassification {
  const sorted = [...input].sort(compareMembers);
  const keptByEmail = new Map<string, string>();
  const members: ClassifiedMember[] = [];

  for (const member of sorted) {
    const exclusion = exclusionFor(member);
    if (exclusion) {
      members.push({
        kind: "excluded",
        member,
        normalisedEmail: exclusion.email,
        reason: exclusion.reason,
      });
      continue;
    }

    const normalisedEmail = normaliseEmail(member.email) as string;
    const keptKey = keptByEmail.get(normalisedEmail);
    if (keptKey) {
      members.push({ kind: "duplicate", member, normalisedEmail, duplicateOf: keptKey });
      continue;
    }

    keptByEmail.set(normalisedEmail, memberKey(member));
    members.push({ kind: "eligible", member, normalisedEmail });
  }

  const count = (kind: ClassifiedMember["kind"]) => members.filter((m) => m.kind === kind).length;
  return {
    members,
    counts: {
      total: members.length,
      eligible: count("eligible"),
      excluded: count("excluded"),
      duplicate: count("duplicate"),
    },
  };
}

/**
 * Stable fingerprint of the group's membership (SHA-256 of the sorted
 * member keys). Bound into the preview token so a membership change between
 * preview and confirmation is detected, not silently processed.
 */
export async function membershipFingerprint(
  members: Pick<ResolvedMember, "memberType" | "memberId">[],
): Promise<string> {
  return fingerprintKeys(members.map(memberKey));
}

/** SHA-256 over the sorted, de-duplicated keys. */
export async function fingerprintKeys(keys: string[]): Promise<string> {
  const bytes = new TextEncoder().encode([...new Set(keys)].sort().join("|"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Event-only changes ────────────────────────────────────────────────────

const MEMBER_KEY = /^(user|contact):([1-9]\d{0,14})$/;

export function parseMemberKey(key: string): { memberType: MemberType; memberId: number } | null {
  const match = MEMBER_KEY.exec(key);
  if (!match) return null;
  return { memberType: match[1] as MemberType, memberId: Number(match[2]) };
}

export const MAX_EVENT_EXTRAS = 200;
export const MAX_EVENT_SKIPS = 5000;

/**
 * Validates a browser-supplied list of member keys (`user:12`, `contact:5`).
 * Anything malformed, non-array or over the cap rejects the whole list — it is
 * never partly trusted. Returns sorted, de-duplicated keys.
 */
export function parseMemberKeys(value: unknown, max: number): { ok: true; keys: string[] } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, keys: [] };
  if (!Array.isArray(value) || value.length > max) return { ok: false };
  const keys = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !MEMBER_KEY.test(item)) return { ok: false };
    keys.add(item);
  }
  return { ok: true, keys: [...keys].sort() };
}

export interface EventMemberInput {
  /** Current Group members, resolved on the server. */
  groupMembers: ResolvedMember[];
  /** People added for this event only, resolved on the server (records that no longer exist already dropped). */
  extras: ResolvedMember[];
  /** Keys of Group members left out of THIS event only. */
  skippedKeys: string[];
}

/**
 * Applies the event-only changes before classifying:
 *   - skipped Group members are reported as excluded ("skipped_for_event") and never sent to Graph
 *   - extras already in the Group are ignored (they are included anyway)
 *   - extras go through exactly the same eligibility rules as Group members
 * A skip can only ever apply to a Group member; skipping an extra just means not adding it.
 */
export function classifyEventMembers(input: EventMemberInput): MembershipClassification {
  const skip = new Set(input.skippedKeys);
  const groupKeys = new Set(input.groupMembers.map(memberKey));

  const kept: ResolvedMember[] = [];
  const skipped: ResolvedMember[] = [];
  for (const member of input.groupMembers) {
    (skip.has(memberKey(member)) ? skipped : kept).push({ ...member, inclusion: "group" });
  }

  const seenExtras = new Set<string>();
  for (const extra of input.extras) {
    const key = memberKey(extra);
    if (groupKeys.has(key) || seenExtras.has(key)) continue;
    seenExtras.add(key);
    kept.push({ ...extra, inclusion: "extra" });
  }

  const classification = classifyMembers(kept);
  for (const member of skipped) {
    classification.members.push({
      kind: "excluded",
      member,
      normalisedEmail: normaliseEmail(member.email),
      reason: "skipped_for_event",
    });
  }
  classification.counts.total = classification.members.length;
  classification.counts.excluded = classification.members.filter((m) => m.kind === "excluded").length;
  return classification;
}
