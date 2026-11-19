export type CheckinKind = 'pulse' | 'confidence' | 'blocker';
export type BlockerCategory = 'people' | 'evidence' | 'time' | 'system' | 'other';

/** What get_package_checkin_state returns: this person's own answers and what is due. */
export interface CheckinState {
  eligible: boolean;
  pulse_due?: boolean;
  next_pulse_on?: string | null;
  confidence_due?: boolean;
  history?: Array<{ kind: 'pulse' | 'confidence'; score: number; created_at: string }>;
  blockers_last_30_days?: number;
  /** This person's own blockers from the last 30 days, with where each one stands and any note the consultant left. */
  my_blockers?: MyBlocker[];
}

export type BlockerStatus = 'flagged' | 'seen' | 'resolved';

export interface MyBlocker {
  category: BlockerCategory;
  created_at: string;
  status: BlockerStatus;
  /** Written by Vivacity staff for the client, so it is shown to them. */
  staff_note: string | null;
}

export const BLOCKER_STATUS_LABEL: Record<BlockerStatus, string> = {
  flagged: 'Sent to your consultant',
  seen: 'Seen by your consultant',
  resolved: 'Resolved',
};

export const PULSE_LABELS: Record<number, string> = { 1: 'Struggling', 2: 'Not great', 3: 'OK', 4: 'Good', 5: 'Great' };
export const CONFIDENCE_LABELS: Record<number, string> = { 1: 'Not at all', 2: 'Not very', 3: 'Fairly', 4: 'Confident', 5: 'Very confident' };

export const BLOCKER_CATEGORIES: Array<{ value: BlockerCategory; label: string; hint: string }> = [
  { value: 'people', label: 'People', hint: 'Someone is unavailable or not on board' },
  { value: 'evidence', label: 'Evidence', hint: 'Waiting on or unable to find evidence' },
  { value: 'time', label: 'Time', hint: 'We do not have the time right now' },
  { value: 'system', label: 'System', hint: 'A system or tool is in the way' },
  { value: 'other', label: 'Something else', hint: 'Anything else holding you up' },
];

/** The most characters the card lets someone type; the database allows a little more. */
export const COMMENT_LIMIT = 280;

/** The scores of this person's own answers of one kind, oldest first, for a small trend. */
export function scoresOf(state: CheckinState | undefined, kind: 'pulse' | 'confidence', max = 8): number[] {
  return (state?.history ?? []).filter((h) => h.kind === kind).map((h) => h.score).slice(-max);
}

/** A plain sentence about how someone's own answers have moved. Needs at least two answers to say anything. */
export function trendSentence(scores: number[]): string | null {
  if (scores.length < 2) return null;
  const last = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const first = scores[0];
  if (last > prev) return `Your last answer was higher than the one before (${prev} to ${last}).`;
  if (last < prev) return `Your last answer was lower than the one before (${prev} to ${last}). Your consultant would like to hear what changed.`;
  return scores.every((s) => s === first) ? `You have answered ${last} out of 5 every time.` : `Your last two answers were the same (${last} out of 5).`;
}

/** Turns the database's refusal into words a person can act on. */
export function checkinErrorMessage(raw: string): string {
  if (raw.includes('RATE_LIMITED')) return raw.replace(/^.*RATE_LIMITED:\s*/s, '').replace(/^./, (c) => c.toUpperCase()) + '.';
  if (/not authorized/i.test(raw)) return 'Check-ins are only available to people with full access to this package.';
  if (/tell us a little/i.test(raw)) return 'Please tell us a little about what is blocking you.';
  if (/choose what/i.test(raw)) return 'Please choose what is blocking you.';
  return 'Your answer could not be saved. Please try again.';
}
