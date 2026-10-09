/**
 * Planning for cancelling people's Teams registrations. Pure: the server lists
 * the event's registrations from Graph and resolves the people from the
 * database, then asks this module who matches whom.
 *
 * Matching is by normalised email — the only identifier app-only registration
 * leaves us with (Graph returns no registration id when we register someone).
 */
import { normaliseEmail } from "./emails.ts";

export interface GraphRegistration {
  id: string;
  email: string | null;
  status: string;
}

export interface PersonToCancel {
  /** Directory key, e.g. `user:12`. */
  key: string;
  email: string | null;
}

export type CancelPlanEntry =
  | { key: string; kind: "cancel"; registrationIds: string[] }
  | { key: string; kind: "not_registered" }
  | { key: string; kind: "invalid_email" };

/** A registration worth cancelling: still active in Teams (not already cancelled or rejected). */
const CANCELLABLE_STATUSES = new Set(["registered", "pendingApproval", "waitlisted"]);

export function planCancellations(people: PersonToCancel[], registrations: GraphRegistration[]): CancelPlanEntry[] {
  const byEmail = new Map<string, string[]>();
  for (const registration of registrations) {
    if (!CANCELLABLE_STATUSES.has(registration.status)) continue;
    const email = normaliseEmail(registration.email);
    if (!email) continue;
    const ids = byEmail.get(email) ?? [];
    ids.push(registration.id);
    byEmail.set(email, ids);
  }

  return people.map((person): CancelPlanEntry => {
    const email = normaliseEmail(person.email);
    if (!email) return { key: person.key, kind: "invalid_email" };
    const ids = byEmail.get(email);
    return ids && ids.length > 0
      ? { key: person.key, kind: "cancel", registrationIds: ids }
      : { key: person.key, kind: "not_registered" };
  });
}

export type CancelOutcomeStatus = "cancelled" | "not_registered" | "failed";

export interface CancelOutcome {
  member_key: string;
  status: CancelOutcomeStatus;
  /** Safe, fixed category for a failure (never raw Graph text). */
  error_code?: string;
  message?: string;
}

export function summariseCancelOutcomes(outcomes: CancelOutcome[]): Record<CancelOutcomeStatus, number> {
  const counts: Record<CancelOutcomeStatus, number> = { cancelled: 0, not_registered: 0, failed: 0 };
  for (const outcome of outcomes) counts[outcome.status]++;
  return counts;
}
