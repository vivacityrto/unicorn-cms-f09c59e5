import { describe, expect, it } from 'vitest';
import type { CstReport, CstReportCsc, CstReportRto, CstReportTotals } from './cstReport';
import { clientSeries, cscSeriesByName, historyAnchors, seriesDef, shortPeriodLabel, stepAnchor, totalSeries } from './cstHistory';

const rto = (id: number, name: string, users: number, active: number, never = 0, certs = 0): CstReportRto => ({
  tenant_id: id,
  tenant_name: name,
  client_users: users,
  active_users: active,
  never_signed_in: never,
  certificates: certs,
  prior_certificates: 0,
});

const totals = (rtos: CstReportRto[]): CstReportTotals => ({
  live_rtos: rtos.length,
  client_users: rtos.reduce((n, r) => n + r.client_users, 0),
  active_users: rtos.reduce((n, r) => n + r.active_users, 0),
  rtos_active: rtos.filter((r) => r.active_users > 0).length,
  rtos_with_users: rtos.filter((r) => r.client_users > 0).length,
  never_signed_in: rtos.reduce((n, r) => n + r.never_signed_in, 0),
  certificates: rtos.reduce((n, r) => n + r.certificates, 0),
  prior_certificates: 0,
});

const report = (groups: Record<string, CstReportRto[]>): CstReport => {
  const csc: CstReportCsc[] = Object.entries(groups).map(([name, rtos]) => ({ csc_user_id: name, csc_name: name, rtos, ...totals(rtos) }));
  return { period: 'week', start: '2026-11-15T13:00:00Z', end: '2026-11-22T13:00:00Z', prior_start: '', prior_end: '', generated_at: '', totals: totals(csc.flatMap((c) => c.rtos)), csc };
};

describe('stepAnchor and historyAnchors', () => {
  it('steps back a week at a time', () => {
    expect(stepAnchor('2026-11-19', 'week', 2)).toBe('2026-11-05');
  });
  it('steps back whole calendar months and years', () => {
    expect(stepAnchor('2026-11-19', 'month', 1)).toBe('2026-10-01');
    expect(stepAnchor('2026-11-19', 'year', 1)).toBe('2025-01-01');
  });
  it('steps back 28 days at a time for the rolling window', () => {
    expect(stepAnchor('2026-11-19', 'days28', 1)).toBe('2026-10-22');
  });
  it('lists the dates oldest first and ends with the anchor', () => {
    const dates = historyAnchors('week', '2026-11-19', 3);
    expect(dates).toEqual(['2026-11-05', '2026-11-12', '2026-11-19']);
  });
});

describe('series from reports', () => {
  const r1 = report({ Ana: [rto(1, 'Alpha', 10, 2, 3, 1), rto(2, 'Beta', 10, 0, 5, 0)], Ben: [rto(3, 'Gamma', 20, 10, 0, 2)] });
  const r2 = report({ Ana: [rto(1, 'Alpha', 10, 5, 1, 0), rto(2, 'Beta', 10, 1, 4, 3)], Ben: [rto(3, 'Gamma', 20, 4, 0, 0)] });

  it('works the portal rate for each period and leaves a missing period as a gap', () => {
    expect(totalSeries(seriesDef('portal'), [r1, undefined, r2])).toEqual([30, null, 25]);
  });

  it('treats a period with no Live Clients as a gap, not as zero', () => {
    expect(totalSeries(seriesDef('certificates'), [report({}), r2])).toEqual([null, 3]);
  });

  it('keeps only the latest period for a number counted as of today, so it never looks falsely steady', () => {
    expect(seriesDef('never').direction).toBe('lower_is_better');
    expect(seriesDef('never').asOfToday).toBe(true);
    expect(totalSeries(seriesDef('never'), [r1, r2])).toEqual([null, 5]);
    expect(cscSeriesByName(seriesDef('never'), [r1, r2]).find((r) => r.name === 'Ana')?.series).toEqual([null, 5]);
    expect(clientSeries(seriesDef('never'), [r1, r2]).find((r) => r.name === 'Beta')?.series).toEqual([null, 4]);
  });

  it('follows each CSC across the periods', () => {
    const rows = cscSeriesByName(seriesDef('portal'), [r1, r2]);
    expect(rows.find((r) => r.name === 'Ana')?.series).toEqual([10, 30]);
    expect(rows.find((r) => r.name === 'Ben')?.series).toEqual([50, 20]);
  });

  it('gives a CSC that was missing from an earlier period a gap there', () => {
    const only = report({ Ana: [rto(1, 'Alpha', 10, 5)] });
    expect(cscSeriesByName(seriesDef('portal'), [only, r2]).find((r) => r.name === 'Ben')?.series).toEqual([null, 20]);
  });

  it('follows each client, named from the latest period', () => {
    const rows = clientSeries(seriesDef('portal'), [r1, r2]);
    expect(rows.find((r) => r.name === 'Beta')).toMatchObject({ cscName: 'Ana', series: [0, 10] });
  });

  it('judges a client as active or not for the clients measure, and skips one with no users', () => {
    const noUsers = report({ Ana: [rto(1, 'Alpha', 0, 0), rto(2, 'Beta', 10, 1)] });
    const rows = clientSeries(seriesDef('clients'), [r1, noUsers]);
    expect(rows.find((r) => r.name === 'Alpha')?.series).toEqual([100, null]);
    expect(rows.find((r) => r.name === 'Beta')?.series).toEqual([0, 100]);
  });
});

describe('shortPeriodLabel', () => {
  it('labels a week by the day it ends, a month by its name and a year by its number', () => {
    const r = { start: '2026-11-15T13:00:00Z', end: '2026-11-22T13:00:00Z' };
    expect(shortPeriodLabel('week', r)).toBe('22 Nov');
    expect(shortPeriodLabel('month', { start: '2026-10-31T13:00:00Z', end: '2026-11-30T13:00:00Z' })).toBe('Nov');
    expect(shortPeriodLabel('year', { start: '2025-12-31T13:00:00Z', end: '2026-12-31T13:00:00Z' })).toBe('2026');
  });
});
