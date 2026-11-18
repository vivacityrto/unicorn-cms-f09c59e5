import { describe, expect, it } from 'vitest';
import { calculateStatus } from '@/types/scorecard';
import { aimLadder, directionSentence, standingSentence } from './aimExplainer';

describe('aimLadder', () => {
  it('lower is better: on track at or under, nearly up to 10% over, then off track', () => {
    const l = aimLadder({ unit: 'Count', target: 30, direction: 'lower_is_better' });
    expect(l.onTrack).toBe('30 or fewer');
    expect(l.nearly).toBe('more than 30, up to 33');
    expect(l.offTrack).toBe('more than 33');
  });

  it('higher is better, as a percentage', () => {
    const l = aimLadder({ unit: '%', target: 50, direction: 'higher_is_better' });
    expect(l.onTrack).toBe('50% or more');
    expect(l.nearly).toBe('45%, up to just under 50%');
    expect(l.offTrack).toBe('under 45%');
  });

  it('exact aim', () => {
    const l = aimLadder({ unit: 'Count', target: 10, direction: 'equals_target' });
    expect(l.onTrack).toBe('exactly 10');
    expect(l.nearly).toBe('within 1 of 10');
  });

  it('says there is no in-between when the aim is zero', () => {
    expect(aimLadder({ unit: 'Count', target: 0, direction: 'lower_is_better' }).nearly).toMatch(/No in-between/);
  });

  it('agrees with the real status rule at every edge', () => {
    // 33 is the last "nearly" for an aim of 30 or fewer; 34 is off track.
    expect(calculateStatus(30, 30, 'lower_is_better')).toBe('green');
    expect(calculateStatus(33, 30, 'lower_is_better')).toBe('amber');
    expect(calculateStatus(34, 30, 'lower_is_better')).toBe('red');
    expect(calculateStatus(45, 50, 'higher_is_better')).toBe('amber');
    expect(calculateStatus(44.9, 50, 'higher_is_better')).toBe('red');
  });
});

describe('sentences', () => {
  it('names the direction', () => {
    expect(directionSentence({ direction: 'lower_is_better' })).toMatch(/Lower is better/);
    expect(directionSentence({ direction: 'higher_is_better' })).toMatch(/Higher is better/);
    expect(directionSentence({ direction: 'equals_target' })).toMatch(/exact aim/);
  });

  it('says where the measure stands, or that it has no number', () => {
    expect(standingSentence({ unit: 'Count', target: 30, direction: 'lower_is_better', value: 36, status: 'off_track' })).toBe('This week is 36. That is 6 over the limit, so it is off track.');
    expect(standingSentence({ unit: 'Count', target: 30, direction: 'lower_is_better', value: null, status: 'waiting' })).toMatch(/no number/);
  });
});
