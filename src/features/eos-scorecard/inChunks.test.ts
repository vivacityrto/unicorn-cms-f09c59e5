import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/features/eos-cst/useCstReport', () => ({ useCstReport: () => ({ data: undefined }) }));
vi.mock('@/features/eos-scorecard/useOwnerNames', () => ({ useOwnerNames: () => ({}) }));

import { inChunks } from './useMetricReport';

const answer = <T,>(data: T[], error: { message: string } | null = null) => ({ then: (resolve: (v: { data: T[] | null; error: { message: string } | null }) => unknown) => Promise.resolve({ data: error ? null : data, error }).then(resolve) }) as never;

describe('inChunks', () => {
  it('splits a long list so no single request carries more than 150 ids, and joins the answers in order', async () => {
    const ids = Array.from({ length: 400 }, (_, i) => `u${i}`);
    const sizes: number[] = [];
    const out = await inChunks(ids, (part) => {
      sizes.push(part.length);
      return answer(part.map((id) => ({ id })));
    });
    expect(sizes).toEqual([150, 150, 100]);
    expect(out).toHaveLength(400);
    expect(out[0]).toEqual({ id: 'u0' });
    expect(out[399]).toEqual({ id: 'u399' });
  });

  it('makes no request for an empty list', async () => {
    const run = vi.fn();
    expect(await inChunks([], run)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('fails the whole lookup if any batch fails, rather than returning part of an answer', async () => {
    await expect(inChunks(['a', 'b'], () => answer([], { message: 'boom' }))).rejects.toThrow('boom');
  });
});
