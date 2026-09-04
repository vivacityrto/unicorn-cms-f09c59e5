import { useQueryClient, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeNoteHtml } from './sanitizeNoteHtml';
import { ChecklistItem, DailyNote, NoteColor, newItemId } from './types';
import { noteQueryKeys } from './useDailyNotes';
import type { Json, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

const TABLE = 'user_daily_notes';

interface CreateInput {
  userId: string;
  date: Date;
  title: string;
  color: NoteColor;
  body: string;
  items: ChecklistItem[];
}
interface UpdateInput extends Omit<CreateInput, 'userId' | 'date'> { id: string; userId: string; date: Date; }

function isEmpty(title: string, body: string, items: ChecklistItem[]): boolean {
  const strippedBody = body.replace(/<[^>]*>/g, '').trim();
  const hasItems = items.some((i) => i.text.trim().length > 0);
  return title.trim().length === 0 && strippedBody.length === 0 && !hasItems;
}

function normalizeItems(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .map((i) => ({ id: i.id || newItemId(), text: i.text.trim(), done: !!i.done }))
    .filter((i) => i.text.length > 0);
}

export function useNoteMutations(userId: string | undefined) {
  const qc = useQueryClient();

  const invalidate = (dateStr?: string) => {
    qc.invalidateQueries({ queryKey: ['user_daily_notes', userId ?? ''] });
    if (dateStr) {
      qc.invalidateQueries({ queryKey: noteQueryKeys.date(userId ?? '', dateStr) });
    }
  };

  const createNote = useMutation({
    mutationFn: async (input: CreateInput) => {
      if (isEmpty(input.title, input.body, input.items)) {
        return { skipped: true as const };
      }
      const payload: TablesInsert<'user_daily_notes'> = {
        user_id: input.userId,
        note_date: format(input.date, 'yyyy-MM-dd'),
        title: input.title.trim(),
        color: input.color,
        body: sanitizeNoteHtml(input.body),
        items: normalizeItems(input.items) as unknown as Json,
        content: '',
      };
      const { error } = await supabase.from(TABLE).insert(payload);
      if (error) throw error;
      return { skipped: false as const };
    },
    onSuccess: (res, vars) => {
      invalidate(format(vars.date, 'yyyy-MM-dd'));
      if (!res.skipped) toast.success('Note added');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to add note'),
  });

  const updateNote = useMutation({
    mutationFn: async (input: UpdateInput) => {
      const dateStr = format(input.date, 'yyyy-MM-dd');
      if (isEmpty(input.title, input.body, input.items)) {
        const { error } = await supabase.from(TABLE).delete().eq('id', input.id);
        if (error) throw error;
        return { deleted: true as const };
      }
      const payload: TablesUpdate<'user_daily_notes'> = {
        title: input.title.trim(),
        color: input.color,
        body: sanitizeNoteHtml(input.body),
        items: normalizeItems(input.items) as unknown as Json,
      };
      const { error } = await supabase.from(TABLE).update(payload).eq('id', input.id);
      if (error) throw error;
      return { deleted: false as const, dateStr };
    },
    onSuccess: (res, vars) => {
      invalidate(format(vars.date, 'yyyy-MM-dd'));
      toast.success(res.deleted ? 'Empty note discarded' : 'Note updated');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to update note'),
  });

  const deleteNote = useMutation({
    mutationFn: async (note: Pick<DailyNote, 'id' | 'note_date'>) => {
      const { error } = await supabase.from(TABLE).delete().eq('id', note.id);
      if (error) throw error;
      return note.note_date;
    },
    onSuccess: (dateStr) => {
      invalidate(dateStr);
      toast.success('Note deleted');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to delete note'),
  });

  const patchItems = useMutation({
    mutationFn: async ({ note, items }: { note: DailyNote; items: ChecklistItem[] }) => {
      // Persist the hydrated structured fields alongside items so legacy notes
      // (whose title/items were derived from `content`) don't revert to "Untitled".
      const payload: TablesUpdate<'user_daily_notes'> = {
        items: normalizeItems(items) as unknown as Json,
        title: note.title.trim(),
        color: note.color,
        body: sanitizeNoteHtml(note.body ?? ''),
        content: '',
      };
      const { error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', note.id);
      if (error) throw error;
      return note.note_date;
    },
    onSuccess: (dateStr) => invalidate(dateStr),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to update checklist'),
  });


  const toggleItem = (note: DailyNote, itemId: string) => {
    const next = note.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it));
    patchItems.mutate({ note, items: next });
  };

  const addItem = (note: DailyNote, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = [...note.items, { id: newItemId(), text: trimmed, done: false }];
    patchItems.mutate({ note, items: next });
  };

  const removeItem = (note: DailyNote, itemId: string) => {
    const next = note.items.filter((it) => it.id !== itemId);
    patchItems.mutate({ note, items: next });
  };

  const deleteCompleted = useMutation({
    mutationFn: async ({ notes, dateStr }: { notes: DailyNote[]; dateStr: string }) => {
      for (const n of notes) {
        const remaining = n.items.filter((it) => !it.done);
        if (remaining.length === n.items.length) continue;
        if (remaining.length === 0 && !n.title.trim() && !n.body.replace(/<[^>]*>/g, '').trim()) {
          const { error } = await supabase.from(TABLE).delete().eq('id', n.id);
          if (error) throw error;
        } else {
          const payload: TablesUpdate<'user_daily_notes'> = {
            items: remaining as unknown as Json,
            title: n.title.trim(),
            color: n.color,
            body: sanitizeNoteHtml(n.body ?? ''),
            content: '',
          };
          const { error } = await supabase
            .from(TABLE)
            .update(payload)
            .eq('id', n.id);
          if (error) throw error;
        }

      }
      return dateStr;
    },
    onSuccess: (dateStr) => {
      invalidate(dateStr);
      toast.success('Completed items cleared');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to clear completed items'),
  });

  const clearAll = useMutation({
    mutationFn: async ({ notes, dateStr }: { notes: DailyNote[]; dateStr: string }) => {
      const ids = notes.map((n) => n.id);
      if (!ids.length) return dateStr;
      const { error } = await supabase.from(TABLE).delete().in('id', ids);
      if (error) throw error;
      return dateStr;
    },
    onSuccess: (dateStr) => {
      invalidate(dateStr);
      toast.success('All notes cleared for this day');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to clear notes'),
  });

  const carryOver = useMutation({
    mutationFn: async ({
      targetDate,
      sourceNotes,
      targetNotes,
    }: {
      targetDate: Date;
      sourceNotes: DailyNote[]; // previous day's notes
      targetNotes: DailyNote[]; // target day's notes (to find existing "Carried Over")
    }) => {
      const targetStr = format(targetDate, 'yyyy-MM-dd');
      const unfinished: ChecklistItem[] = [];
      for (const n of sourceNotes) {
        for (const it of n.items) if (!it.done) unfinished.push({ ...it, id: newItemId() });
      }
      if (unfinished.length === 0) return { targetStr, moved: 0 };

      // Upsert "Carried Over" note on the target date.
      const existing = targetNotes.find(
        (n) => n.color === 'macaron' && n.title.trim().toLowerCase() === 'carried over',
      );
      if (existing) {
        const merged = [...existing.items, ...unfinished];
        const updatePayload: TablesUpdate<'user_daily_notes'> = { items: normalizeItems(merged) as unknown as Json };
        const { error } = await supabase
          .from(TABLE)
          .update(updatePayload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const insertPayload: TablesInsert<'user_daily_notes'> = {
          user_id: sourceNotes[0]?.user_id,
          note_date: targetStr,
          title: 'Carried Over',
          color: 'macaron' as NoteColor,
          body: '',
          items: unfinished as unknown as Json,
          content: '',
        };
        const { error } = await supabase.from(TABLE).insert(insertPayload);
        if (error) throw error;
      }

      // Update source notes: strip unfinished items, delete empties.
      for (const n of sourceNotes) {
        const doneOnly = n.items.filter((it) => it.done);
        if (doneOnly.length === n.items.length) continue; // nothing to remove
        if (
          doneOnly.length === 0 &&
          !n.title.trim() &&
          !n.body.replace(/<[^>]*>/g, '').trim()
        ) {
          const { error } = await supabase.from(TABLE).delete().eq('id', n.id);
          if (error) throw error;
        } else {
          const payload: TablesUpdate<'user_daily_notes'> = {
            items: doneOnly as unknown as Json,
            title: n.title.trim(),
            color: n.color,
            body: sanitizeNoteHtml(n.body ?? ''),
            content: '',
          };
          const { error } = await supabase
            .from(TABLE)
            .update(payload)
            .eq('id', n.id);
          if (error) throw error;
        }

      }

      return { targetStr, moved: unfinished.length };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['user_daily_notes', userId ?? ''] });
      if (res.moved > 0) toast.success(`${res.moved} item${res.moved === 1 ? '' : 's'} carried over`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to carry over items'),
  });

  return {
    createNote,
    updateNote,
    deleteNote,
    toggleItem,
    addItem,
    removeItem,
    deleteCompleted,
    clearAll,
    carryOver,
  };
}
