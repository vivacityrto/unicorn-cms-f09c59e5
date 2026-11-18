import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compareSeries } from '@/features/eos-scorecard/comparison';
import { BenchmarkBars, DeltaChip, TrendChart } from './CompareCharts';
import { AreaMovement, CompareLine, placeText } from './CompareLine';

const higher = { direction: 'higher_is_better' as const, unit: '%', target: 30 };

describe('DeltaChip', () => {
  it('says the change in words as well as colour', () => {
    render(<DeltaChip unit="%" delta={-3} verdict="worse" />);
    expect(screen.getByText(/-3 points/)).toBeInTheDocument();
    expect(screen.getByText('(worse)')).toBeInTheDocument();
  });
  it('shows a dash when there is nothing to compare', () => {
    render(<DeltaChip unit="%" delta={null} verdict={null} />);
    expect(screen.getByText('–')).toBeInTheDocument();
  });
});

describe('CompareLine', () => {
  it('shows the change on last week, the average before and where it ranks', () => {
    render(<CompareLine measure={{ ...higher, history: [10, 20, 15, 30, 25] }} />);
    expect(screen.getByText(/-5 points/)).toBeInTheDocument();
    expect(screen.getByText('vs last week')).toBeInTheDocument();
    expect(screen.getByText(/Avg 18\.8%/)).toBeInTheDocument();
    expect(screen.getByText('2nd best of 5')).toBeInTheDocument();
  });
  it('says so when there is only one number', () => {
    render(<CompareLine measure={{ ...higher, history: [null, null, 12] }} />);
    expect(screen.getByText(/nothing to compare with yet/)).toBeInTheDocument();
  });
  it('shows nothing when this week has no number', () => {
    const { container } = render(<CompareLine measure={{ ...higher, history: [10, 12, null] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('placeText', () => {
  it('names the extremes and otherwise the place', () => {
    expect(placeText(compareSeries([1, 2, 9], { direction: 'higher_is_better' }))).toBe('Best of 3');
    expect(placeText(compareSeries([5, 9, 1], { direction: 'higher_is_better' }))).toBe('Weakest of 3');
    expect(placeText(compareSeries([5, 9], { direction: 'higher_is_better' }))).toBeNull();
  });
});

describe('AreaMovement', () => {
  it('counts the measures that got better and worse', () => {
    render(<AreaMovement measures={[{ history: [1, 2], direction: 'higher_is_better', target: 5 }, { history: [3, 2], direction: 'higher_is_better', target: 5 }, { history: [4, 1], direction: 'lower_is_better', target: 5 }]} />);
    expect(screen.getByText('2 better')).toBeInTheDocument();
    expect(screen.getByText('1 worse')).toBeInTheDocument();
  });
});

describe('BenchmarkBars', () => {
  it('lists this period and each thing it is compared with', () => {
    const c = compareSeries([10, 20, 30, 25], { direction: 'higher_is_better', target: 28 });
    const { container } = render(<BenchmarkBars comparison={c} unit="" currentLabel="This month" />);
    const list = within(container).getByRole('list');
    expect(within(list).getByText('This month')).toBeInTheDocument();
    expect(within(list).getByText('Last week')).toBeInTheDocument();
    expect(within(list).getByText('The aim')).toBeInTheDocument();
  });
  it('explains when there is nothing earlier', () => {
    render(<BenchmarkBars comparison={compareSeries([5], { direction: 'higher_is_better' })} unit="" />);
    expect(screen.getByText(/nothing earlier to compare/)).toBeInTheDocument();
  });
});

describe('TrendChart', () => {
  it('describes itself to a screen reader, including a gap', () => {
    render(<TrendChart points={[10, null, 14]} labels={['1 Nov', '8 Nov', '15 Nov']} unit="" summary="Certificates over 3 weeks." />);
    expect(screen.getByRole('img', { name: 'Certificates over 3 weeks.' })).toBeInTheDocument();
    expect(screen.getByText(/8 Nov: no number/)).toBeInTheDocument();
  });
  it('says so when there are no numbers', () => {
    render(<TrendChart points={[null, null]} labels={['a', 'b']} unit="" summary="x" />);
    expect(screen.getByText('No numbers yet.')).toBeInTheDocument();
  });
});
