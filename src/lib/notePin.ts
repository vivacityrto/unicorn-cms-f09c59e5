import { supabase } from '@/integrations/supabase/client';

/**
 * The single write path for pinning/unpinning a note. Every surface (Notes tab,
 * package notes, Timeline, pinned-notes card) goes through this so the pin
 * state has one source of truth: `notes.is_pinned`.
 *
 * `pinned` is always the TARGET state, never the current one.
 *
 * RLS can turn an update into a silent 0-row no-op (no error), so the result
 * is checked — otherwise a user without permission would see a "pinned" toast
 * while nothing changed.
 */
export async function setNotePinned(noteId: string, pinned: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('notes')
    .update({ is_pinned: pinned, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Note not found, or you do not have permission to change it');
  }
}

/** Query key for the tenant-wide pinned-notes list (see usePinnedNotes). */
export const pinnedNotesKey = (tenantId: number | null) => ['pinned-notes', tenantId] as const;

/** Pinned notes first, then newest first — the order every notes list uses. */
export function sortPinnedFirst<T extends { is_pinned: boolean; created_at: string }>(notes: T[]): T[] {
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
