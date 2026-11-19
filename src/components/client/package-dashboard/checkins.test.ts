import { describe, expect, it } from 'vitest';
import { checkinErrorMessage, scoresOf, trendSentence, type CheckinState } from './checkins';

describe('check-in helpers', () => {
  it('takes only one kind of answer, oldest first, and no more than asked for', () => {
    const state: CheckinState = {
      eligible: true,
      history: [
        { kind: 'pulse', score: 2, created_at: '2026-09-01T00:00:00Z' },
        { kind: 'confidence', score: 5, created_at: '2026-09-02T00:00:00Z' },
        { kind: 'pulse', score: 3, created_at: '2026-09-15T00:00:00Z' },
        { kind: 'pulse', score: 4, created_at: '2026-09-29T00:00:00Z' },
      ],
    };
    expect(scoresOf(state, 'pulse')).toEqual([2, 3, 4]);
    expect(scoresOf(state, 'confidence')).toEqual([5]);
    expect(scoresOf(state, 'pulse', 2)).toEqual([3, 4]);
    expect(scoresOf(undefined, 'pulse')).toEqual([]);
  });

  it('says how answers have moved, and nothing for fewer than two', () => {
    expect(trendSentence([])).toBeNull();
    expect(trendSentence([4])).toBeNull();
    expect(trendSentence([3, 4])).toBe('Your last answer was higher than the one before (3 to 4).');
    expect(trendSentence([4, 2])).toMatch(/lower than the one before \(4 to 2\)\. Your consultant would like to hear what changed\.$/);
    expect(trendSentence([4, 4, 4])).toBe('You have answered 4 out of 5 every time.');
    expect(trendSentence([3, 4, 4])).toBe('Your last two answers were the same (4 out of 5).');
  });

  it('turns the database refusals into words a person can act on', () => {
    expect(checkinErrorMessage('RATE_LIMITED: you have already answered the pulse recently')).toBe('You have already answered the pulse recently.');
    expect(checkinErrorMessage('Not authorized for this package')).toMatch(/full access/);
    expect(checkinErrorMessage('Tell us a little about what is blocking you')).toBe('Please tell us a little about what is blocking you.');
    expect(checkinErrorMessage('Choose what is blocking you')).toBe('Please choose what is blocking you.');
    expect(checkinErrorMessage('duplicate key value violates something internal')).toBe('Your answer could not be saved. Please try again.');
  });
});
