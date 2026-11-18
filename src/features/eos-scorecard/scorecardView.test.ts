import { describe, expect, it } from 'vitest';
import type { ScorecardEntry, ScorecardMetric } from '@/types/scorecard';
import {
  addDays,
  aimText,
  areaCue,
  areaNeedsRoom,
  buildMeasures,
  changeText,
  countStatuses,
  formatValue,
  gapText,
  groupAreas,
  headlineSentence,
  issueDraft,
  lastCompletedWeekKey,
  parseNumberInput,
  shiftWeek,
  sortWorstFirst,
  statusOf,
  weekLabel,
  worstStatus,
  type Measure,
} from './scorecardView';

const metric = (over: Partial<ScorecardMetric> = {}): ScorecardMetric => ({
  id: 'm1', scorecard_id: 's1', tenant_id: 6372, name: 'People using the portal', description: null, category: 'CST', owner_id: 'u1',
  target_value: 30, unit: '%', direction: 'higher_is_better', frequency: 'weekly', metric_source: 'automatic', metric_key: null,
  example_result: null, is_active: true, is_archived: false, display_order: 0, created_at: '', updated_at: '', recentEntries: [], ...over,
});
const entry = (week: string, value: number, over: Partial<ScorecardEntry> = {}): ScorecardEntry => ({
  id: `e-${week}`, metric_id: 'm1', tenant_id: 6372, week_ending: week, value, actual_value: value, entered_by: 'u1', entered_at: '', entry_source: 'system', ...over,
});
const measure = (over: Partial<Measure> = {}): Measure => ({
  id: 'm1', metric: metric(), name: 'People using the portal', description: '', category: 'CST', ownerId: 'u1', target: 30, unit: '%',
  direction: 'higher_is_better', source: 'automatic', value: 18.8, status: 'off_track', history: [], lastEntry: null, ...over,
});

describe('weeks (Sydney time, Monday keys)', () => {
  it('picks the Monday of the last week that has ended', () => {
    expect(lastCompletedWeekKey(new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-09'); // Tuesday
    expect(lastCompletedWeekKey(new Date('2026-11-22T16:30:00Z'))).toBe('2026-11-16'); // Monday 03:30 Sydney
    expect(lastCompletedWeekKey(new Date('2026-11-21T23:00:00Z'))).toBe('2026-11-09'); // Sunday in Sydney: this week has not ended
  });
  it('moves by whole weeks', () => {
    expect(shiftWeek('2026-11-09', -1)).toBe('2026-11-02');
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('labels a week in words, across month and year boundaries', () => {
    expect(weekLabel('2026-11-09')).toBe('9 to 15 November 2026');
    expect(weekLabel('2026-10-26')).toBe('26 October to 1 November 2026');
    expect(weekLabel('2026-12-28')).toBe('28 December 2026 to 3 January 2027');
  });
});

describe('saying a number in words', () => {
  it('formats each unit', () => {
    expect(formatValue('%', 18.8)).toBe('18.8%');
    expect(formatValue('%', 20)).toBe('20%');
    expect(formatValue('$', 10000)).toBe('$10,000');
    expect(formatValue('Count', 4)).toBe('4');
    expect(formatValue('Hours', 2.5)).toBe('2.5 hours');
    expect(formatValue('Count', null)).toBe('–');
  });
  it('states the aim as a sentence', () => {
    expect(aimText({ unit: '%', target: 30, direction: 'higher_is_better' })).toBe('30% or more');
    expect(aimText({ unit: 'Count', target: 20, direction: 'lower_is_better' })).toBe('20 or fewer');
    expect(aimText({ unit: '$', target: 500, direction: 'lower_is_better' })).toBe('$500 or less');
    expect(aimText({ unit: 'Count', target: 5, direction: 'equals_target' })).toBe('exactly 5');
  });
  it('says how far the number is from the aim', () => {
    expect(gapText({ unit: '%', target: 30, direction: 'higher_is_better', value: 18.8 })).toBe('11.2 points below the aim');
    expect(gapText({ unit: 'Count', target: 3, direction: 'higher_is_better', value: 4 })).toBe('1 above the aim');
    expect(gapText({ unit: 'Count', target: 30, direction: 'lower_is_better', value: 36 })).toBe('6 over the limit');
    expect(gapText({ unit: 'Count', target: 30, direction: 'lower_is_better', value: 25 })).toBe('5 under the limit');
    expect(gapText({ unit: '$', target: 10000, direction: 'higher_is_better', value: 8500 })).toBe('$1,500 below the aim');
    expect(gapText({ unit: 'Count', target: 5, direction: 'higher_is_better', value: 5 })).toBe('Right on the aim');
    expect(gapText({ unit: 'Count', target: 5, direction: 'higher_is_better', value: null })).toBe('No number recorded for this week.');
  });
  it('describes the change on last week, skipping weeks with no number', () => {
    expect(changeText({ unit: '%', history: [20, 22, 18.8] })).toBe('Down 3.2 points on last week');
    expect(changeText({ unit: 'Count', history: [1, null, 3] })).toBe('Up 2 on last week');
    expect(changeText({ unit: 'Count', history: [3, 3] })).toBe('Same as last week');
    expect(changeText({ unit: 'Count', history: [3, null] })).toBeNull();
    expect(changeText({ unit: 'Count', history: [null, 3] })).toBeNull();
  });
  it('reads typed numbers leniently and rejects the rest', () => {
    expect(parseNumberInput('$1,200')).toBe(1200);
    expect(parseNumberInput(' 12 % ')).toBe(12);
    expect(parseNumberInput('7.5')).toBe(7.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
  });
});

describe('status in plain words', () => {
  it('maps the app’s colours and treats a missing number as waiting', () => {
    expect(statusOf(35, 30, 'higher_is_better')).toBe('on_track');
    expect(statusOf(27, 30, 'higher_is_better')).toBe('nearly'); // exactly 10% short is still nearly there
    expect(statusOf(26.9, 30, 'higher_is_better')).toBe('off_track');
    expect(statusOf(33, 30, 'lower_is_better')).toBe('nearly');
    expect(statusOf(36, 30, 'lower_is_better')).toBe('off_track');
    expect(statusOf(null, 30, 'higher_is_better')).toBe('waiting');
  });
});

describe('buildMeasures', () => {
  const week = '2026-11-09';

  it('uses only the number for the week under review, not an older one', () => {
    const [m] = buildMeasures([metric({ recentEntries: [entry('2026-10-26', 5)] })], week);
    expect(m.value).toBeNull();
    expect(m.status).toBe('waiting');
    expect(m.lastEntry).toEqual({ value: 5, weekEnding: '2026-10-26' });
  });

  it('finds this week’s number, including one keyed on the Sunday', () => {
    const [monday] = buildMeasures([metric({ recentEntries: [entry('2026-11-09', 18.8)] })], week);
    const [sunday] = buildMeasures([metric({ recentEntries: [entry('2026-11-15', 21)] })], week);
    expect(monday.value).toBe(18.8);
    expect(monday.status).toBe('off_track');
    expect(sunday.value).toBe(21);
  });

  it('builds eight weeks of history, oldest first, with gaps as null', () => {
    const [m] = buildMeasures(
      [metric({ recentEntries: [entry('2026-11-09', 18.8), entry('2026-10-26', 24), entry('2026-09-21', 23.6)] })],
      week,
    );
    expect(m.history).toHaveLength(8);
    expect(m.history[0]).toBe(23.6); // week of 21 Sept is exactly seven weeks before
    expect(m.history[7]).toBe(18.8);
    expect(m.history[5]).toBe(24);
    expect(m.history[6]).toBeNull();
  });

  it('prefers actual_value and carries the plain fields through', () => {
    const [m] = buildMeasures([metric({ description: '  Of everyone with a login.  ', recentEntries: [entry('2026-11-09', 10, { actual_value: 12 })] })], week);
    expect(m.value).toBe(12);
    expect(m.description).toBe('Of everyone with a login.');
    expect(m.target).toBe(30);
    expect(m.category).toBe('CST');
  });
});

describe('summaries', () => {
  const s = (status: Measure['status']) => ({ status });

  it('counts and words the headline', () => {
    const c = countStatuses([s('on_track'), s('off_track'), s('off_track'), s('nearly'), s('waiting'), s('waiting')]);
    expect(c).toEqual({ total: 6, on_track: 1, nearly: 1, off_track: 2, waiting: 2 });
    expect(headlineSentence(c)).toBe('1 of 6 measures are on track. 3 need attention. 2 are waiting for a number.');
  });
  it('handles singular, none and all-green', () => {
    expect(headlineSentence(countStatuses([s('on_track'), s('off_track'), s('waiting')]))).toBe('1 of 3 measures are on track. 1 needs attention. 1 is waiting for a number.');
    expect(headlineSentence(countStatuses([s('on_track'), s('on_track')]))).toBe('All 2 measures are on track.');
    expect(headlineSentence(countStatuses([s('on_track')]))).toBe('The one measure is on track.');
    expect(headlineSentence(countStatuses([]))).toBe('There are no measures on the scorecard yet.');
    expect(headlineSentence(countStatuses([s('off_track'), s('off_track')]))).toBe('0 of 2 measures are on track. 2 need attention.');
  });
  it('orders worst first without disturbing ties', () => {
    const list = [{ id: 'a', status: 'on_track' as const }, { id: 'b', status: 'waiting' as const }, { id: 'c', status: 'off_track' as const }, { id: 'd', status: 'off_track' as const }, { id: 'e', status: 'nearly' as const }];
    expect(sortWorstFirst(list).map((x) => x.id)).toEqual(['c', 'd', 'e', 'b', 'a']);
    expect(worstStatus(list)).toBe('off_track');
    expect(worstStatus([s('waiting'), s('on_track')])).toBe('waiting');
    expect(worstStatus([])).toBe('on_track');
  });
});

describe('areas', () => {
  const list = [
    measure({ id: '1', category: 'Sales', status: 'waiting' }),
    measure({ id: '2', category: 'CST', status: 'on_track' }),
    measure({ id: '3', category: 'CST', status: 'off_track' }),
    measure({ id: '4', category: 'Zebra', status: 'on_track' }),
    measure({ id: '5', category: 'Finance', status: 'nearly' }),
  ];
  it('groups in a fixed order with plain names, worst measure first', () => {
    const areas = groupAreas(list);
    expect(areas.map((a) => a.name)).toEqual(['Client engagement', 'Sales', 'Finance', 'Zebra']);
    expect(areas[0].who).toBe('Customer Success Team');
    expect(areas[0].measures.map((m) => m.id)).toEqual(['3', '2']);
    expect(areas[0].worst).toBe('off_track');
  });
  it('says an area needs the room only for off track or nearly there', () => {
    const [cst, sales, finance, zebra] = groupAreas(list);
    expect([cst, sales, finance, zebra].map(areaNeedsRoom)).toEqual([true, false, true, false]);
  });
  it('reads the facilitator’s question from the numbers', () => {
    const m = (status: Measure['status']) => measure({ status });
    expect(areaCue({ measures: [m('off_track'), m('off_track'), m('on_track')] })).toBe('2 of 3 measures are off track. What is getting in the way?');
    expect(areaCue({ measures: [m('off_track')] })).toBe('The measure is off track. What is getting in the way?');
    expect(areaCue({ measures: [m('nearly'), m('on_track')] })).toBe('1 measure is nearly there. Is anything at risk of slipping?');
    expect(areaCue({ measures: [m('waiting'), m('waiting'), m('waiting'), m('waiting')] })).toBe('There are no numbers for any of these. Who is entering them, and by when?');
    expect(areaCue({ measures: [m('waiting')] })).toBe('There is no number for this week. Who is entering it, and by when?');
    expect(areaCue({ measures: [m('off_track'), m('waiting'), m('on_track')] })).toBe('1 of 3 measures is off track. What is getting in the way? 1 number is missing. Who is entering it, and by when?');
    expect(areaCue({ measures: [m('on_track')] })).toBe('Everything here is on track. Does the room need to know anything?');
  });
});

describe('issueDraft', () => {
  const m = measure({ value: 18.8, history: [23.6, 25.7, 26.2, 25.7, 23.6, 24.1, 22, 18.8] });
  it('drafts the title and description from the numbers', () => {
    const d = issueDraft(m, '2026-11-09', 'Do we call the quiet clients this week?', 'Angela');
    expect(d.title).toBe('Off track: People using the portal is 18.8% (aim 30% or more)');
    expect(d.description).toContain('Week: 9 to 15 November 2026');
    expect(d.description).toContain('Aim: 30% or more');
    expect(d.description).toContain('Last 8 weeks (oldest first): 23.6%, 25.7%, 26.2%, 25.7%, 23.6%, 24.1%, 22%, 18.8%');
    expect(d.description).toContain('Owner: Angela');
    expect(d.description).toContain('For the room to decide: Do we call the quiet clients this week?');
  });
  it('words a missing number and a nearly-there measure differently', () => {
    expect(issueDraft(measure({ value: null, status: 'waiting', history: [] }), '2026-11-09').title).toBe('No number for People using the portal');
    expect(issueDraft(measure({ value: 28, status: 'nearly' }), '2026-11-09').title).toBe('Nearly there: People using the portal is 28% (aim 30% or more)');
  });
  it('keeps the title within the issue limit', () => {
    expect(issueDraft(measure({ name: 'x'.repeat(300) }), '2026-11-09').title.length).toBeLessThanOrEqual(140);
  });
});
