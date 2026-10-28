import { describe, expect, it } from 'vitest';
import { buildRockHierarchy, canMarkComplete, computeRollupStatus, getChildStats } from '@/utils/rockRollup';
import { dbToUiStatus, getStatusConfig, getStatusOptions } from '@/utils/rockStatusUtils';
import type { EosRock } from '@/types/eos';

const rock = (id: string, status: string, over: Partial<EosRock> = {}): EosRock =>
  ({
    id,
    tenant_id: 6372,
    title: id,
    status,
    quarter_year: 2026,
    quarter_number: 4,
    due_date: '2026-12-31',
    rock_level: 'individual',
    parent_rock_id: 'company',
    ...over,
  }) as EosRock;

const company = rock('company', 'on_track', { rock_level: 'company', parent_rock_id: null });

describe('Blocked as a Rock status', () => {
  it('is its own status, distinct from at risk, off track and complete', () => {
    expect(dbToUiStatus('blocked')).toBe('blocked');
    const labels = ['at_risk', 'off_track', 'blocked', 'complete'].map(s => getStatusConfig(s).label);
    expect(new Set(labels).size).toBe(4);
    const colours = ['at_risk', 'off_track', 'blocked', 'complete'].map(s => getStatusConfig(s).bgColor);
    expect(new Set(colours).size).toBe(4);
  });

  it('is not offered as a plain status choice, because it needs a recorded reason', () => {
    expect(getStatusOptions().map(o => o.value)).not.toContain('blocked');
  });
});

describe('How a blocked Individual Rock affects the Company Rock', () => {
  it('does not turn the Company Rock off track', () => {
    const rocks = [company, rock('a', 'blocked'), rock('b', 'on_track')];
    expect(computeRollupStatus(company, rocks)).toBe('on_track');
  });

  it('does not mark the Company Rock complete', () => {
    const rocks = [company, rock('a', 'blocked'), rock('b', 'complete')];
    expect(computeRollupStatus(company, rocks)).not.toBe('complete');
    expect(canMarkComplete(company, rocks)).toBe(false);
  });

  it('reports the Company Rock as blocked only when everything left is blocked', () => {
    expect(computeRollupStatus(company, [company, rock('a', 'blocked'), rock('b', 'blocked')])).toBe('blocked');
    expect(computeRollupStatus(company, [company, rock('a', 'blocked'), rock('b', 'complete')])).toBe('blocked');
    expect(computeRollupStatus(company, [company, rock('a', 'blocked'), rock('b', 'not_started')])).toBe('on_track');
  });

  it('still shows a late or at-risk sibling, whether or not another is blocked, each as what it is', () => {
    expect(computeRollupStatus(company, [company, rock('a', 'blocked'), rock('b', 'off_track')])).toBe('off_track');
    expect(computeRollupStatus(company, [company, rock('a', 'blocked'), rock('b', 'at_risk')])).toBe('at_risk');
  });

  it('ignores archived children', () => {
    const rocks = [company, rock('a', 'blocked', { archived_at: '2026-10-01' }), rock('b', 'on_track')];
    expect(computeRollupStatus(company, rocks)).toBe('on_track');
  });

  it('counts blocked children separately from off track ones', () => {
    const rocks = [company, rock('a', 'blocked'), rock('b', 'off_track'), rock('c', 'complete')];
    expect(getChildStats(company, rocks)).toEqual({ total: 3, complete: 1, offTrack: 1, atRisk: 0, blocked: 1 });
    const built = buildRockHierarchy(rocks).find(r => r.id === 'company');
    expect(built?.childStats).toEqual({ total: 3, complete: 1, offTrack: 1, atRisk: 0, blocked: 1 });
  });

  it('keeps a Company Rock that is itself blocked blocked, whatever its children say', () => {
    const blockedCompany = rock('company', 'blocked', { rock_level: 'company', parent_rock_id: null });
    expect(computeRollupStatus(blockedCompany, [blockedCompany, rock('a', 'on_track'), rock('b', 'on_track')])).toBe('blocked');
    expect(computeRollupStatus(blockedCompany, [blockedCompany, rock('a', 'complete'), rock('b', 'complete')])).toBe('blocked');
    expect(computeRollupStatus(blockedCompany, [blockedCompany, rock('a', 'off_track')])).toBe('blocked');
    const built = buildRockHierarchy([blockedCompany, rock('a', 'complete')]).find(r => r.id === 'company');
    expect(built?.rollupStatus).toBe('blocked');
  });

  it('leaves a Rock with no children on its own status', () => {
    expect(computeRollupStatus(rock('solo', 'blocked', { parent_rock_id: null }), [])).toBe('blocked');
  });
});

describe('Roll-up keeps at risk and off track apart, and never shows a parent better than itself', () => {
  const co = (status: string) => rock('company', status, { rock_level: 'company', parent_rock_id: null });

  it('shows At Risk, not Off Track, for a Rock that is at risk with children at risk (the reported case)', () => {
    const parent = co('at_risk');
    const children = [rock('carl', 'on_track'), rock('khian', 'at_risk'), rock('rj', 'at_risk')];
    expect(computeRollupStatus(parent, [parent, ...children])).toBe('at_risk');
    expect(getChildStats(parent, [parent, ...children])).toMatchObject({ total: 3, offTrack: 0, atRisk: 2 });
  });

  it('raises an on-track parent to at risk, not off track, when a child is at risk', () => {
    const parent = co('on_track');
    expect(computeRollupStatus(parent, [parent, rock('a', 'on_track'), rock('b', 'at_risk')])).toBe('at_risk');
  });

  it('shows Off Track only when something is actually off track', () => {
    const parent = co('at_risk');
    expect(computeRollupStatus(parent, [parent, rock('a', 'at_risk'), rock('b', 'off_track')])).toBe('off_track');
    expect(computeRollupStatus(co('on_track'), [co('on_track'), rock('a', 'off_track')])).toBe('off_track');
  });

  it('never shows a parent better than its own status says', () => {
    for (const own of ['at_risk', 'off_track'] as const) {
      const parent = co(own);
      expect(computeRollupStatus(parent, [parent, rock('a', 'on_track'), rock('b', 'on_track')])).toBe(own);
    }
  });

  it('is unchanged when everything is fine, when all children are complete, and when the parent has not started', () => {
    expect(computeRollupStatus(co('on_track'), [co('on_track'), rock('a', 'on_track')])).toBe('on_track');
    expect(computeRollupStatus(co('at_risk'), [co('at_risk'), rock('a', 'complete'), rock('b', 'complete')])).toBe('complete');
    expect(computeRollupStatus(co('not_started'), [co('not_started'), rock('a', 'on_track')])).toBe('on_track');
  });

  it('still reports blocked when every remaining child is blocked, even if the parent itself is at risk', () => {
    const parent = co('at_risk');
    expect(computeRollupStatus(parent, [parent, rock('a', 'blocked'), rock('b', 'complete')])).toBe('blocked');
  });

  it('puts the same answer on the hierarchy the screens read', () => {
    const built = buildRockHierarchy([co('at_risk'), rock('a', 'at_risk'), rock('b', 'on_track')]).find(r => r.id === 'company');
    expect(built?.rollupStatus).toBe('at_risk');
  });
});
