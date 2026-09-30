/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Result the mocked `notes` update chain resolves with.
let updateResult: { data: { id: string }[] | null; error: { message: string } | null };
const updateSpy = vi.fn();
const eqSpy = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      expect(table).toBe('notes');
      return {
        update: (payload: Record<string, unknown>) => {
          updateSpy(payload);
          return {
            eq: (col: string, val: string) => {
              eqSpy(col, val);
              return { select: async () => updateResult };
            },
          };
        },
      };
    },
  },
}));

import { setNotePinned, sortPinnedFirst, pinnedNotesKey } from '@/lib/notePin';

beforeEach(() => {
  updateSpy.mockClear();
  eqSpy.mockClear();
  updateResult = { data: [{ id: 'n1' }], error: null };
});

describe('setNotePinned', () => {
  it('writes the TARGET state to the note with the given id', async () => {
    await setNotePinned('n1', true);
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ is_pinned: true }));
    expect(eqSpy).toHaveBeenCalledWith('id', 'n1');

    await setNotePinned('n1', false);
    expect(updateSpy).toHaveBeenLastCalledWith(expect.objectContaining({ is_pinned: false }));
  });

  it('throws on a database error', async () => {
    updateResult = { data: null, error: { message: 'boom' } };
    await expect(setNotePinned('n1', true)).rejects.toMatchObject({ message: 'boom' });
  });

  it('throws when RLS turns the update into a silent 0-row no-op', async () => {
    updateResult = { data: [], error: null };
    await expect(setNotePinned('n1', true)).rejects.toThrow(/permission/i);
  });
});

describe('sortPinnedFirst', () => {
  it('puts pinned first, then newest first, without mutating the input', () => {
    const input = [
      { id: 'old-unpinned', is_pinned: false, created_at: '2026-01-01T00:00:00Z' },
      { id: 'new-unpinned', is_pinned: false, created_at: '2026-03-01T00:00:00Z' },
      { id: 'old-pinned', is_pinned: true, created_at: '2026-02-01T00:00:00Z' },
      { id: 'new-pinned', is_pinned: true, created_at: '2026-04-01T00:00:00Z' },
    ];
    const snapshot = [...input];
    expect(sortPinnedFirst(input).map((n) => n.id)).toEqual([
      'new-pinned',
      'old-pinned',
      'new-unpinned',
      'old-unpinned',
    ]);
    expect(input).toEqual(snapshot);
  });
});

describe('pinnedNotesKey', () => {
  it('is scoped per tenant', () => {
    expect(pinnedNotesKey(7547)).not.toEqual(pinnedNotesKey(1076));
  });
});
