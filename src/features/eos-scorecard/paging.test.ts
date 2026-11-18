import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from './paging';

const source = (count: number) => Array.from({ length: count }, (_, i) => i);
const pager = (rows: number[]) => vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));

describe('fetchAllPages', () => {
  it('reads past the single-request row cap', async () => {
    const fetchPage = pager(source(2500));
    const all = await fetchAllPages(fetchPage, 1000);
    expect(all).toHaveLength(2500);
    expect(all[2499]).toBe(2499);
    expect(fetchPage.mock.calls.map(([from, to]) => [from, to])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops after one request when everything fits in a page', async () => {
    const fetchPage = pager(source(10));
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(10);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('asks again when the last page is exactly full, then stops on the empty one', async () => {
    const fetchPage = pager(source(2000));
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(2000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('throws the database error instead of returning part of the answer', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({ data: source(1000), error: null }).mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchAllPages(fetchPage, 1000)).rejects.toThrow('boom');
  });

  it('throws rather than loop forever', async () => {
    await expect(fetchAllPages(async () => ({ data: source(5), error: null }), 5, 3)).rejects.toThrow('Too many rows');
  });
});
