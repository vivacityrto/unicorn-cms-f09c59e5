import { describe, expect, it } from 'vitest';
import { classifyForReview, sortForReview, STALE_AFTER_DAYS, type ReviewBucket } from './scorecardReview';

const now = new Date('2026-11-17T00:00:00Z');

describe('classifyForReview', () => {
  it('treats a metric with no entry as no data', () => {
    expect(classifyForReview(undefined, undefined, now)).toBe('no_data');
    expect(classifyForReview('no_data', '2026-11-15', now)).toBe('no_data');
    expect(classifyForReview('red', null, now)).toBe('no_data');
  });
  it('maps current statuses to buckets', () => {
    expect(classifyForReview('red', '2026-11-15', now)).toBe('off_track');
    expect(classifyForReview('amber', '2026-11-15', now)).toBe('at_risk');
    expect(classifyForReview('green', '2026-11-15', now)).toBe('on_track');
  });
  it('flags an old entry as out of date instead of trusting its status', () => {
    expect(classifyForReview('green', '2026-10-25', now)).toBe('stale');
    expect(classifyForReview('red', '2026-09-01', now)).toBe('stale');
  });
  it('treats an entry exactly at the threshold as current', () => {
    const edge = new Date(now.getTime() - STALE_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(classifyForReview('green', edge, now)).toBe('on_track');
  });
});

describe('sortForReview', () => {
  it('puts the worst first and keeps display order within a bucket', () => {
    const items: { id: string; bucket: ReviewBucket }[] = [
      { id: 'a', bucket: 'on_track' },
      { id: 'b', bucket: 'at_risk' },
      { id: 'c', bucket: 'off_track' },
      { id: 'd', bucket: 'no_data' },
      { id: 'e', bucket: 'off_track' },
      { id: 'f', bucket: 'stale' },
    ];
    expect(sortForReview(items).map((i) => i.id)).toEqual(['c', 'e', 'b', 'f', 'd', 'a']);
  });
  it('does not mutate its input', () => {
    const items = [{ bucket: 'on_track' as ReviewBucket }, { bucket: 'off_track' as ReviewBucket }];
    const copy = [...items];
    sortForReview(items);
    expect(items).toEqual(copy);
  });
});
