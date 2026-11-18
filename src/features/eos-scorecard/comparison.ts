/**
 * Comparison maths shared by the Client activity report, the scorecard Full Report and the L10 deck.
 *
 * A series is a list of numbers, oldest first, ending with the period under review. A null is a period with no number,
 * and stays a gap. Every judgement ("better", "worse") respects the measure's direction, so a fall in "never signed in"
 * reads as good news and a fall in "certificates" does not.
 */
import type { MetricDirection } from '@/types/scorecard';
import { statusOf, type PlainStatus } from './scorecardView';

export type Verdict = 'better' | 'worse' | 'same';
export type Points = readonly (number | null)[];

const EPS = 1e-9;
const mean = (values: readonly number[]) => values.reduce((total, v) => total + v, 0) / values.length;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** How good a number is for this measure, so any two numbers can be ranked. Higher is better. */
function goodness(value: number, direction: MetricDirection, target: number | null): number {
  if (direction === 'lower_is_better') return -value;
  if (direction === 'equals_target' && target !== null) return -Math.abs(value - target);
  return value;
}

/** Whether moving from one number to another is good news for this measure. */
export function verdictOf(from: number, to: number, direction: MetricDirection, target: number | null = null): Verdict {
  const gain = goodness(to, direction, target) - goodness(from, direction, target);
  if (Math.abs(gain) < EPS) return 'same';
  return gain > 0 ? 'better' : 'worse';
}

/** "+3 points", "-$40", "+2". The sign is the arithmetic; the verdict says whether it is good. */
export function signedAmount(unit: string, delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const size = Math.abs(round1(delta));
  const plain = Number.isInteger(size) ? size.toLocaleString('en-AU') : size.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (unit === '$') return `${sign}$${Math.round(size).toLocaleString('en-AU')}`;
  if (unit === '%') return `${sign}${plain} ${size === 1 ? 'point' : 'points'}`;
  return `${sign}${plain}`;
}

export type BenchmarkKey = 'previous' | 'recent' | 'earlier' | 'best' | 'worst' | 'aim';

export interface Benchmark {
  key: BenchmarkKey;
  label: string;
  value: number;
  /** The current number minus this one. */
  delta: number;
  verdict: Verdict;
}

export interface SeriesComparison {
  current: number | null;
  /** How many periods have a number, the current one included. */
  count: number;
  benchmarks: Benchmark[];
  /** 1 is the best of the periods that have a number. Null when there is nothing to rank against. */
  rank: { place: number; of: number } | null;
  /** How many of the earlier periods the current number beats. */
  betterThan: number;
  /** Earlier periods that have a number. */
  earlier: number;
  /** Consecutive moves in the same direction, ending now. */
  streak: { verdict: 'better' | 'worse'; steps: number } | null;
  /** The shape over the whole series. Null with fewer than three numbers. */
  trend: 'improving' | 'slipping' | 'steady' | null;
}

export interface CompareOptions {
  direction: MetricDirection;
  target?: number | null;
  /** What one step of the series is called: week, month, year or period. */
  noun?: string;
}

const NO_NUMBERS: SeriesComparison = { current: null, count: 0, benchmarks: [], rank: null, betterThan: 0, earlier: 0, streak: null, trend: null };

/** The current number against everything that came before it. */
export function compareSeries(points: Points, { direction, target = null, noun = 'week' }: CompareOptions): SeriesComparison {
  const last = points.length - 1;
  const current = last >= 0 ? points[last] : null;
  const numbers = points.filter((v): v is number => v !== null);
  if (numbers.length === 0) return NO_NUMBERS;
  if (current === null) return { ...NO_NUMBERS, count: numbers.length, earlier: numbers.length };

  const earlierIdx = points.slice(0, last).flatMap((v, i) => (v === null ? [] : [i]));
  const earlier = earlierIdx.map((i) => points[i] as number);
  const score = (v: number) => goodness(v, direction, target);
  const benchmarks: Benchmark[] = [];
  const add = (key: BenchmarkKey, label: string, value: number) => benchmarks.push({ key, label, value, delta: current - value, verdict: verdictOf(value, current, direction, target) });
  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;

  if (earlier.length > 0) {
    const gap = last - earlierIdx[earlierIdx.length - 1];
    add('previous', gap === 1 ? `Last ${noun}` : `${plural(gap)} ago`, earlier[earlier.length - 1]);
    if (earlier.length >= 2) {
      const recent = earlier.slice(-4);
      add('recent', `Average, previous ${plural(recent.length)}`, mean(recent));
    }
    if (earlier.length > 4) add('earlier', `Average, all ${earlier.length} earlier ${noun}s`, mean(earlier));
    const best = earlier.reduce((a, b) => (score(b) > score(a) ? b : a));
    const worst = earlier.reduce((a, b) => (score(b) < score(a) ? b : a));
    add('best', `Best earlier ${noun}`, best);
    if (score(worst) < score(best) - EPS) add('worst', `Weakest earlier ${noun}`, worst);
  }
  if (target !== null) add('aim', 'The aim', target);

  const betterThan = earlier.filter((v) => score(current) > score(v) + EPS).length;
  const rank = earlier.length === 0 ? null : { place: 1 + earlier.filter((v) => score(v) > score(current) + EPS).length, of: numbers.length };

  let streak: SeriesComparison['streak'] = null;
  for (let i = numbers.length - 1; i > 0; i--) {
    const v = verdictOf(numbers[i - 1], numbers[i], direction, target);
    if (v === 'same') break;
    if (streak && streak.verdict !== v) break;
    streak = { verdict: v, steps: (streak?.steps ?? 0) + 1 };
  }

  let trend: SeriesComparison['trend'] = null;
  if (numbers.length >= 3) {
    const xs = numbers.map((_, i) => i);
    const mx = mean(xs);
    const my = mean(numbers);
    const slope = xs.reduce((t, x, i) => t + (x - mx) * (numbers[i] - my), 0) / xs.reduce((t, x) => t + (x - mx) ** 2, 0);
    const range = Math.max(...numbers) - Math.min(...numbers);
    const rise = slope * (numbers.length - 1);
    if (range < EPS || Math.abs(rise) / range < 0.25) trend = 'steady';
    else trend = verdictOf(0, rise, direction, target) === 'better' ? 'improving' : 'slipping';
  }

  return { current, count: numbers.length, benchmarks, rank, betterThan, earlier: earlier.length, streak, trend };
}

/** One plain sentence on where the current number sits among the others. Null when there is nothing to say. */
export function rankSentence(c: SeriesComparison, noun = 'week'): string | null {
  if (!c.rank) return null;
  const word = `${noun}s`;
  if (c.rank.of < 2) return null;
  if (c.rank.place === 1) return `The best of the last ${c.rank.of} ${word}.`;
  if (c.rank.place === c.rank.of) return `The weakest of the last ${c.rank.of} ${word}.`;
  return `Better than ${c.betterThan} of the ${c.earlier} earlier ${word}.`;
}

/** "Improving for 3 weeks in a row", "Slipping for 2 weeks in a row", or null. */
export function streakSentence(c: SeriesComparison, noun = 'week'): string | null {
  if (!c.streak || c.streak.steps < 2) return null;
  return `${c.streak.verdict === 'better' ? 'Improving' : 'Slipping'} for ${c.streak.steps} ${noun}s in a row.`;
}

/** The status each period would have had against the aim, oldest first. Gaps are 'waiting'. */
export function weekStatuses(points: Points, target: number, direction: MetricDirection): PlainStatus[] {
  return points.map((v) => statusOf(v, target, direction));
}

export interface Movement {
  better: number;
  worse: number;
  same: number;
  /** Measures with no number this period or nothing to compare with. */
  unknown: number;
}

/** How many measures moved the right way since the last period that had a number. */
export function areaMovement(measures: readonly { history: Points; direction: MetricDirection; target: number }[]): Movement {
  const out: Movement = { better: 0, worse: 0, same: 0, unknown: 0 };
  for (const m of measures) {
    const current = m.history[m.history.length - 1];
    const before = m.history.slice(0, -1).filter((v): v is number => v !== null).pop();
    if (current === null || current === undefined || before === undefined) out.unknown += 1;
    else out[verdictOf(before, current, m.direction, m.target)] += 1;
  }
  return out;
}

export interface GroupSeries {
  name: string;
  series: Points;
}

export interface GroupMove {
  name: string;
  series: Points;
  current: number | null;
  previous: number | null;
  /** current minus previous. */
  delta: number | null;
  verdict: Verdict | null;
  /** Positive when the group moved the right way, in the measure's own units. */
  gain: number | null;
  earlierAverage: number | null;
}

/** Each group's latest number against the one before and its own earlier average, best first and gaps last. */
export function groupMoves(groups: readonly GroupSeries[], direction: MetricDirection, target: number | null = null): GroupMove[] {
  const moves = groups.map<GroupMove>((g) => {
    const last = g.series.length - 1;
    const current = last >= 0 ? g.series[last] : null;
    const earlier = g.series.slice(0, last).filter((v): v is number => v !== null);
    const previous = earlier.length > 0 ? earlier[earlier.length - 1] : null;
    const usable = current !== null && previous !== null;
    return {
      name: g.name,
      series: g.series,
      current,
      previous,
      delta: usable ? current - previous : null,
      verdict: usable ? verdictOf(previous, current, direction, target) : null,
      gain: usable ? goodness(current, direction, target) - goodness(previous, direction, target) : null,
      earlierAverage: earlier.length > 0 ? mean(earlier) : null,
    };
  });
  return moves.sort((a, b) => {
    if ((a.current === null) !== (b.current === null)) return a.current === null ? 1 : -1;
    const byNumber = a.current !== null && b.current !== null ? goodness(b.current, direction, target) - goodness(a.current, direction, target) : 0;
    return byNumber || a.name.localeCompare(b.name);
  });
}

/** The groups that moved the right way most, and the way they should not have, biggest first. */
export function biggestMovers(moves: readonly GroupMove[], n = 5): { climbers: GroupMove[]; fallers: GroupMove[] } {
  const withGain = moves.filter((m) => m.gain !== null && Math.abs(m.gain) > EPS);
  return {
    climbers: withGain.filter((m) => (m.gain as number) > 0).sort((a, b) => (b.gain as number) - (a.gain as number) || a.name.localeCompare(b.name)).slice(0, n),
    fallers: withGain.filter((m) => (m.gain as number) < 0).sort((a, b) => (a.gain as number) - (b.gain as number) || a.name.localeCompare(b.name)).slice(0, n),
  };
}
