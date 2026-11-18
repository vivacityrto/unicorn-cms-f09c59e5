import { describe, expect, it } from 'vitest';
import {
  certificateDelta,
  csvFilename,
  formatPercent,
  lastActiveText,
  percent,
  periodLabel,
  reportHeadline,
  reportToCsv,
  shiftAnchor,
  sydneyToday,
  type CstReport,
} from './cstReport';

const rto = (over: Partial<CstReport['csc'][number]['rtos'][number]> = {}) => ({
  tenant_id: 1,
  tenant_name: 'Sample RTO',
  client_users: 4,
  active_users: 1,
  never_signed_in: 2,
  certificates: 3,
  prior_certificates: 5,
  ...over,
});

const report = (over: Partial<CstReport> = {}): CstReport => ({
  period: 'month',
  start: '2026-10-31T13:00:00.000Z',
  end: '2026-11-30T13:00:00.000Z',
  prior_start: '2026-09-30T14:00:00.000Z',
  prior_end: '2026-10-31T13:00:00.000Z',
  generated_at: '2026-11-17T03:00:00.000Z',
  totals: {
    live_rtos: 1, client_users: 4, active_users: 1, rtos_active: 1, rtos_with_users: 1,
    never_signed_in: 2, certificates: 3, prior_certificates: 5,
  },
  csc: [
    {
      csc_user_id: 'u1', csc_name: 'CSC One', live_rtos: 1, client_users: 4, active_users: 1,
      rtos_active: 1, rtos_with_users: 1, never_signed_in: 2, certificates: 3, prior_certificates: 5,
      rtos: [rto()],
    },
  ],
  ...over,
});

describe('percent', () => {
  it('rounds to a whole number', () => {
    expect(percent(43, 191)).toBe(23);
    expect(percent(38, 191)).toBe(20);
  });
  it('returns null instead of dividing by zero', () => {
    expect(percent(0, 0)).toBeNull();
    expect(formatPercent(0, 0)).toBe('–');
  });
  it('formats with a percent sign', () => {
    expect(formatPercent(1, 2)).toBe('50%');
  });
});

describe('certificateDelta', () => {
  it('reports direction against the prior period', () => {
    expect(certificateDelta('month', 5, 15)).toEqual({ delta: -10, direction: 'down' });
    expect(certificateDelta('week', 4, 1)).toEqual({ delta: 3, direction: 'up' });
    expect(certificateDelta('month', 2, 2)).toEqual({ delta: 0, direction: 'flat' });
  });
  it('has no comparison for a year with no prior year (certificates start in 2026)', () => {
    expect(certificateDelta('year', 61, 0)).toBeNull();
  });
  it('still compares a year once a prior year has data', () => {
    expect(certificateDelta('year', 61, 40)).toEqual({ delta: 21, direction: 'up' });
  });
});

describe('periodLabel (Sydney time, exclusive end)', () => {
  it('names a month by its own month, not the next', () => {
    expect(periodLabel('month', '2026-10-31T13:00:00.000Z', '2026-11-30T13:00:00.000Z')).toBe('November 2026');
  });
  it('names a year', () => {
    expect(periodLabel('year', '2025-12-31T13:00:00.000Z', '2026-12-31T13:00:00.000Z')).toBe('2026');
  });
  it('names a week by its ending Sunday', () => {
    // Monday 10 Nov to Monday 17 Nov 2026 (AEDT, UTC+11)
    expect(periodLabel('week', '2026-11-09T13:00:00.000Z', '2026-11-16T13:00:00.000Z')).toBe('Week ending 16 Nov 2026');
  });
  it('shows a rolling window as a range', () => {
    expect(periodLabel('days28', '2026-10-20T13:00:00.000Z', '2026-11-17T13:00:00.000Z')).toBe('21 Oct 2026 to 17 Nov 2026');
  });
});

describe('shiftAnchor', () => {
  it('moves by a week', () => {
    expect(shiftAnchor('2026-11-17', 'week', -1)).toBe('2026-11-10');
    expect(shiftAnchor('2026-11-17', 'week', 1)).toBe('2026-11-24');
  });
  it('moves by a month without overflowing short months', () => {
    expect(shiftAnchor('2026-03-31', 'month', -1)).toBe('2026-02-01');
    expect(shiftAnchor('2026-01-31', 'month', 1)).toBe('2026-02-01');
  });
  it('moves by a year', () => {
    expect(shiftAnchor('2026-11-17', 'year', -1)).toBe('2025-01-01');
  });
  it('does not move a rolling window', () => {
    expect(shiftAnchor('2026-11-17', 'days28', 1)).toBe('2026-11-17');
  });
});

describe('sydneyToday', () => {
  it('uses Sydney, not UTC, for the date', () => {
    // 2026-11-16 14:00 UTC is already 17 November in Sydney (AEDT)
    expect(sydneyToday(new Date('2026-11-16T14:00:00Z'))).toBe('2026-11-17');
    expect(sydneyToday(new Date('2026-11-16T12:00:00Z'))).toBe('2026-11-16');
  });
});

describe('reportToCsv', () => {
  it('writes a header and one row per RTO', () => {
    const lines = reportToCsv(report()).split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Primary CSC,RTO,Client users,Active users,Activity rate %,Never signed in,Certificates issued,Prior period certificates');
    expect(lines[1]).toBe('CSC One,Sample RTO,4,1,25,2,3,5');
  });
  it('leaves the activity rate empty when an RTO has no users', () => {
    const r = report();
    r.csc[0].rtos = [rto({ client_users: 0, active_users: 0 })];
    expect(reportToCsv(r).split('\r\n')[1]).toBe('CSC One,Sample RTO,0,0,,2,3,5');
  });
  it('quotes commas and quotes in names', () => {
    const r = report();
    r.csc[0].rtos = [rto({ tenant_name: 'Smith, "Jones" Training' })];
    expect(reportToCsv(r).split('\r\n')[1]).toContain('"Smith, ""Jones"" Training"');
  });
  it('neutralises spreadsheet formulas in names', () => {
    const r = report();
    r.csc[0].rtos = [rto({ tenant_name: '=HYPERLINK("http://x")' })];
    expect(reportToCsv(r).split('\r\n')[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});

describe('csvFilename', () => {
  it('names the period and its first day', () => {
    expect(csvFilename(report())).toBe('cst-report-month-2026-10-31.csv');
  });
});

describe('lastActiveText', () => {
  const now = new Date('2026-11-18T03:00:00Z');
  it('says never when there is no activity', () => {
    expect(lastActiveText(null, now)).toBe('Never');
    expect(lastActiveText(undefined, now)).toBe('Never');
  });
  it('says how long ago in plain words', () => {
    expect(lastActiveText('2026-11-18T01:00:00Z', now)).toBe('Today');
    expect(lastActiveText('2026-11-17T01:00:00Z', now)).toBe('Yesterday');
    expect(lastActiveText('2026-11-10T03:00:00Z', now)).toBe('8 days ago');
    expect(lastActiveText('2026-10-14T03:00:00Z', now)).toBe('5 weeks ago');
    expect(lastActiveText('2026-07-01T03:00:00Z', now)).toBe('4 months ago');
  });
});

describe('reportHeadline', () => {
  const totals = { live_rtos: 57, client_users: 191, active_users: 36, rtos_active: 21, rtos_with_users: 55, never_signed_in: 30, certificates: 4, prior_certificates: 2 };
  it('sums up users and certificates in one sentence', () => {
    expect(reportHeadline(totals, 'November 2026')).toBe('November 2026: 36 of 191 client users (19%) used the portal, and 4 certificates were issued.');
  });
  it('uses the singular for one certificate', () => {
    expect(reportHeadline({ ...totals, certificates: 1 }, 'Week')).toContain('1 certificate was issued');
  });
  it('copes with no client users', () => {
    expect(reportHeadline({ ...totals, client_users: 0, active_users: 0 }, 'Week')).toContain('No client users yet');
  });
});
