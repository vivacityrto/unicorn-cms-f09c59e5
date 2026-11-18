import { describe, expect, it } from 'vitest';
import { areaMovement, biggestMovers, compareSeries, groupMoves, rankSentence, signedAmount, streakSentence, verdictOf, weekStatuses } from './comparison';

describe('verdictOf', () => {
  it('reads a rise as good when higher is better, and as bad when lower is better', () => {
    expect(verdictOf(10, 12, 'higher_is_better')).toBe('better');
    expect(verdictOf(10, 12, 'lower_is_better')).toBe('worse');
    expect(verdictOf(12, 10, 'lower_is_better')).toBe('better');
  });
  it('says same when nothing moved', () => {
    expect(verdictOf(5, 5, 'higher_is_better')).toBe('same');
  });
  it('judges an exact-target measure by distance from the target', () => {
    expect(verdictOf(8, 9, 'equals_target', 10)).toBe('better');
    expect(verdictOf(11, 13, 'equals_target', 10)).toBe('worse');
  });
});

describe('signedAmount', () => {
  it('writes points for percentages, dollars for money and plain numbers otherwise', () => {
    expect(signedAmount('%', 3)).toBe('+3 points');
    expect(signedAmount('%', -1)).toBe('-1 point');
    expect(signedAmount('$', -40)).toBe('-$40');
    expect(signedAmount('Count', 2)).toBe('+2');
    expect(signedAmount('Count', 0)).toBe('0');
  });
});

describe('compareSeries', () => {
  const opts = { direction: 'higher_is_better' as const, target: 30 };

  it('gives nothing when there are no numbers', () => {
    expect(compareSeries([null, null], opts).count).toBe(0);
    expect(compareSeries([], opts).benchmarks).toEqual([]);
  });

  it('gives no benchmarks when the current period has no number', () => {
    const c = compareSeries([10, 12, null], opts);
    expect(c.current).toBeNull();
    expect(c.benchmarks).toEqual([]);
  });

  it('compares with last week, the recent average, the best and weakest earlier week, and the aim', () => {
    const c = compareSeries([20, 10, 30, 40, 35], opts);
    const by = Object.fromEntries(c.benchmarks.map((b) => [b.key, b]));
    expect(by.previous).toMatchObject({ label: 'Last week', value: 40, delta: -5, verdict: 'worse' });
    expect(by.recent.value).toBe(25);
    expect(by.best).toMatchObject({ value: 40, delta: -5 });
    expect(by.worst).toMatchObject({ value: 10, delta: 25, verdict: 'better' });
    expect(by.aim).toMatchObject({ value: 30, delta: 5, verdict: 'better' });
    expect(by.earlier).toBeUndefined();
  });

  it('adds an average of every earlier period once there are more than four', () => {
    const c = compareSeries([1, 2, 3, 4, 5, 6], opts);
    expect(c.benchmarks.find((b) => b.key === 'earlier')?.value).toBe(3);
  });

  it('names a gap honestly when the week before has no number', () => {
    const c = compareSeries([10, null, 14], opts);
    expect(c.benchmarks[0].label).toBe('2 weeks ago');
  });

  it('uses the right noun for months', () => {
    expect(compareSeries([1, 2], { ...opts, noun: 'month' }).benchmarks[0].label).toBe('Last month');
  });

  it('ranks the current period among the others, respecting direction', () => {
    expect(compareSeries([5, 9, 7, 3], { direction: 'lower_is_better' }).rank).toEqual({ place: 1, of: 4 });
    expect(compareSeries([5, 9, 7, 12], { direction: 'lower_is_better' }).rank).toEqual({ place: 4, of: 4 });
    expect(compareSeries([5, 9, 7, 6], { direction: 'lower_is_better' }).betterThan).toBe(2);
  });

  it('finds a streak of moves in one direction and stops when it breaks', () => {
    expect(compareSeries([9, 5, 6, 7, 8], opts).streak).toEqual({ verdict: 'better', steps: 3 });
    expect(compareSeries([5, 6, 7, 6], opts).streak).toEqual({ verdict: 'worse', steps: 1 });
    expect(compareSeries([5, 6, 6], opts).streak).toBeNull();
  });

  it('does not count a gap as a step in a streak', () => {
    expect(compareSeries([1, 2, null, 7, 8], opts).streak).toEqual({ verdict: 'better', steps: 1 });
    expect(compareSeries([1, 2, 3, null, 8], opts).streak).toBeNull();
  });

  it('reads the overall shape', () => {
    expect(compareSeries([1, 2, 3, 4, 5], opts).trend).toBe('improving');
    expect(compareSeries([5, 4, 3, 2, 1], opts).trend).toBe('slipping');
    expect(compareSeries([5, 4, 3, 2, 1], { direction: 'lower_is_better' }).trend).toBe('improving');
    expect(compareSeries([4, 5, 4, 5, 4], opts).trend).toBe('steady');
    expect(compareSeries([3, 3, 3], opts).trend).toBe('steady');
    expect(compareSeries([3, 4], opts).trend).toBeNull();
  });

  it('reads an exact-target measure moving toward the aim as improving, and away as slipping', () => {
    const exact = { direction: 'equals_target' as const, target: 10 };
    expect(compareSeries([2, 4, 6, 8], exact).trend).toBe('improving');
    expect(compareSeries([8, 6, 4, 2], exact).trend).toBe('slipping');
    expect(compareSeries([18, 16, 14, 12], exact).trend).toBe('improving');
  });
});

describe('sentences', () => {
  const opts = { direction: 'higher_is_better' as const };
  it('says best, weakest, or how many it beats', () => {
    expect(rankSentence(compareSeries([1, 2, 9], opts))).toBe('The best of the last 3 weeks.');
    expect(rankSentence(compareSeries([5, 9, 1], opts))).toBe('The weakest of the last 3 weeks.');
    expect(rankSentence(compareSeries([5, 9, 7, 6], opts))).toBe('Better than 1 of the 3 earlier weeks.');
    expect(rankSentence(compareSeries([5], opts))).toBeNull();
  });
  it('only mentions a streak of two or more', () => {
    expect(streakSentence(compareSeries([1, 2, 3, 4], opts))).toBe('Improving for 3 weeks in a row.');
    expect(streakSentence(compareSeries([4, 3, 2], opts))).toBe('Slipping for 2 weeks in a row.');
    expect(streakSentence(compareSeries([4, 3], opts))).toBeNull();
  });
});

describe('weekStatuses', () => {
  it('marks each week against the aim and leaves gaps as waiting', () => {
    expect(weekStatuses([40, null, 5], 30, 'higher_is_better')).toEqual(['on_track', 'waiting', 'off_track']);
  });
});

describe('areaMovement', () => {
  it('counts how many measures moved the right way', () => {
    const m = (history: (number | null)[], direction: 'higher_is_better' | 'lower_is_better' = 'higher_is_better') => ({ history, direction, target: 10 });
    expect(areaMovement([m([1, 2]), m([3, 2]), m([2, 2]), m([null, 2]), m([5, 2], 'lower_is_better'), m([1, null])])).toEqual({ better: 2, worse: 1, same: 1, unknown: 2 });
  });

  it('does not compare with an older week when the week straight before has no number', () => {
    expect(areaMovement([{ history: [1, null, 2], direction: 'higher_is_better', target: 5 }])).toEqual({ better: 0, worse: 0, same: 0, unknown: 1 });
  });
});

describe('groupMoves', () => {
  const groups = [
    { name: 'Ana', series: [10, 20, 30] },
    { name: 'Ben', series: [30, 25, 20] },
    { name: 'Cy', series: [null, null, 15] },
    { name: 'Di', series: [5, 5, null] },
  ];

  it('compares each group with its own last number and earlier average, best first and gaps last', () => {
    const moves = groupMoves(groups, 'higher_is_better');
    expect(moves.map((m) => m.name)).toEqual(['Ana', 'Ben', 'Cy', 'Di']);
    expect(moves[0]).toMatchObject({ current: 30, previous: 20, delta: 10, verdict: 'better', earlierAverage: 15 });
    expect(moves[1]).toMatchObject({ delta: -5, verdict: 'worse' });
    expect(moves[2]).toMatchObject({ current: 15, previous: null, delta: null, verdict: null });
    expect(moves[3].current).toBeNull();
  });

  it('gives no change when the period straight before has no number, but still gives the earlier average', () => {
    const [move] = groupMoves([{ name: 'Eli', series: [10, 20, null, 30] }], 'higher_is_better');
    expect(move).toMatchObject({ current: 30, previous: null, delta: null, verdict: null, earlierAverage: 15 });
  });

  it('puts the lowest first when lower is better', () => {
    expect(groupMoves(groups, 'lower_is_better').map((m) => m.name).slice(0, 2)).toEqual(['Cy', 'Ben']);
  });

  it('finds the biggest climbers and fallers by gain', () => {
    const { climbers, fallers } = biggestMovers(groupMoves(groups, 'higher_is_better'));
    expect(climbers.map((m) => m.name)).toEqual(['Ana']);
    expect(fallers.map((m) => m.name)).toEqual(['Ben']);
  });
});
