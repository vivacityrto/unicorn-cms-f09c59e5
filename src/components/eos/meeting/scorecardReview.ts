import type { MetricStatus } from '@/types/scorecard';

/**
 * How a metric is treated in the L10 Scorecard segment. The segment reads
 * numbers, it does not discuss them: everything that is not on track is
 * listed first, on-track metrics stay closed.
 */
export type ReviewBucket = 'off_track' | 'at_risk' | 'no_data' | 'stale' | 'on_track';

/** A latest entry older than this many days no longer counts as this week's number. */
export const STALE_AFTER_DAYS = 14;

export const BUCKET_ORDER: ReviewBucket[] = ['off_track', 'at_risk', 'stale', 'no_data', 'on_track'];

export const BUCKET_LABEL: Record<ReviewBucket, string> = {
  off_track: 'Off track',
  at_risk: 'At risk',
  stale: 'Out of date',
  no_data: 'No data',
  on_track: 'On track',
};

export function classifyForReview(
  status: MetricStatus | undefined,
  latestWeekEnding: string | null | undefined,
  now: Date = new Date(),
): ReviewBucket {
  if (!latestWeekEnding || status === undefined || status === 'no_data') return 'no_data';
  const ageDays = (now.getTime() - new Date(latestWeekEnding).getTime()) / 86_400_000;
  if (Number.isFinite(ageDays) && ageDays > STALE_AFTER_DAYS) return 'stale';
  if (status === 'red') return 'off_track';
  if (status === 'amber') return 'at_risk';
  return 'on_track';
}

/** Stable sort: worst bucket first, original (display) order inside a bucket. */
export function sortForReview<T extends { bucket: ReviewBucket }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => BUCKET_ORDER.indexOf(a.item.bucket) - BUCKET_ORDER.indexOf(b.item.bucket) || a.index - b.index)
    .map(({ item }) => item);
}
