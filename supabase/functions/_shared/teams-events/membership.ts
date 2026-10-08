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

export interface ResolvedMember {
  memberType: MemberType;
  /** tenant_users.id (user) or tenant_contacts.id (contact). */
  memberId: number;
  tenantId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  sourceStatus: MemberSourceStatus;
}

export type ExclusionReason =
  | "inactive"
  | "missing_record"
  | "invalid_email"
  | "missing_name";

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
  const keys = members.map(memberKey).sort();
  const bytes = new TextEncoder().encode(keys.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
