import { describe, expect, it } from 'vitest';
import type { CstClientRow } from './cstBreakdown';
import { clientDirection, clientNumber, clientWeekSeries, compareWeeks, cscWeekSeries } from './cstCompare';

const row = (tenantId: number, name: string, cscName: string, users: number, active: number, never = 0, certs = 0): CstClientRow => ({
  tenantId,
  name,
  cscId: cscName,
  cscName,
  clientUsers: users,
  activeUsers: active,
  neverSignedIn: never,
  certificates: certs,
});

const byWeek = {
  '2026-11-08': [row(1, 'Alpha', 'Ana', 10, 2, 3, 0), row(2, 'Beta', 'Ben', 10, 0, 1, 1)],
  '2026-11-15': [row(1, 'Alpha', 'Ana', 10, 5, 2, 1), row(2, 'Beta', 'Ben', 10, 1, 1, 0)],
  '2026-11-22': [row(1, 'Alpha', 'Ana', 10, 8, 0, 2)],
};

describe('compareWeeks', () => {
  it('keeps the latest weeks, oldest first', () => {
    expect(compareWeeks(byWeek, 2)).toEqual(['2026-11-15', '2026-11-22']);
  });
});

describe('cscWeekSeries', () => {
  it('works each CSC’s own number for each week and leaves a gap where it has no clients', () => {
    const series = cscWeekSeries('people_active', byWeek, compareWeeks(byWeek));
    expect(series.find((s) => s.name === 'Ana')?.series).toEqual([20, 50, 80]);
    expect(series.find((s) => s.name === 'Ben')?.series).toEqual([0, 10, null]);
  });

  it('works counts for the count measures', () => {
    expect(cscWeekSeries('never_signed_in', byWeek, compareWeeks(byWeek)).find((s) => s.name === 'Ana')?.series).toEqual([3, 2, 0]);
  });
});

describe('client numbers', () => {
  it('uses a share for activity and a count otherwise, and judges never-signed-in as lower being better', () => {
    expect(clientNumber('people_active', row(1, 'A', 'x', 8, 2))).toBe(25);
    expect(clientNumber('people_active', row(1, 'A', 'x', 0, 0))).toBeNull();
    expect(clientNumber('certificates', row(1, 'A', 'x', 8, 2, 0, 4))).toBe(4);
    expect(clientDirection('never_signed_in')).toBe('lower_is_better');
    expect(clientDirection('clients_quiet')).toBe('higher_is_better');
  });

  it('follows only the clients in the latest week', () => {
    const series = clientWeekSeries('people_active', byWeek, compareWeeks(byWeek));
    expect(series.map((s) => s.name)).toEqual(['Alpha']);
    expect(series[0].series).toEqual([20, 50, 80]);
  });
});
