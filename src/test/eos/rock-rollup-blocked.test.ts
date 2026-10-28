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

  it('still turns off track for a late or at-risk sibling, whether or not another is blocked', () => {
    expect(computeRollupStatus(company, [company, rock('a', 'blocked'), rock('b', 'off_track')])).toBe('off_track');
    expect(computeRollupStatus(company, [company, rock('a', 'blocked'), rock('b', 'at_risk')])).toBe('off_track');
  });

  it('ignores archived children', () => {
    const rocks = [company, rock('a', 'blocked', { archived_at: '2026-10-01' }), rock('b', 'on_track')];
    expect(computeRollupStatus(company, rocks)).toBe('on_track');
  });

  it('counts blocked children separately from off track ones', () => {
    const rocks = [company, rock('a', 'blocked'), rock('b', 'off_track'), rock('c', 'complete')];
    expect(getChildStats(company, rocks)).toEqual({ total: 3, complete: 1, offTrack: 1, blocked: 1 });
    const built = buildRockHierarchy(rocks).find(r => r.id === 'company');
    expect(built?.childStats).toEqual({ total: 3, complete: 1, offTrack: 1, blocked: 1 });
  });

  it('leaves a Rock with no children on its own status', () => {
    expect(computeRollupStatus(rock('solo', 'blocked', { parent_rock_id: null }), [])).toBe('blocked');
  });
});
