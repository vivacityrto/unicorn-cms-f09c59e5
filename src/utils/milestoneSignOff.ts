import type { RockMilestoneStatus } from '@/types/eos';
import type { CompanyMilestoneDelivery } from '@/utils/milestoneDelivery';

/**
 * Signing a milestone off is a person's decision that it is done. Delivery
 * progress is only a hint (see milestoneDelivery.ts), so nothing here blocks a
 * sign-off; it only describes what the person should know before confirming.
 */

/**
 * Statuses a milestone can be signed off from. Blocked is excluded on purpose:
 * resolving the blocker first keeps its history honest, and the database would
 * otherwise close the blocker silently. Deferred and complete are not live work.
 */
export const SIGN_OFF_FROM: readonly RockMilestoneStatus[] = ['not_started', 'in_progress', 'off_track'];

export function canSignOffMilestone(status: RockMilestoneStatus): boolean {
  return SIGN_OFF_FROM.includes(status);
}

/** Why the sign-off button is not offered, for statuses where a person might expect it. */
export function signOffUnavailableReason(status: RockMilestoneStatus): string | null {
  if (status === 'blocked') return 'Resolve the blocker first, then sign this milestone off.';
  return null;
}

/**
 * Things worth a second look before signing off, as plain sentences. Empty when
 * nothing stands out. Never prevents the sign-off.
 */
export function signOffCautions(input: {
  delivery: CompanyMilestoneDelivery | null;
  evidenceUrl: string | null;
  exitCriteria: string | null;
}): string[] {
  const cautions: string[] = [];
  const { delivery } = input;
  if (delivery) {
    if (delivery.state === 'uncovered') {
      cautions.push('No active Individual milestone is linked to this, so nothing records that it was delivered.');
    } else if (delivery.counts.complete < delivery.counts.active) {
      cautions.push(
        `Only ${delivery.counts.complete} of ${delivery.counts.active} delivering milestones are complete.`,
      );
    }
  }
  if (!input.evidenceUrl) cautions.push('No evidence link is recorded.');
  if (!input.exitCriteria) cautions.push('No "Done when" criteria are recorded, so there is nothing to check this against.');
  return cautions;
}
