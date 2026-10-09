/**
 * Plain-English reading of a cancel-registrations response, and the fallback
 * for anyone Unicorn could not cancel automatically: the operator removes them
 * in Teams themselves.
 */
import type { CancelOutcome } from '@/services/teamsEventsService';

export interface NamedPerson {
  key: string;
  name: string;
}

export interface DescribedOutcome {
  key: string;
  name: string;
  status: CancelOutcome['status'];
  /** One line for the screen. */
  text: string;
  /** Why it could not be done automatically, when it could not. */
  reason: string | null;
}

const FAILURE_REASONS: Record<string, string> = {
  auth_or_consent: 'Microsoft would not let Unicorn cancel registrations.',
  organiser_access_policy: 'Microsoft would not let Unicorn change this organiser’s webinar.',
  event_unavailable: 'The event could not be found or is closed.',
  throttling: 'Microsoft is rate-limiting requests. Try again in a few minutes.',
  temporary_failure: 'Microsoft Teams had a temporary problem. Try again in a few minutes.',
  invalid_contact_data: 'This person has no valid email, so their registration could not be matched.',
  person_not_found: 'This person no longer exists in the directory.',
  list_incomplete: 'This webinar has too many registrations to check automatically.',
};

export function describeCancelOutcomes(outcomes: CancelOutcome[], people: NamedPerson[]): DescribedOutcome[] {
  const names = new Map(people.map((p) => [p.key, p.name]));
  return outcomes.map((o): DescribedOutcome => {
    const name = names.get(o.member_key) ?? o.member_key;
    if (o.status === 'cancelled') return { key: o.member_key, name, status: o.status, text: `${name}: registration cancelled`, reason: null };
    if (o.status === 'not_registered') {
      return {
        key: o.member_key,
        name,
        status: o.status,
        text: `${name}: no active registration found in Teams (nothing to cancel)`,
        reason: null,
      };
    }
    const reason = (o.error_code && FAILURE_REASONS[o.error_code]) || 'Microsoft returned an unexpected response.';
    return { key: o.member_key, name, status: o.status, text: `${name}: could not be cancelled automatically`, reason };
  });
}

/** People who still hold a registration and must be removed by hand in Teams. */
export function needsManualRemoval(described: DescribedOutcome[]): DescribedOutcome[] {
  return described.filter((d) => d.status === 'failed');
}

/** Keys that are now genuinely off the event (cancelled, or Teams holds no registration for them). */
export function settledKeys(outcomes: CancelOutcome[]): string[] {
  return outcomes.filter((o) => o.status === 'cancelled' || o.status === 'not_registered').map((o) => o.member_key);
}

export const MANUAL_REMOVAL_STEPS =
  'In Teams, open the webinar, choose Registration, then Attendee status, find the person and remove or reject their registration.';
