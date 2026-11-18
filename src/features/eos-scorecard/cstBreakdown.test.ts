import { describe, expect, it } from 'vitest';
import { breakdownKind, buildBreakdown, countBy, metricFromRows, weekChanges, weeklySeries, type CstClientRow } from './cstBreakdown';

const row = (tenantId: number, over: Partial<CstClientRow> = {}): CstClientRow => ({
  tenantId,
  name: `Client ${tenantId}`,
  cscId: 'c1',
  cscName: 'Sam',
  clientUsers: 4,
  activeUsers: 0,
  neverSignedIn: 0,
  certificates: 0,
  ...over,
});

// 10 clients with users: 4 active, 6 quiet. One more client has no users at all.
const rows: CstClientRow[] = [
  ...[1, 2, 3, 4].map((id) => row(id, { activeUsers: 2 })),
  ...[5, 6, 7, 8, 9, 10].map((id) => row(id, { clientUsers: id === 5 ? 9 : 3, neverSignedIn: id <= 7 ? 2 : 0, cscName: id > 8 ? 'Dave' : 'Sam' })),
  row(11, { clientUsers: 0 }),
];

describe('breakdownKind', () => {
  it('knows the automatic client measures and nothing else', () => {
    expect(breakdownKind('cst_rtos_with_activity_pct')).toBe('clients_active');
    expect(breakdownKind('cst_certificates_issued_count')).toBe('certificates');
    expect(breakdownKind('qualified_leads_count')).toBeNull();
    expect(breakdownKind(null)).toBeNull();
  });
});

describe('metricFromRows', () => {
  it('matches how the database works each number out', () => {
    expect(metricFromRows('clients_active', rows)).toBe(40);
    expect(metricFromRows('clients_quiet', rows)).toBe(6);
    expect(metricFromRows('never_signed_in', rows)).toBe(6);
    expect(metricFromRows('certificates', rows)).toBe(0);
    // 8 active people out of 40 client users.
    expect(metricFromRows('people_active', rows)).toBe(20);
  });

  it('is null with no rows rather than a misleading zero', () => {
    expect(metricFromRows('clients_active', [])).toBeNull();
    expect(metricFromRows('never_signed_in', [])).toBeNull();
  });
});

describe('buildBreakdown', () => {
  it('explains the share of active clients in plain words and says how many more are needed', () => {
    const b = buildBreakdown('clients_active', rows, { value: 40, target: 50 });
    expect(b.sentence).toBe('4 of 10 clients with portal users had someone use the portal in the last 28 days. The other 6 had nobody.');
    expect(b.split).toEqual([
      { label: 'Someone active', count: 4, tone: 'good' },
      { label: 'Nobody active', count: 6, tone: 'bad' },
    ]);
    expect(b.lift).toBe('1 more client needs someone active to reach 50%.');
  });

  it('lists the quiet clients biggest first, so the people with the most users are chased first', () => {
    const b = buildBreakdown('clients_active', rows, { value: 40, target: 50 });
    // Client 5 has 9 users; the rest have 3 and fall back to name order ("Client 10" sorts before "Client 6").
    expect(b.list.map((r) => r.tenantId)).toEqual([5, 10, 6, 7, 8, 9]);
    expect(b.list[0].clientUsers).toBe(9);
  });

  it('shows each CSC how many of their clients are quiet', () => {
    const b = buildBreakdown('clients_quiet', rows, { value: 6, target: 3 });
    expect(b.byCsc).toEqual([
      { name: 'Sam', count: 4, of: 8 },
      { name: 'Dave', count: 2, of: 2 },
    ]);
    expect(b.lift).toBe('Getting 3 of these clients active again would meet the aim of 3 or fewer.');
  });

  it('has no lift when the aim is already met, and none when there is no number', () => {
    expect(buildBreakdown('clients_active', rows, { value: 60, target: 40 }).lift).toBeNull();
    expect(buildBreakdown('clients_active', rows, { value: null, target: 50 }).lift).toBeNull();
  });

  it('names who never signed in, and how many need to', () => {
    const b = buildBreakdown('never_signed_in', rows, { value: 6, target: 4 });
    expect(b.sentence).toContain('6 invited people have never signed in, across 3 clients.');
    expect(b.list.map((r) => r.tenantId)).toEqual([5, 6, 7]);
    expect(b.lift).toBe('2 of these people need to sign in, or be removed if they have left, to meet the aim of 4 or fewer.');
  });

  it('handles a week with nothing to chase', () => {
    expect(buildBreakdown('never_signed_in', [row(1)], { value: 0, target: 5 }).sentence).toBe('Everyone who has been invited has signed in at least once.');
    expect(buildBreakdown('certificates', [row(1)], { value: 0, target: 0 }).sentence).toBe('No certificates were issued this week.');
  });

  it('reports certificates by client', () => {
    const b = buildBreakdown('certificates', [row(1, { certificates: 3 }), row(2, { certificates: 1 }), row(3)], { value: 4, target: 6 });
    expect(b.sentence).toBe('4 certificates were issued this week, across 2 clients.');
    expect(b.list.map((r) => r.tenantId)).toEqual([1, 2]);
    expect(b.lift).toBe('2 more certificates would have met the aim of 6.');
  });
});

describe('weekChanges', () => {
  it('finds clients that went quiet and clients that came back', () => {
    const before = [row(1, { activeUsers: 1 }), row(2), row(3, { activeUsers: 1 })];
    const now = [row(1), row(2, { activeUsers: 2 }), row(3, { activeUsers: 1 }), row(4)];
    const changes = weekChanges(before, now);
    expect(changes.wentQuiet.map((r) => r.tenantId)).toEqual([1]);
    expect(changes.cameBack.map((r) => r.tenantId)).toEqual([2]);
  });
});

describe('weeklySeries', () => {
  it('gives one point per week, oldest first', () => {
    const series = weeklySeries('clients_quiet', { '2026-11-15': rows, '2026-11-08': [row(1)] });
    expect(series.map((p) => p.weekEnding)).toEqual(['2026-11-08', '2026-11-15']);
    expect(series.map((p) => p.value)).toEqual([1, 6]);
  });
});

describe('countBy', () => {
  it('counts biggest first and breaks ties alphabetically', () => {
    expect(countBy(['b', 'a', 'b', 'c', 'a', 'b'], (x) => x)).toEqual([
      { label: 'b', count: 3 },
      { label: 'a', count: 2 },
      { label: 'c', count: 1 },
    ]);
  });
});
