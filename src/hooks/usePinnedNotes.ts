import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { pinnedNotesKey, setNotePinned } from '@/lib/notePin';

export interface PinnedNoteItem {
  id: string;
  title: string | null;
  note_details: string;
  parent_type: string | null;
  parent_id: number | null;
  package_id: number | null;
  /** Resolved from packages.name when the note belongs to a package. */
  package_name: string | null;
  created_by: string;
  updated_at: string;
  creator?: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
}

/**
 * Every pinned note for a tenant — client-level and package-level together —
 * from the `notes` table. One query shared (via the react-query key) by the
 * Overview/Timeline pinned card, the Timeline pin buttons and every package
 * card, so a pin shows up everywhere without each surface fetching its own.
 */
export function usePinnedNotes(tenantId: number | null) {
  return useQuery({
    queryKey: pinnedNotesKey(tenantId),
    enabled: tenantId != null,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PinnedNoteItem[]> => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, note_details, parent_type, parent_id, package_id, created_by, updated_at')
        .eq('tenant_id', tenantId as number)
        .eq('is_pinned', true)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const creatorIds = [...new Set(rows.map((n) => n.created_by).filter(Boolean))];
      const packageIds = [...new Set(rows.map((n) => n.package_id).filter((id): id is number => id != null))];

      const [usersRes, packagesRes] = await Promise.all([
        creatorIds.length > 0
          ? supabase.from('users').select('user_uuid, first_name, last_name, avatar_url').in('user_uuid', creatorIds)
          : Promise.resolve({ data: [] as { user_uuid: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[] }),
        packageIds.length > 0
          ? supabase.from('packages').select('id, name').in('id', packageIds)
          : Promise.resolve({ data: [] as { id: number; name: string }[] }),
      ]);

      const creators = new Map((usersRes.data ?? []).map((u) => [u.user_uuid, u]));
      const packageNames = new Map((packagesRes.data ?? []).map((p) => [p.id, p.name]));

      return rows.map((n) => {
        const creator = creators.get(n.created_by);
        return {
          ...n,
          package_name: n.package_id != null ? packageNames.get(n.package_id) ?? null : null,
          creator: creator
            ? { first_name: creator.first_name, last_name: creator.last_name, avatar_url: creator.avatar_url }
            : undefined,
        };
      });
    },
  });
}

interface SetPinnedVars {
  noteId: string;
  /** Target state — true to pin, false to unpin. */
  pinned: boolean;
}

/**
 * Pin/unpin mutation. Unpinning updates the shared list instantly and rolls
 * back if the write fails; pinning waits for the refetch (the list doesn't
 * hold the note's content yet). Toasts say "pinned"/"unpinned", not a generic
 * "updated".
 */
export function useSetNotePinned(tenantId: number | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = pinnedNotesKey(tenantId);

  return useMutation({
    mutationFn: ({ noteId, pinned }: SetPinnedVars) => setNotePinned(noteId, pinned),
    onMutate: async ({ noteId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PinnedNoteItem[]>(key);
      if (!pinned && previous) {
        queryClient.setQueryData<PinnedNoteItem[]>(key, previous.filter((n) => n.id !== noteId));
      }
      return { previous };
    },
    onError: (error, { pinned }, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast({
        title: pinned ? 'Could not pin note' : 'Could not unpin note',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
    onSuccess: (_data, { pinned }) => {
      toast({ title: pinned ? 'Note pinned' : 'Note unpinned' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
