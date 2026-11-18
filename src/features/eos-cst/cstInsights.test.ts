import { describe, expect, it } from 'vitest';
import type { CstReport } from './cstReport';
import { bucketByTime, clientBuckets, cscRates, flattenRtos, periodDates, toClientRow, topCounts, userSplit } from './cstInsights';

const rto = (id: number, users: number, active: number, never = 0, certs = 0) => ({
  tenant_id: id,
  tenant_name: `Client ${id}`,
  client_users: users,
  active_users: active,
  never_signed_in: never,
  certificates: certs,
  prior_certificates: 0,
  last_active_at: null,
});

const totals = { live_rtos: 0, client_users: 0, active_users: 0, rtos_active: 0, rtos_with_users: 0, never_signed_in: 0, certificates: 0, prior_certificates: 0 };

const report: CstReport = {
  period: 'month',
  start: '2026-10-31T13:00:00Z', // 1 Nov, Sydney
  end: '2026-11-30T13:00:00Z', // 1 Dec, Sydney, exclusive
  prior_start: '',
  prior_end: '',
  generated_at: '',
  totals: { ...totals, client_users: 20, active_users: 6 },
  csc: [
    { ...totals, csc_user_id: 'a', csc_name: 'Alex', live_rtos: 2, client_users: 10, active_users: 5, never_signed_in: 1, certificates: 2, rtos: [rto(1, 6, 4, 1, 2), rto(2, 4, 1)] },
    { ...totals, csc_user_id: 'b', csc_name: 'Bo', live_rtos: 2, client_users: 10, active_users: 1, never_signed_in: 3, certificates: 0, rtos: [rto(3, 10, 0, 3), rto(4, 0, 0)] },
  ],
};

describe('periodDates', () => {
  it('gives the first and last Sydney day, treating the end as exclusive', () => {
    expect(periodDates(report)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
});

describe('flattenRtos / toClientRow', () => {
  it('carries each client with its CSC and maps to the drill-down row', () => {
    const rows = flattenRtos(report);
    expect(rows.map((r) => `${r.cscName}:${r.tenant_id}`)).toEqual(['Alex:1', 'Alex:2', 'Bo:3', 'Bo:4']);
    expect(toClientRow(rows[0])).toMatchObject({ tenantId: 1, name: 'Client 1', cscName: 'Alex', clientUsers: 6, activeUsers: 4, certificates: 2 });
  });
});

describe('userSplit', () => {
  it('splits users into active and quiet', () => {
    expect(userSplit({ client_users: 20, active_users: 6 })).toEqual({ active: 6, quiet: 14 });
  });
});

describe('clientBuckets', () => {
  it('spreads clients by the share of their users who were active', () => {
    expect(clientBuckets(flattenRtos(report))).toEqual({ nobody: 1, quarter: 1, half: 0, most: 1, noUsers: 1 });
  });

  it('puts exactly a quarter and exactly half in the lower band', () => {
    expect(clientBuckets([rto(1, 4, 1), rto(2, 4, 2), rto(3, 4, 3)])).toEqual({ nobody: 0, quarter: 1, half: 1, most: 1, noUsers: 0 });
  });
});

describe('cscRates', () => {
  it('orders by use of the portal and leaves CSCs with no users last', () => {
    const r = cscRates({ ...report, csc: [...report.csc, { ...totals, csc_user_id: 'c', csc_name: 'Cy', live_rtos: 1, rtos: [] }] });
    expect(r.map((x) => `${x.name}:${x.pct}`)).toEqual(['Alex:50', 'Bo:10', 'Cy:null']);
  });
});

describe('bucketByTime', () => {
  it('counts per Sydney day for a month, keeping empty days', () => {
    const out = bucketByTime(['2026-11-03T02:00:00Z', '2026-11-03T05:00:00Z', '2026-11-10T02:00:00Z', '2026-12-05T00:00:00Z'], '2026-11-01', '2026-11-30');
    expect(out).toHaveLength(30);
    expect(out.find((b) => b.key === '2026-11-03')?.count).toBe(2);
    expect(out.find((b) => b.key === '2026-11-04')?.count).toBe(0);
    expect(out.reduce((n, b) => n + b.count, 0)).toBe(3);
  });

  it('counts per month for a year', () => {
    const out = bucketByTime(['2026-02-10T02:00:00Z', '2026-02-11T02:00:00Z', '2026-11-03T02:00:00Z'], '2026-01-01', '2026-12-31');
    expect(out).toHaveLength(12);
    expect(out[1]).toMatchObject({ label: 'Feb', count: 2 });
    expect(out[10]).toMatchObject({ label: 'Nov', count: 1 });
  });

  it('puts a late-evening Sydney time on the Sydney day, not the UTC day', () => {
    // 2026-11-02T14:30Z is 3 Nov 01:30 in Sydney.
    const out = bucketByTime(['2026-11-02T14:30:00Z'], '2026-11-01', '2026-11-30');
    expect(out.find((b) => b.key === '2026-11-03')?.count).toBe(1);
  });
});

describe('topCounts', () => {
  it('sorts biggest first, drops zeros and keeps ties in name order', () => {
    const out = topCounts([{ n: 'b', c: 2 }, { n: 'a', c: 2 }, { n: 'z', c: 0 }, { n: 'c', c: 5 }], (r) => r.n, (r) => r.c, 2);
    expect(out.map((o) => o.label)).toEqual(['c', 'a']);
  });
});
