import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { RockNote, RockNoteSummary } from '@/utils/rockNotes';

const NOTE_COLUMNS = 'id, rock_id, meeting_id, body, source, rock_status, milestones_complete, milestones_total, created_by, created_at';

export interface RockNotesData {
  notes: RockNote[];
  /** Titles of every Rock the notes came from (this one and, when asked, the ones beneath it). */
  rockTitles: Record<string, string>;
  authorNames: Record<string, string>;
  /** True when notes from Rocks beneath this one are included. */
  includesDescendants: boolean;
}

function messageOf(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

/**
 * The notes on a Rock, newest first by the display helpers. With `includeDescendants` a Company
 * or Team Rock also gets the notes written on the Team and Individual Rocks delivering it, tagged
 * by Rock, so one place shows how the whole thing is moving. Read rules are the Rock's own.
 */
export function useRockNotes(rockId: string | undefined, includeDescendants = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-notes', rockId, includeDescendants],
    queryFn: async (): Promise<RockNotesData> => {
      const { data: self, error: selfError } = await supabase.from('eos_rocks').select('id, title').eq('id', rockId!).single();
      if (selfError) throw selfError;
      const titles: Record<string, string> = { [self.id]: self.title };

      if (includeDescendants) {
        const { data: children, error: childrenError } = await supabase
          .from('eos_rocks')
          .select('id, title')
          .eq('parent_rock_id', rockId!)
          .is('archived_at', null);
        if (childrenError) throw childrenError;
        for (const child of children ?? []) titles[child.id] = child.title;
        if ((children ?? []).length > 0) {
          const { data: grandchildren, error: grandError } = await supabase
            .from('eos_rocks')
            .select('id, title')
            .in('parent_rock_id', (children ?? []).map(c => c.id))
            .is('archived_at', null);
          if (grandError) throw grandError;
          for (const grandchild of grandchildren ?? []) titles[grandchild.id] = grandchild.title;
        }
      }

      const { data, error } = await supabase
        .from('eos_rock_notes')
        .select(NOTE_COLUMNS)
        .in('rock_id', Object.keys(titles))
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const notes = (data ?? []) as RockNote[];

      const authorIds = Array.from(new Set(notes.map(n => n.created_by).filter((id): id is string => !!id)));
      const authorNames: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: people } = await supabase.from('users').select('user_uuid, first_name, last_name').in('user_uuid', authorIds);
        for (const person of people ?? []) {
          authorNames[person.user_uuid] = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Team member';
        }
      }
      return { notes, rockTitles: titles, authorNames, includesDescendants: Object.keys(titles).length > 1 };
    },
    enabled: !!profile && !!rockId,
  });
}

export interface AddNoteInput {
  rockId: string;
  body: string;
  meetingId?: string;
  source: 'typed' | 'dictated';
}

/** Adds a note through add_rock_note(), which records the Rock's status and progress at that moment. */
export function useAddRockNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddNoteInput) => {
      const { data, error } = await supabase.rpc('add_rock_note', {
        p_rock_id: input.rockId,
        p_body: input.body,
        p_meeting_id: input.meetingId,
        p_source: input.source,
      });
      if (error) throw error;
      return data as { note_id: string; created_at: string; duplicate: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-rock-notes'] });
    },
    // No success toast: the note appears in the list, and a toast would take the first Escape press in the Discuss view.
    onError: error => toast({ title: 'Could not save the note', description: messageOf(error, 'The note was not saved. Your text is still in the box.'), variant: 'destructive' }),
  });
}

/** The newest AI summary of a Rock's notes, if one has been written. */
export function useRockNoteSummary(rockId: string | undefined) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-note-summary', rockId],
    queryFn: async (): Promise<RockNoteSummary | null> => {
      const { data, error } = await supabase
        .from('eos_rock_note_summaries')
        .select('id, rock_id, summary, status_signal, suggested_todos, notes_through, note_count, rocks_included, generated_at')
        .eq('rock_id', rockId!)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? ({ ...data, suggested_todos: Array.isArray(data.suggested_todos) ? data.suggested_todos : [] } as unknown as RockNoteSummary) : null;
    },
    enabled: !!profile && !!rockId,
  });
}

/** Asks the summarise-rock-notes function for a fresh summary. It only stores a summary; nothing else is created. */
export function useSummariseRockNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rockId: string; force?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('summarise-rock-notes', { body: { rock_id: input.rockId, force: input.force === true } });
      if (error) {
        // The function answers with a readable message in the body; surface it rather than a generic one.
        const context = (error as { context?: Response }).context;
        const detail = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error ?? error.message);
      }
      return data as { summary: RockNoteSummary; cached: boolean };
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ['eos-rock-note-summary', input.rockId] });
    },
    onError: error => toast({ title: 'Could not write the summary', description: messageOf(error, 'Please try again.'), variant: 'destructive' }),
  });
}

/**
 * Creates a To-Do the user has chosen to create from a suggested one. It is a plain To-Do for the
 * signed-in person, attached to the meeting when there is one.
 */
export function useCreateTodoFromNote() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; rockTitle: string; rockTenantId: number; meetingId?: string; dueDate: string }) => {
      // A To-Do made in a meeting belongs to that meeting's tenant, as the meeting's own To-Dos do.
      let tenantId = input.rockTenantId;
      if (input.meetingId) {
        const { data: meeting } = await supabase.from('eos_meetings').select('tenant_id').eq('id', input.meetingId).maybeSingle();
        if (meeting) tenantId = meeting.tenant_id;
      }
      const { data, error } = await supabase
        .from('eos_todos')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          description: `From the notes on the Rock "${input.rockTitle}".`,
          owner_id: profile?.user_uuid,
          created_by: profile?.user_uuid,
          meeting_id: input.meetingId,
          due_date: input.dueDate,
          status: 'Open',
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-todos'] });
      queryClient.invalidateQueries({ queryKey: ['eos-todos'] });
    },
    onError: error => toast({ title: 'Could not create the To-Do', description: messageOf(error, 'Nothing was created.'), variant: 'destructive' }),
  });
}
