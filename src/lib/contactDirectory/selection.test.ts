import { describe, expect, it } from 'vitest';
import { chunk, summariseSelection } from './selection';

describe('summariseSelection', () => {
  const all = ['a', 'b', 'c', 'd', 'e'];
  const page = ['a', 'b'];

  it('offers select-all-matching only once the whole page is ticked and more rows match', () => {
    expect(summariseSelection(all, page, new Set()).canSelectAllMatching).toBe(false);
    expect(summariseSelection(all, page, new Set(['a'])).canSelectAllMatching).toBe(false);
    const full = summariseSelection(all, page, new Set(['a', 'b']));
    expect(full).toEqual({ pageFullySelected: true, allMatchingSelected: false, canSelectAllMatching: true });
  });

  it('stops offering it once every matching row is selected', () => {
    const s = summariseSelection(all, page, new Set(all));
    expect(s).toEqual({ pageFullySelected: true, allMatchingSelected: true, canSelectAllMatching: false });
  });

  it('does not offer it when everything already fits on one page', () => {
    expect(summariseSelection(page, page, new Set(page)).canSelectAllMatching).toBe(false);
  });

  it('handles an empty result', () => {
    expect(summariseSelection([], [], new Set(['x']))).toEqual({
      pageFullySelected: false,
      allMatchingSelected: false,
      canSelectAllMatching: false,
    });
  });
});

describe('chunk', () => {
  it('splits into fixed-size pieces', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
