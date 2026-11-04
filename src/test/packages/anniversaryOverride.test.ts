import { describe, it, expect } from 'vitest';
import { format, parseISO } from 'date-fns';
import {
  assessAnniversaryChange,
  defaultAnniversary,
  isCustomPeriod,
  MAX_PERIOD_YEARS,
} from '@/features/packages/anniversaryOverride';

const d = (s: string) => parseISO(s);
const ymd = (x: Date) => format(x, 'yyyy-MM-dd');
const TODAY = d('2026-11-05');

describe('defaultAnniversary / isCustomPeriod', () => {
  it('defaults to exactly one year after the period start', () => {
    expect(ymd(defaultAnniversary(d('2026-09-17')))).toBe('2027-09-17');
  });

  it('treats 365 and 366 day periods as standard and anything else as custom', () => {
    expect(isCustomPeriod(d('2026-09-17'), d('2027-09-17'))).toBe(false); // 365
    expect(isCustomPeriod(d('2023-09-17'), d('2024-09-17'))).toBe(false); // 366 (leap)
    expect(isCustomPeriod(d('2026-09-17'), d('2027-11-04'))).toBe(true); // 413 -- the live example
    expect(isCustomPeriod(d('2025-06-13'), d('2027-06-13'))).toBe(true); // 730
  });
});

describe('assessAnniversaryChange', () => {
  const base = {
    periodStart: d('2026-09-17'),
    currentAnniversary: d('2027-11-04'),
    today: TODAY,
  };

  it('is not valid and has no error while nothing is picked', () => {
    const r = assessAnniversaryChange({ ...base, proposed: undefined });
    expect(r).toMatchObject({ valid: false, error: null, periodDays: null });
  });

  it('accepts a standard year with no warnings', () => {
    const r = assessAnniversaryChange({ ...base, proposed: d('2027-09-17') });
    expect(r.valid).toBe(true);
    expect(r.periodDays).toBe(365);
    expect(r.warnings).toEqual([]);
  });

  it('is unchanged (and not savable) when the proposed date equals the stored one', () => {
    const r = assessAnniversaryChange({ ...base, proposed: d('2027-11-04') });
    expect(r.unchanged).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('rejects a date on or before the period start', () => {
    expect(assessAnniversaryChange({ ...base, proposed: d('2026-09-17') }).valid).toBe(false);
    const r = assessAnniversaryChange({ ...base, proposed: d('2026-08-01') });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/after the period start/);
  });

  it('allows exactly the maximum span and rejects one day beyond it', () => {
    const limit = ymd(new Date(2026 + MAX_PERIOD_YEARS, 8, 17)); // 17 Sep 2029
    expect(assessAnniversaryChange({ ...base, proposed: d(limit) }).valid).toBe(true);
    const over = assessAnniversaryChange({ ...base, proposed: d('2029-09-18') });
    expect(over.valid).toBe(false);
    expect(over.error).toMatch(/at most 3 years/);
  });

  it('warns about a non-standard period length without blocking the save', () => {
    const r = assessAnniversaryChange({ ...base, proposed: d('2027-10-01') });
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(['non_standard_length']);
  });

  it('warns that a date today or earlier makes the renewal due immediately', () => {
    const r = assessAnniversaryChange({
      periodStart: d('2025-11-05'),
      currentAnniversary: d('2026-11-05'),
      proposed: d('2026-11-05'),
      today: TODAY,
    });
    // unchanged here, so use a different past date to check the warning path
    const past = assessAnniversaryChange({
      periodStart: d('2025-11-05'),
      currentAnniversary: d('2026-12-01'),
      proposed: d('2026-11-05'),
      today: TODAY,
    });
    expect(r.unchanged).toBe(true);
    expect(past.valid).toBe(true);
    expect(past.warnings.map((w) => w.code)).toContain('renewal_due_now');
  });
});
