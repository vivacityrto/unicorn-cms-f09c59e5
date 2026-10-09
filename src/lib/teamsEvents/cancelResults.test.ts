import { describe, expect, it } from 'vitest';
import type { CancelOutcome } from '@/services/teamsEventsService';
import { describeCancelOutcomes, needsManualRemoval, settledKeys } from './cancelResults';

const people = [
  { key: 'user:1', name: 'Amanda Hardy' },
  { key: 'contact:2', name: 'Ben Carter' },
  { key: 'user:3', name: 'Cara Doyle' },
];

const outcomes: CancelOutcome[] = [
  { member_key: 'user:1', status: 'cancelled' },
  { member_key: 'contact:2', status: 'not_registered' },
  { member_key: 'user:3', status: 'failed', error_code: 'auth_or_consent', message: 'raw server text' },
];

describe('cancel result helpers', () => {
  it('describes each outcome in plain English with the person’s name', () => {
    const described = describeCancelOutcomes(outcomes, people);
    expect(described[0]).toMatchObject({ name: 'Amanda Hardy', text: 'Amanda Hardy: registration cancelled', reason: null });
    expect(described[1].text).toContain('no active registration found in Teams');
    expect(described[2].text).toContain('could not be cancelled automatically');
    expect(described[2].reason).toBe('Microsoft would not let Unicorn cancel registrations.');
  });

  it('never shows raw server text, and falls back for an unknown failure code', () => {
    const described = describeCancelOutcomes(
      [{ member_key: 'user:3', status: 'failed', error_code: 'something_new', message: 'Bearer abc.def.ghi' }],
      people,
    );
    expect(described[0].reason).toBe('Microsoft returned an unexpected response.');
    expect(JSON.stringify(described)).not.toContain('Bearer');
  });

  it('falls back to the key when a person is not in the list', () => {
    expect(describeCancelOutcomes([{ member_key: 'user:99', status: 'cancelled' }], people)[0].name).toBe('user:99');
  });

  it('lists only failures for manual removal in Teams', () => {
    const manual = needsManualRemoval(describeCancelOutcomes(outcomes, people));
    expect(manual.map((m) => m.name)).toEqual(['Cara Doyle']);
  });

  it('reports which people are now genuinely off the event', () => {
    expect(settledKeys(outcomes)).toEqual(['user:1', 'contact:2']);
  });
});
