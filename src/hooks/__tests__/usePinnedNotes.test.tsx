/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

const setNotePinnedMock = vi.fn();
vi.mock('@/lib/notePin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notePin')>();
  return { ...actual, setNotePinned: (...args: unknown[]) => setNotePinnedMock(...args) };
});

const db = {
  notes: [] as Record<string, unknown>[],
  users: [] as Record<string, unknown>[],
  packages: [] as Record<string, unknown>[],
};

vi.mock('@/integrations/supabase/client', () => {
  // Thenable query builder: every chained call returns the builder, awaiting it
  // resolves with the table's rows.
  const builderFor = (table: keyof typeof db) => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) builder[m] = () => builder;
    builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: db[table], error: null });
    return builder;
  };
  return { supabase: { from: (table: keyof typeof db) => builderFor(table) } };
});

import { usePinnedNotes, useSetNotePinned } from '@/hooks/usePinnedNotes';
import { pinnedNotesKey } from '@/lib/notePin';

const TENANT = 7547;

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  toastSpy.mockClear();
  setNotePinnedMock.mockReset();
  db.notes = [
    {
      id: 'n-pkg',
      title: 'Testing the new RBAC',
      note_details: '<p>body</p>',
      parent_type: 'package_instance',
      parent_id: 15201,
      package_id: 5,
      created_by: 'u-1',
      updated_at: '2026-06-10T00:00:00Z',
    },
    {
      id: 'n-tenant',
      title: 'Client level',
      note_details: '<p>x</p>',
      parent_type: 'tenant',
      parent_id: TENANT,
      package_id: null,
      created_by: 'u-1',
      updated_at: '2026-06-09T00:00:00Z',
    },
  ];
  db.users = [{ user_uuid: 'u-1', first_name: 'Ada', last_name: 'Lovelace', avatar_url: null }];
  db.packages = [{ id: 5, name: 'Membership' }];
});

describe('usePinnedNotes', () => {
  it('returns client- and package-level pins with package name and creator resolved', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePinnedNotes(TENANT), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    const [pkgNote, tenantNote] = result.current.data!;
    expect(pkgNote).toMatchObject({ id: 'n-pkg', package_name: 'Membership', creator: { first_name: 'Ada' } });
    expect(tenantNote).toMatchObject({ id: 'n-tenant', package_name: null });
  });

  it('does not query without a tenant', () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePinnedNotes(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useSetNotePinned', () => {
  async function seeded() {
    const ctx = makeWrapper();
    const list = renderHook(() => usePinnedNotes(TENANT), { wrapper: ctx.wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(2));
    const mutation = renderHook(() => useSetNotePinned(TENANT), { wrapper: ctx.wrapper });
    return { ...ctx, list, mutation };
  }

  it('unpins optimistically, calls the write with the TARGET state, and toasts "unpinned"', async () => {
    setNotePinnedMock.mockResolvedValue(undefined);
    const { queryClient, mutation } = await seeded();
    // Once settled the hook refetches; make that refetch reflect the write.
    db.notes = db.notes.filter((n) => n.id !== 'n-pkg');

    await act(async () => {
      await mutation.result.current.mutateAsync({ noteId: 'n-pkg', pinned: false });
    });

    expect(setNotePinnedMock).toHaveBeenCalledWith('n-pkg', false);
    expect(toastSpy).toHaveBeenCalledWith({ title: 'Note unpinned' });
    await waitFor(() =>
      expect(queryClient.getQueryData<{ id: string }[]>(pinnedNotesKey(TENANT))?.map((n) => n.id)).toEqual(['n-tenant'])
    );
  });

  it('rolls the list back and shows an error toast when the write fails', async () => {
    setNotePinnedMock.mockRejectedValue(new Error('not permitted'));
    const { queryClient, mutation } = await seeded();

    await act(async () => {
      await mutation.result.current.mutateAsync({ noteId: 'n-pkg', pinned: false }).catch(() => undefined);
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not unpin note', description: 'not permitted', variant: 'destructive' })
    );
    // The refetch after failure returns the unchanged server state, so the note is still pinned.
    await waitFor(() =>
      expect(queryClient.getQueryData<{ id: string }[]>(pinnedNotesKey(TENANT))?.map((n) => n.id)).toContain('n-pkg')
    );
    expect(toastSpy).not.toHaveBeenCalledWith({ title: 'Note unpinned' });
  });

  it('toasts "pinned" when pinning', async () => {
    setNotePinnedMock.mockResolvedValue(undefined);
    const { mutation } = await seeded();

    await act(async () => {
      await mutation.result.current.mutateAsync({ noteId: 'n-x', pinned: true });
    });

    expect(setNotePinnedMock).toHaveBeenCalledWith('n-x', true);
    expect(toastSpy).toHaveBeenCalledWith({ title: 'Note pinned' });
  });
});
