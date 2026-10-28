import { describe, expect, it } from 'vitest';
import {
  blockerPayload,
  blockerToForm,
  defaultResumeStatus,
  emptyBlockerForm,
  openBlocker,
  resolvedBlockers,
  resumeOptions,
  reviewState,
  validateBlockerForm,
  type BlockerRow,
} from '@/utils/rockBlocker';

const TODAY = '2026-11-02';

const row = (over: Partial<BlockerRow> = {}): BlockerRow => ({
  id: 'b1',
  tenant_id: 6372,
  rock_id: 'rock-1',
  milestone_id: null,
  reason: 'Waiting on the vendor',
  dependency_note: null,
  depends_on_rock_id: null,
  depends_on_milestone_id: null,
  next_action: null,
  next_action_owner_id: null,
  review_date: null,
  evidence_url: null,
  status_before: 'on_track',
  recorded_by: 'u1',
  recorded_at: '2026-10-28T00:00:00Z',
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
  ...over,
});

describe('validateBlockerForm', () => {
  it('requires a reason and nothing else', () => {
    expect(validateBlockerForm(emptyBlockerForm(), TODAY).errors.reason).toMatch(/what is blocking/i);
    expect(validateBlockerForm({ ...emptyBlockerForm(), reason: '   ' }, TODAY).valid).toBe(false);
    expect(validateBlockerForm({ ...emptyBlockerForm(), reason: 'Vendor delay' }, TODAY).valid).toBe(true);
  });

  it('rejects a dependency kind with nothing chosen, and a self-dependency', () => {
    const base = { ...emptyBlockerForm(), reason: 'x', dependencyKind: 'rock' as const };
    expect(validateBlockerForm(base, TODAY).errors.dependency).toMatch(/choose/i);
    expect(validateBlockerForm({ ...base, dependsOnId: 'rock-1' }, TODAY, { subjectId: 'rock-1' }).errors.dependency).toMatch(/itself/i);
    expect(validateBlockerForm({ ...base, dependsOnId: 'rock-9' }, TODAY, { subjectId: 'rock-1' }).valid).toBe(true);
  });

  it('refuses a new review date in the past but leaves an unchanged old one alone', () => {
    const form = { ...emptyBlockerForm(), reason: 'x', reviewDate: '2026-10-01' };
    expect(validateBlockerForm(form, TODAY).errors.reviewDate).toBeDefined();
    expect(validateBlockerForm(form, TODAY, { originalReviewDate: '2026-10-01' }).valid).toBe(true);
    expect(validateBlockerForm({ ...form, reviewDate: TODAY }, TODAY).valid).toBe(true);
  });

  it('only accepts http and https links as evidence', () => {
    const form = { ...emptyBlockerForm(), reason: 'x' };
    expect(validateBlockerForm({ ...form, evidenceUrl: 'javascript:alert(1)' }, TODAY).errors.evidenceUrl).toBeDefined();
    expect(validateBlockerForm({ ...form, evidenceUrl: 'ftp://files.example.com' }, TODAY).errors.evidenceUrl).toBeDefined();
    expect(validateBlockerForm({ ...form, evidenceUrl: 'https://example.com/t/1' }, TODAY).valid).toBe(true);
  });

  it('caps the length of every note', () => {
    expect(validateBlockerForm({ ...emptyBlockerForm(), reason: 'a'.repeat(1001) }, TODAY).errors.reason).toBeDefined();
    expect(validateBlockerForm({ ...emptyBlockerForm(), reason: 'x', nextAction: 'a'.repeat(1001) }, TODAY).errors.text).toBeDefined();
  });
});

describe('blockerPayload', () => {
  it('trims, nulls empty fields and sends only the chosen dependency', () => {
    const payload = blockerPayload({
      ...emptyBlockerForm(),
      reason: '  Vendor delay  ',
      dependencyKind: 'milestone',
      dependsOnId: 'm-2',
      nextAction: '  ',
      reviewDate: '2026-11-10',
    });
    expect(payload).toEqual({
      reason: 'Vendor delay',
      dependency_note: null,
      depends_on_rock_id: null,
      depends_on_milestone_id: 'm-2',
      next_action: null,
      next_action_owner_id: null,
      review_date: '2026-11-10',
      evidence_url: null,
    });
  });

  it('drops a dependency id when the kind is none', () => {
    const payload = blockerPayload({ ...emptyBlockerForm(), reason: 'x', dependencyKind: 'none', dependsOnId: 'stale' });
    expect(payload.depends_on_rock_id).toBeNull();
    expect(payload.depends_on_milestone_id).toBeNull();
  });
});

describe('editing and clearing a blocker', () => {
  it('starts the edit form from what was recorded, and round-trips it', () => {
    const blocker = row({
      depends_on_rock_id: 'rock-9',
      dependency_note: 'Sandbox access',
      next_action: 'Chase',
      next_action_owner_id: 'u2',
      review_date: '2026-11-05',
      evidence_url: 'https://example.com/t/1',
    });
    const form = blockerToForm(blocker);
    expect(form).toMatchObject({ reason: 'Waiting on the vendor', dependencyKind: 'rock', dependsOnId: 'rock-9', nextActionOwnerId: 'u2' });
    expect(blockerPayload(form)).toMatchObject({ depends_on_rock_id: 'rock-9', review_date: '2026-11-05' });
  });

  it('clearing optional fields in the form sends nulls, which clears them on the server', () => {
    const form = { ...blockerToForm(row({ next_action: 'Chase', review_date: '2026-11-05' })), nextAction: '', reviewDate: '' };
    const payload = blockerPayload(form);
    expect(payload.next_action).toBeNull();
    expect(payload.review_date).toBeNull();
    expect(payload.reason).toBe('Waiting on the vendor');
  });
});

describe('resolving', () => {
  it('never offers complete or blocked as the status to resume at', () => {
    for (const subject of ['rock', 'milestone'] as const) {
      const values = resumeOptions(subject).map(o => o.value);
      expect(values).not.toContain('complete');
      expect(values).not.toContain('blocked');
    }
  });

  it('preselects what it was before, if still valid, else a safe default', () => {
    expect(defaultResumeStatus('rock', 'at_risk')).toBe('at_risk');
    expect(defaultResumeStatus('rock', 'complete')).toBe('on_track');
    expect(defaultResumeStatus('rock', null)).toBe('on_track');
    expect(defaultResumeStatus('milestone', 'in_progress')).toBe('in_progress');
    expect(defaultResumeStatus('milestone', 'on_track')).toBe('in_progress');
  });

  it('finds the one open blocker and keeps resolved ones as history, newest first', () => {
    const rows = [
      row({ id: 'old', resolved_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'newer', resolved_at: '2026-10-20T00:00:00Z' }),
      row({ id: 'open' }),
      row({ id: 'other', rock_id: 'rock-2' }),
      row({ id: 'm-open', rock_id: null, milestone_id: 'm-1' }),
    ];
    expect(openBlocker(rows, 'rock', 'rock-1')?.id).toBe('open');
    expect(openBlocker(rows, 'milestone', 'm-1')?.id).toBe('m-open');
    expect(openBlocker(rows, 'rock', 'rock-3')).toBeNull();
    expect(resolvedBlockers(rows, 'rock', 'rock-1').map(b => b.id)).toEqual(['newer', 'old']);
  });
});

describe('reviewState', () => {
  it('says when the next check is due', () => {
    expect(reviewState(null, TODAY)).toBe('none');
    expect(reviewState('2026-11-01', TODAY)).toBe('overdue');
    expect(reviewState(TODAY, TODAY)).toBe('today');
    expect(reviewState('2026-11-09', TODAY)).toBe('upcoming');
  });
});
