import { describe, expect, it } from 'vitest';
import { changeExcerpt, groupByMonth, impactCounts, impactOf, isRecent, matchesUpdate, monthLabel, plainExcerpt, type UpdateSummary } from './regulatoryView';

const now = new Date('2026-11-19T00:00:00Z');
const u = (over: Partial<UpdateSummary> = {}): UpdateSummary => ({ id: '1', regulator: 'ASQA', category: 'regulator', url: null, impact: 'high', detectedAt: '2026-11-10T00:00:00Z', excerpt: 'Updated guidance on third-party arrangements.', areaCount: 2, ...over });

describe('regulatory view helpers', () => {
  it('recognises impact levels in any case and rejects unknown ones', () => {
    expect(impactOf('High')).toBe('high');
    expect(impactOf('CRITICAL')).toBe('critical');
    expect(impactOf('severe')).toBeNull();
    expect(impactOf(null)).toBeNull();
  });

  it('turns markdown into a short plain excerpt and drops the analysis json block', () => {
    expect(plainExcerpt('## Heading\n\nSee [the guidance](https://x.test) for **details**.')).toBe('Heading See the guidance for details .');
    expect(plainExcerpt('a'.repeat(300), 10)).toBe(`${'a'.repeat(10)}…`);
    const md = '### Change summary\n\nThe rules changed.\n\n```json\n{"impact_level":"high","affected_areas":[]}\n```';
    expect(changeExcerpt(md)).toContain('The rules changed.');
    expect(changeExcerpt(md)).not.toContain('impact_level');
    expect(changeExcerpt(null)).toBeNull();
  });

  it('counts updates at each level and how many are recent', () => {
    const { counts, recent, total } = impactCounts([u(), u({ id: '2', impact: 'critical' }), u({ id: '3', impact: null, detectedAt: '2026-01-01T00:00:00Z' })], now);
    expect(counts).toEqual({ critical: 1, high: 1, moderate: 0, low: 0 });
    expect(recent).toBe(2);
    expect(total).toBe(3);
  });

  it('treats the last 30 days as recent and ignores bad or future dates', () => {
    expect(isRecent('2026-11-01T00:00:00Z', now)).toBe(true);
    expect(isRecent('2026-09-01T00:00:00Z', now)).toBe(false);
    expect(isRecent('2027-01-01T00:00:00Z', now)).toBe(false);
    expect(isRecent(null, now)).toBe(false);
    expect(isRecent('nope', now)).toBe(false);
  });

  it('groups by month keeping the order given and puts undated updates last', () => {
    const groups = groupByMonth([u({ id: 'a', detectedAt: '2026-11-10T00:00:00Z' }), u({ id: 'b', detectedAt: null }), u({ id: 'c', detectedAt: '2026-10-02T00:00:00Z' }), u({ id: 'd', detectedAt: '2026-11-01T00:00:00Z' })]);
    expect(groups.map((g) => g.label)).toEqual(['November 2026', 'October 2026', 'Undated']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'd']);
    expect(monthLabel('2026-11-10T00:00:00Z')).toBe('November 2026');
  });

  it('searches regulator, category and excerpt in any case', () => {
    expect(matchesUpdate(u(), 'asqa')).toBe(true);
    expect(matchesUpdate(u(), 'THIRD-PARTY')).toBe(true);
    expect(matchesUpdate(u(), 'invoice')).toBe(false);
    expect(matchesUpdate(u(), '  ')).toBe(true);
  });
});
