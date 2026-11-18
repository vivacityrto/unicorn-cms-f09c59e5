import { describe, expect, it } from 'vitest';
import type { ScorecardMetric } from '@/types/scorecard';
import { discussionAreas, needsRoom, wrapUp } from './discussion';
import { worstStatus, type Area, type Measure, type PlainStatus } from './scorecardView';
import { openIssueMetricIds, type MetricIssue } from './useScorecardDiscussion';

const measure = (id: string, status: PlainStatus): Measure => ({
  id,
  metric: { id } as ScorecardMetric,
  name: `Measure ${id}`,
  description: '',
  category: 'CST',
  ownerId: null,
  target: 10,
  unit: 'Count',
  direction: 'higher_is_better',
  source: 'manual',
  value: status === 'waiting' ? null : 5,
  status,
  history: [],
  lastEntry: null,
});
const area = (category: string, ...statuses: PlainStatus[]): Area => {
  const measures = statuses.map((s, i) => measure(`${category}-${i}`, s));
  return { category, name: category, who: null, measures, worst: worstStatus(measures) };
};

const finance = area('Finance', 'on_track', 'off_track');
const sales = area('Sales', 'on_track');
const delivery = area('Delivery', 'waiting');
const marketing = area('Marketing', 'nearly');
const all = [finance, sales, delivery, marketing];

describe('which areas the deck steps through', () => {
  it('keeps every area by default', () => {
    expect(discussionAreas(all).map((a) => a.category)).toEqual(['Finance', 'Sales', 'Delivery', 'Marketing']);
  });
  it('keeps areas with something off track, nearly there, or missing a number', () => {
    expect(discussionAreas(all, { needsRoomOnly: true }).map((a) => a.category)).toEqual(['Finance', 'Delivery', 'Marketing']);
  });
  it('is empty when everything is on track', () => {
    expect(discussionAreas([sales], { needsRoomOnly: true })).toEqual([]);
  });
  it('flags a measure that is not on track', () => {
    expect(needsRoom({ status: 'on_track' })).toBe(false);
    expect(needsRoom({ status: 'waiting' })).toBe(true);
  });
});

describe('wrap-up', () => {
  it('flags areas that need the room and had nothing raised or noted', () => {
    const summary = wrapUp(all, {}, new Set(), new Set(), new Set(['Finance']));
    expect(summary.unresolved).toEqual(['Finance', 'Delivery', 'Marketing']);
    expect(summary.visited).toBe(1);
    expect(summary.unvisited).toEqual(['Sales', 'Delivery', 'Marketing']);
  });
  it('treats a raised issue or a written note as dealt with', () => {
    const summary = wrapUp(all, { Finance: ['raised'] }, new Set(['Delivery']), new Set());
    expect(summary.unresolved).toEqual(['Marketing']);
    expect(summary.raised).toEqual(['Finance']);
    expect(summary.noted).toEqual(['Delivery']);
  });
  it('counts an issue that was already open before the meeting', () => {
    const summary = wrapUp([finance], {}, new Set(), new Set(['Finance-1']));
    expect(summary.raised).toEqual(['Finance']);
    expect(summary.unresolved).toEqual([]);
  });
  it('does not call an on-track area unresolved', () => {
    expect(wrapUp([sales], {}, new Set(), new Set()).unresolved).toEqual([]);
  });
});

describe('open issues per measure', () => {
  it('ignores closed issues', () => {
    const issues: MetricIssue[] = [
      { id: 'i1', title: 'a', status: 'Open', metricId: 'm1' },
      { id: 'i2', title: 'b', status: 'Solved', metricId: 'm2' },
    ];
    expect([...openIssueMetricIds(issues)]).toEqual(['m1']);
  });
});
