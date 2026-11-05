import { describe, expect, it } from 'vitest';
import {
  assessAllowanceAdjustment,
  MAX_ADJUSTMENT_HOURS,
  MAX_ALLOWANCE_HOURS,
  parseHoursInput,
} from '@/features/packages/allowanceAdjustment';

const assess = (deltaInput: string, currentHours = 7, usedHours = 0) =>
  assessAllowanceAdjustment({ currentHours, usedHours, deltaInput });

describe('parseHoursInput', () => {
  it('accepts whole, decimal and signed numbers', () => {
    expect(parseHoursInput('161')).toBe(161);
    expect(parseHoursInput('1.5')).toBe(1.5);
    expect(parseHoursInput('-7')).toBe(-7);
    expect(parseHoursInput('+7')).toBe(7);
    expect(parseHoursInput(' .5 ')).toBe(0.5);
  });

  it('rejects empty and non-numeric input', () => {
    expect(parseHoursInput('')).toBeNull();
    expect(parseHoursInput('-')).toBeNull();
    expect(parseHoursInput('abc')).toBeNull();
    expect(parseHoursInput('1e3')).toBeNull();
    expect(parseHoursInput('1,5')).toBeNull();
  });
});

describe('assessAllowanceAdjustment', () => {
  it('is neither valid nor an error while nothing is typed', () => {
    expect(assess('')).toMatchObject({ valid: false, error: null, newTotalHours: null });
  });

  it('previews the new total for the 24-day case', () => {
    const result = assess('161');
    expect(result.valid).toBe(true);
    expect(result.newTotalHours).toBe(168);
    expect(result.daysLabel).toBe('= 23 days of 7 h');
  });

  it('only shows a days label for whole days', () => {
    expect(assess('7').daysLabel).toBe('= 1 day of 7 h');
    expect(assess('10').daysLabel).toBeNull();
    expect(assess('3.5').daysLabel).toBeNull();
  });

  it('allows a negative correction that stays above zero', () => {
    const result = assess('-3', 10);
    expect(result.valid).toBe(true);
    expect(result.newTotalHours).toBe(7);
  });

  it('rejects an adjustment that leaves zero or less', () => {
    expect(assess('-7', 7).valid).toBe(false);
    expect(assess('-8', 7).error).toMatch(/zero or below/);
  });

  it('rejects a zero adjustment, including one that rounds to zero minutes', () => {
    expect(assess('0').error).toMatch(/non-zero/);
    expect(assess('0.001').error).toMatch(/non-zero/);
  });

  it('enforces the single-adjustment and total ceilings', () => {
    expect(assess(String(MAX_ADJUSTMENT_HOURS)).valid).toBe(true);
    expect(assess(String(MAX_ADJUSTMENT_HOURS + 1)).error).toMatch(/at most 1000/);
    expect(assess('1000', MAX_ALLOWANCE_HOURS - 999).error).toMatch(/at most 2000/);
    expect(assess('1000', MAX_ALLOWANCE_HOURS - 1000).valid).toBe(true);
  });

  it('warns, but still allows, an allowance below the hours already used', () => {
    const result = assess('-5', 10, 8);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.code)).toEqual(['below_used']);
  });

  it('reports non-numeric input as an error', () => {
    expect(assess('lots').error).toMatch(/number of hours/);
    expect(assess('lots').valid).toBe(false);
  });
});
