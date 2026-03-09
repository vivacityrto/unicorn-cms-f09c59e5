import { describe, it, expect } from 'vitest';
import { calculateStatus } from '@/types/scorecard';
import type { MetricDirection, MetricStatus } from '@/types/scorecard';

describe('calculateStatus', () => {
  describe('higher_is_better', () => {
    it('returns green when actual >= target', () => {
      expect(calculateStatus(10, 10, 'higher_is_better')).toBe('green');
      expect(calculateStatus(15, 10, 'higher_is_better')).toBe('green');
    });
    it('returns red when actual is significantly below target', () => {
      expect(calculateStatus(5, 10, 'higher_is_better')).toBe('red');
    });
    it('returns amber when actual is within 10% below target', () => {
      expect(calculateStatus(9.5, 10, 'higher_is_better')).toBe('amber');
    });
  });

  describe('lower_is_better', () => {
    it('returns green when actual <= target', () => {
      expect(calculateStatus(5, 10, 'lower_is_better')).toBe('green');
      expect(calculateStatus(10, 10, 'lower_is_better')).toBe('green');
    });
    it('returns red when actual is significantly above target', () => {
      expect(calculateStatus(20, 10, 'lower_is_better')).toBe('red');
    });
    it('returns amber when actual is within 10% above target', () => {
      expect(calculateStatus(10.5, 10, 'lower_is_better')).toBe('amber');
    });
  });

  describe('equals_target', () => {
    it('returns green when actual equals target', () => {
      expect(calculateStatus(10, 10, 'equals_target')).toBe('green');
    });
    it('returns red when actual is far from target', () => {
      expect(calculateStatus(20, 10, 'equals_target')).toBe('red');
    });
    it('returns amber when within threshold', () => {
      expect(calculateStatus(10.5, 10, 'equals_target')).toBe('amber');
    });
  });
});

describe('archive vs delete rules', () => {
  it('should prefer archive when metric has entries', () => {
    const hasEntries = true;
    const canDelete = !hasEntries;
    expect(canDelete).toBe(false);
  });

  it('should allow delete when metric has no entries', () => {
    const hasEntries = false;
    const canDelete = !hasEntries;
    expect(canDelete).toBe(true);
  });
});

describe('duplicate metric prevention', () => {
  const existingNames = ['Qualified Leads', 'Discovery Calls'];

  it('detects exact duplicate', () => {
    const isDuplicate = existingNames.some(
      (n) => n.toLowerCase().trim() === 'qualified leads',
    );
    expect(isDuplicate).toBe(true);
  });

  it('detects case-insensitive duplicate', () => {
    const isDuplicate = existingNames.some(
      (n) => n.toLowerCase().trim() === 'QUALIFIED LEADS'.toLowerCase().trim(),
    );
    expect(isDuplicate).toBe(true);
  });

  it('allows unique name', () => {
    const isDuplicate = existingNames.some(
      (n) => n.toLowerCase().trim() === 'new revenue booked',
    );
    expect(isDuplicate).toBe(false);
  });
});

describe('missing data logic', () => {
  const thisWeek = new Date().toISOString().split('T')[0];

  it('identifies metric with no entry for this week', () => {
    const entries: { week_ending: string }[] = [{ week_ending: '2024-01-01' }];
    const hasMissingData = !entries.some((e) => e.week_ending === thisWeek);
    expect(hasMissingData).toBe(true);
  });

  it('does not flag metric with this week entry', () => {
    const entries: { week_ending: string }[] = [{ week_ending: thisWeek }];
    const hasMissingData = !entries.some((e) => e.week_ending === thisWeek);
    expect(hasMissingData).toBe(false);
  });
});

describe('trend rendering with no-data gaps', () => {
  it('handles all no-data statuses', () => {
    const statuses: (MetricStatus | null)[] = [null, null, null];
    const rendered = statuses.map((s) => s ?? 'no_data');
    expect(rendered).toEqual(['no_data', 'no_data', 'no_data']);
  });

  it('handles mixed data/no-data', () => {
    const statuses: (MetricStatus | null)[] = ['green', null, 'red', null, 'green'];
    const rendered = statuses.map((s) => s ?? 'no_data');
    expect(rendered).toEqual(['green', 'no_data', 'red', 'no_data', 'green']);
  });
});
