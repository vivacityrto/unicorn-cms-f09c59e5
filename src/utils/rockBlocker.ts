import type { Database } from '@/integrations/supabase/types';

export type BlockerRow = Database['public']['Tables']['eos_rock_blockers']['Row'];

/** What a blocker is attached to: a whole Rock or one of its milestones. */
export type BlockerSubject = 'rock' | 'milestone';

export type DependencyKind = 'none' | 'rock' | 'milestone';

export interface BlockerForm {
  reason: string;
  dependencyKind: DependencyKind;
  dependsOnId: string;
  dependencyNote: string;
  nextAction: string;
  nextActionOwnerId: string;
  reviewDate: string;
  evidenceUrl: string;
}

export type BlockerErrors = Partial<Record<'reason' | 'dependency' | 'reviewDate' | 'evidenceUrl' | 'text', string>>;

export const BLOCKER_TEXT_LIMIT = 1000;

export function emptyBlockerForm(): BlockerForm {
  return {
    reason: '',
    dependencyKind: 'none',
    dependsOnId: '',
    dependencyNote: '',
    nextAction: '',
    nextActionOwnerId: '',
    reviewDate: '',
    evidenceUrl: '',
  };
}

/** The editable form for an open blocker, so "Edit blocker" starts from what was recorded. */
export function blockerToForm(blocker: BlockerRow): BlockerForm {
  const dependencyKind: DependencyKind = blocker.depends_on_rock_id ? 'rock' : blocker.depends_on_milestone_id ? 'milestone' : 'none';
  return {
    reason: blocker.reason,
    dependencyKind,
    dependsOnId: blocker.depends_on_rock_id ?? blocker.depends_on_milestone_id ?? '',
    dependencyNote: blocker.dependency_note ?? '',
    nextAction: blocker.next_action ?? '',
    nextActionOwnerId: blocker.next_action_owner_id ?? '',
    reviewDate: blocker.review_date ?? '',
    evidenceUrl: blocker.evidence_url ?? '',
  };
}

/**
 * Check the form before it is sent. Only the reason is required: someone
 * recording a blocker in the middle of a meeting should not be stopped by
 * optional detail. The database re-checks everything that matters.
 *
 * A review date in the past is refused when it is new or changed, because a
 * checkpoint that has already passed is not a checkpoint; an unchanged past
 * date on an old blocker is left alone so it can still be edited.
 */
export function validateBlockerForm(
  form: BlockerForm,
  todayIso: string,
  options: { subjectId?: string; originalReviewDate?: string | null } = {},
): { errors: BlockerErrors; valid: boolean } {
  const errors: BlockerErrors = {};
  const reason = form.reason.trim();
  if (!reason) errors.reason = 'Say what is blocking this. It is the one thing we need to record.';
  else if (reason.length > BLOCKER_TEXT_LIMIT) errors.reason = `Keep the reason under ${BLOCKER_TEXT_LIMIT} characters.`;

  if (form.dependencyKind !== 'none' && !form.dependsOnId) {
    errors.dependency = 'Choose what this depends on, or switch the dependency off.';
  } else if (form.dependencyKind !== 'none' && options.subjectId && form.dependsOnId === options.subjectId) {
    errors.dependency = 'Something cannot depend on itself.';
  }

  if (form.reviewDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.reviewDate) || Number.isNaN(Date.parse(form.reviewDate))) {
      errors.reviewDate = 'Enter a valid review date.';
    } else if (form.reviewDate < todayIso && form.reviewDate !== (options.originalReviewDate ?? '')) {
      errors.reviewDate = 'Choose today or a later date for the next check.';
    }
  }

  const evidence = form.evidenceUrl.trim();
  if (evidence && !/^https?:\/\/\S+$/i.test(evidence)) {
    errors.evidenceUrl = 'Use a full link that starts with http:// or https://.';
  }

  if (
    form.dependencyNote.trim().length > BLOCKER_TEXT_LIMIT ||
    form.nextAction.trim().length > BLOCKER_TEXT_LIMIT
  ) {
    errors.text = `Keep each note under ${BLOCKER_TEXT_LIMIT} characters.`;
  }

  return { errors, valid: Object.keys(errors).length === 0 };
}

/** The JSON that set_blocker() takes. Empty optional fields are sent as null, never as empty strings. */
export function blockerPayload(form: BlockerForm): Record<string, string | null> {
  const clean = (value: string) => (value.trim() ? value.trim() : null);
  return {
    reason: form.reason.trim(),
    dependency_note: clean(form.dependencyNote),
    depends_on_rock_id: form.dependencyKind === 'rock' ? clean(form.dependsOnId) : null,
    depends_on_milestone_id: form.dependencyKind === 'milestone' ? clean(form.dependsOnId) : null,
    next_action: clean(form.nextAction),
    next_action_owner_id: clean(form.nextActionOwnerId),
    review_date: clean(form.reviewDate),
    evidence_url: clean(form.evidenceUrl),
  };
}

export type ReviewState = 'none' | 'upcoming' | 'today' | 'overdue';

/** Whether the blocker's next check is due, so an unattended blocker stands out. */
export function reviewState(reviewDate: string | null | undefined, todayIso: string): ReviewState {
  if (!reviewDate) return 'none';
  if (reviewDate < todayIso) return 'overdue';
  if (reviewDate === todayIso) return 'today';
  return 'upcoming';
}

export interface ResumeOption {
  value: string;
  label: string;
}

/**
 * The statuses a blocked item can resume at. Complete is deliberately missing:
 * clearing an obstacle does not finish the work, so resolving a blocker never
 * marks anything complete. Blocked is missing because resolving means it is not.
 */
export function resumeOptions(subject: BlockerSubject): ResumeOption[] {
  return subject === 'rock'
    ? [
        { value: 'not_started', label: 'Not started' },
        { value: 'on_track', label: 'On track' },
        { value: 'at_risk', label: 'At risk' },
        { value: 'off_track', label: 'Off track' },
      ]
    : [
        { value: 'not_started', label: 'Not started' },
        { value: 'in_progress', label: 'In progress' },
        { value: 'off_track', label: 'Off track' },
        { value: 'deferred', label: 'Deferred' },
      ];
}

/** The status to preselect when resolving: what it was before the block, if that is still a valid choice. */
export function defaultResumeStatus(subject: BlockerSubject, statusBefore: string | null | undefined): string {
  const options = resumeOptions(subject);
  if (statusBefore && options.some(o => o.value === statusBefore)) return statusBefore;
  return subject === 'rock' ? 'on_track' : 'in_progress';
}

/** The open blocker for a Rock or milestone, if any. At most one is open at a time. */
export function openBlocker(blockers: BlockerRow[], subject: BlockerSubject, id: string): BlockerRow | null {
  return blockers.find(b => b.resolved_at === null && (subject === 'rock' ? b.rock_id === id : b.milestone_id === id)) ?? null;
}

/** Resolved blockers for a subject, newest first, for the history list. */
export function resolvedBlockers(blockers: BlockerRow[], subject: BlockerSubject, id: string): BlockerRow[] {
  return blockers
    .filter(b => b.resolved_at !== null && (subject === 'rock' ? b.rock_id === id : b.milestone_id === id))
    .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''));
}
