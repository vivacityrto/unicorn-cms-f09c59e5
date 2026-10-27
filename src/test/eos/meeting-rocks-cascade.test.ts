import { describe, expect, it } from 'vitest';
import { buildMeetingRocksCascade, collectBranchIds, isRockInReviewScope } from '@/utils/meetingRocksCascade';
import type { RockWithHierarchy } from '@/types/eos';

const make = (overrides: Partial<RockWithHierarchy> & { id: string }): RockWithHierarchy => ({
  tenant_id: 6372,
  title: overrides.id,
  status: 'on_track',
  quarter_year: 2026,
  quarter_number: 4,
  due_date: '2026-12-31',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  rock_level: 'company',
  ...overrides,
});

const company = make({ id: 'c1', title: 'Company A', owner_id: 'u-b' });
const team = make({ id: 't1', title: 'Team A', rock_level: 'team', parent_rock_id: 'c1', status: 'at_risk' });
const individual = make({ id: 'i1', title: 'Indiv A', rock_level: 'individual', parent_rock_id: 't1', status: 'off_track' });
const individualDirect = make({ id: 'i2', title: 'Indiv B', rock_level: 'individual', parent_rock_id: 'c1', status: 'complete' });

describe('isRockInReviewScope', () => {
  it('treats an empty scope as all levels and matches levels otherwise', () => {
    expect(isRockInReviewScope(team, [])).toBe(true);
    expect(isRockInReviewScope(team, ['company'])).toBe(false);
    expect(isRockInReviewScope(team, ['company', 'team'])).toBe(true);
    expect(isRockInReviewScope(make({ id: 'x', rock_level: undefined }), ['company'])).toBe(false);
  });
});

describe('buildMeetingRocksCascade', () => {
  const all = [company, team, individual, individualDirect];

  it('reviews only in-scope Rocks but nests every level beneath them', () => {
    const { roots, reviewRocks } = buildMeetingRocksCascade(all, ['company'], {});

    expect(reviewRocks.map(r => r.id)).toEqual(['c1']);
    expect(roots).toHaveLength(1);
    const [root] = roots;
    expect(root.reviewable).toBe(true);
    expect(root.children.map(c => c.rock.id)).toEqual(['t1', 'i2']);
    expect(root.children.every(c => !c.reviewable)).toBe(true);
    expect(root.children[0].children.map(c => c.rock.id)).toEqual(['i1']);
  });

  it('rolls descendant statuses up through every level', () => {
    const [root] = buildMeetingRocksCascade(all, ['company'], {}).roots;

    expect(root.descendants).toMatchObject({ total: 3, at_risk: 1, off_track: 1, complete: 1, on_track: 0 });
    expect(root.children[0].descendants).toMatchObject({ total: 1, off_track: 1 });
  });

  it('nests an in-scope child under its in-scope parent instead of listing it twice', () => {
    const { roots, reviewRocks, counts } = buildMeetingRocksCascade(all, ['company', 'team'], {});

    expect(reviewRocks.map(r => r.id).sort()).toEqual(['c1', 't1']);
    expect(roots.map(r => r.rock.id)).toEqual(['c1']);
    expect(roots[0].children.find(c => c.rock.id === 't1')?.reviewable).toBe(true);
    expect(counts).toMatchObject({ total: 2, on_track: 1, at_risk: 1 });
  });

  it('promotes an in-scope Rock to a root when its parent is not under review', () => {
    const completeParent = { ...company, status: 'complete' };
    const { roots } = buildMeetingRocksCascade([completeParent, team], ['company', 'team'], {});

    expect(roots.map(r => r.rock.id)).toEqual(['t1']);
  });

  it('excludes completed Rocks from review, matching the previous list', () => {
    const { reviewRocks } = buildMeetingRocksCascade([company, { ...team, status: 'complete' }], [], {});

    expect(reviewRocks.map(r => r.id)).toEqual(['c1']);
  });

  it('sorts roots by owner name then title', () => {
    const rocks = [
      make({ id: 'a', title: 'Zed', owner_id: 'u-1' }),
      make({ id: 'b', title: 'Alpha', owner_id: 'u-2' }),
      make({ id: 'c', title: 'Beta', owner_id: 'u-1' }),
    ];
    const { roots } = buildMeetingRocksCascade(rocks, ['company'], { 'u-1': 'Ann', 'u-2': 'Bob' });

    expect(roots.map(r => r.rock.id)).toEqual(['c', 'a', 'b']);
  });

  it('orders children by level, then owner, then title', () => {
    const kids = [
      make({ id: 'k1', title: 'Indiv', rock_level: 'individual', parent_rock_id: 'c1' }),
      make({ id: 'k2', title: 'Team', rock_level: 'team', parent_rock_id: 'c1' }),
    ];
    const [root] = buildMeetingRocksCascade([company, ...kids], ['company'], {}).roots;

    expect(root.children.map(c => c.rock.id)).toEqual(['k2', 'k1']);
  });

  it('does not loop on a parent cycle in bad data', () => {
    const a = make({ id: 'a', parent_rock_id: 'b' });
    const b = make({ id: 'b', parent_rock_id: 'a' });
    const { roots } = buildMeetingRocksCascade([a, b], ['company'], {});

    // Both are each other's parent, so neither is a root, and nothing hangs.
    expect(roots).toEqual([]);
  });

  it('returns empty results for no Rocks', () => {
    const result = buildMeetingRocksCascade([], ['company'], {});

    expect(result.roots).toEqual([]);
    expect(result.reviewRocks).toEqual([]);
    expect(result.counts.total).toBe(0);
  });
});

describe('collectBranchIds', () => {
  it('lists every node that has children', () => {
    const { roots } = buildMeetingRocksCascade([company, team, individual], ['company'], {});

    expect(collectBranchIds(roots).sort()).toEqual(['c1', 't1']);
  });
});

describe('attention', () => {
  const NOW = new Date(2026, 10, 10, 9, 0, 0);
  const breakdown = (over: Partial<NonNullable<RockWithHierarchy['milestoneBreakdown']>> = {}) => ({
    total: 10, complete: 2, inProgress: 3, blocked: 0, offTrack: 0, notStarted: 5, overdue: 0, ...over,
  });
  const healthy = (id: string, extra: Partial<RockWithHierarchy> = {}) =>
    make({ id, owner_id: 'u-1', due_date: '2026-12-31', milestoneBreakdown: breakdown(), ...extra });

  it('has no reasons for a healthy Rock', async () => {
    const { attentionReasons } = await import('@/utils/meetingRocksCascade');
    expect(attentionReasons(healthy('a'), NOW)).toEqual([]);
  });

  it('names each reason a Rock needs discussing', async () => {
    const { attentionReasons } = await import('@/utils/meetingRocksCascade');

    expect(attentionReasons(healthy('a', { status: 'off_track' }), NOW)).toEqual(['off_track']);
    expect(attentionReasons(healthy('a', { status: 'at_risk' }), NOW)).toEqual(['at_risk']);
    expect(attentionReasons(healthy('a', { milestoneBreakdown: breakdown({ blocked: 1 }) }), NOW)).toEqual(['blocked_milestones']);
    expect(attentionReasons(healthy('a', { milestoneBreakdown: breakdown({ offTrack: 2 }) }), NOW)).toEqual(['blocked_milestones']);
    expect(attentionReasons(healthy('a', { milestoneBreakdown: breakdown({ overdue: 3 }) }), NOW)).toEqual(['overdue_milestones']);
    expect(attentionReasons(healthy('a', { due_date: '2026-11-09' }), NOW)).toEqual(['rock_overdue']);
    expect(attentionReasons(healthy('a', { owner_id: undefined }), NOW)).toEqual(['no_owner']);
  });

  it('lists several reasons together, and treats a Rock due today as not yet overdue', async () => {
    const { attentionReasons } = await import('@/utils/meetingRocksCascade');

    expect(attentionReasons(healthy('a', { status: 'off_track', milestoneBreakdown: breakdown({ blocked: 1, overdue: 1 }) }), NOW))
      .toEqual(['off_track', 'blocked_milestones', 'overdue_milestones']);
    expect(attentionReasons(healthy('a', { due_date: '2026-11-10' }), NOW)).toEqual([]);
  });

  it('never flags a completed Rock, however stale its numbers', async () => {
    const { attentionReasons } = await import('@/utils/meetingRocksCascade');
    expect(attentionReasons(healthy('a', { status: 'complete', due_date: '2020-01-01', owner_id: undefined, milestoneBreakdown: breakdown({ blocked: 4 }) }), NOW)).toEqual([]);
  });

  it('copes with a Rock whose milestone data has not loaded', async () => {
    const { attentionReasons } = await import('@/utils/meetingRocksCascade');
    expect(attentionReasons(make({ id: 'a', owner_id: 'u-1', due_date: '2026-12-31' }), NOW)).toEqual([]);
  });

  it('bubbles a descendant’s problem up to every ancestor without blaming them', () => {
    const parent = healthy('p', { rock_level: 'company' });
    const kid = healthy('k', { rock_level: 'team', parent_rock_id: 'p' });
    const grandkid = healthy('g', { rock_level: 'individual', parent_rock_id: 'k', status: 'off_track' });
    const { roots } = buildMeetingRocksCascade([parent, kid, grandkid], ['company'], {}, NOW);
    const [root] = roots;

    expect(root.attention).toEqual([]);
    expect(root.needsAttention).toBe(true);
    expect(root.children[0].attention).toEqual([]);
    expect(root.children[0].needsAttention).toBe(true);
    expect(root.children[0].children[0].attention).toEqual(['off_track']);
  });

  it('leaves a healthy cascade unflagged', () => {
    const { roots } = buildMeetingRocksCascade([healthy('p', { rock_level: 'company' }), healthy('k', { rock_level: 'team', parent_rock_id: 'p' })], ['company'], {}, NOW);
    expect(roots[0].needsAttention).toBe(false);
  });

  it('sums each root’s milestone breakdown once, since a root already includes what cascades from it', () => {
    const a = healthy('a', { rock_level: 'company', milestoneBreakdown: breakdown({ total: 20, complete: 4, blocked: 1, overdue: 2 }) });
    const b = healthy('b', { rock_level: 'company', milestoneBreakdown: breakdown({ total: 5, complete: 5, inProgress: 0, notStarted: 0 }) });
    const kid = healthy('k', { rock_level: 'team', parent_rock_id: 'a', milestoneBreakdown: breakdown({ total: 999 }) });
    const { milestoneTotals } = buildMeetingRocksCascade([a, b, kid], ['company'], {}, NOW);

    expect(milestoneTotals).toMatchObject({ total: 25, complete: 9, blocked: 1, overdue: 2 });
  });

  it('builds a standalone node for the flat list', async () => {
    const { standaloneNode } = await import('@/utils/meetingRocksCascade');
    const node = standaloneNode(healthy('a', { status: 'at_risk' }), ['company'], NOW);

    expect(node).toMatchObject({ reviewable: true, children: [], attention: ['at_risk'], needsAttention: true });
    expect(standaloneNode(healthy('a', { rock_level: 'team' }), ['company'], NOW).reviewable).toBe(false);
  });
});
