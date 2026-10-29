import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { EosTodo, EosTodoWithIssue } from '@/types/eos';

/**
 * To-dos for the live To-Do List segment.
 *
 * With a `tenantId` this returns this meeting's to-dos (any status) PLUS every
 * still-open to-do from earlier meetings of the same tenant, so unfinished items
 * carry over and get reviewed instead of silently dropping off when a new meeting
 * starts. Without a `tenantId` it is just this meeting's to-dos.
 */
export const useMeetingTodos = (meetingId?: string, tenantId?: number) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data: todos, isLoading } = useQuery({
    queryKey: ['meeting-todos', meetingId, tenantId],
    queryFn: async () => {
      // `issue` is the IDS issue a to-do was created from (eos_todos.issue_id), for the row tag.
      let query = supabase.from('eos_todos').select('*, issue:eos_issues!eos_todos_issue_id_fkey(title)');
      query = tenantId
        ? query.or(`meeting_id.eq.${meetingId},and(status.eq.Open,tenant_id.eq.${tenantId})`)
        : query.eq('meeting_id', meetingId!);

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as EosTodoWithIssue[];
    },
    enabled: !!meetingId,
  });

  const createTodo = useMutation({
    mutationFn: async (todo: { 
      meeting_id?: string;
      title: string;
      owner_id: string;
      due_date: string;
      status?: 'Open' | 'Complete' | 'Cancelled';
    }) => {
      const { data, error } = await supabase
        .from('eos_todos')
        .insert([{
          ...todo,
          // Use the meeting's tenant so a to-do always lands in the same tenant
          // the carry-over query above reads from.
          tenant_id: tenantId ?? profile?.tenant_id ?? 6372,
          status: todo.status || 'Open'
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-todos', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-issue-todos'] });
      toast({ title: 'To-do created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating to-do', description: error.message, variant: 'destructive' });
    },
  });

  const updateTodo = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosTodo> & { id: string }) => {
      const updateData: Record<string, unknown> = {};
      Object.keys(updates).forEach(key => {
        if (updates[key as keyof typeof updates] !== undefined) {
          updateData[key] = updates[key as keyof typeof updates];
        }
      });
      
      const { data, error } = await supabase
        .from('eos_todos')
        .update(updateData as never)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-todos', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-issue-todos'] });
      toast({ title: 'To-do updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating to-do', description: error.message, variant: 'destructive' });
    },
  });

  return {
    todos,
    isLoading,
    createTodo,
    updateTodo,
  };
};

export interface PastTodo {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  owner_id: string | null;
  ownerName: string | null;
  /** When it was completed (or, for a cancelled one, last changed). */
  closedAt: string | null;
  issueTitle: string | null;
}

/**
 * Past To-Dos: the completed and cancelled ones of this tenant, newest first, apart from this meeting's
 * own (those are already in the meeting's list). The meeting's list only carries open To-Dos forward, so
 * without this a finished To-Do disappears from view the moment its meeting is over. Loaded only when asked.
 * Keyed under 'meeting-todos' so reopening one refreshes it like every other To-Do list.
 */
export const usePastTodos = (meetingId: string | undefined, tenantId: number | undefined, enabled: boolean) => {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['meeting-todos', 'past', meetingId, tenantId],
    queryFn: async (): Promise<PastTodo[]> => {
      const { data, error } = await supabase
        .from('eos_todos')
        .select('id, title, status, due_date, owner_id, completed_at, updated_at, meeting_id, issue:eos_issues!eos_todos_issue_id_fkey(title)')
        .eq('tenant_id', tenantId!)
        .in('status', ['Complete', 'Cancelled'])
        .order('updated_at', { ascending: false })
        .limit(150);
      if (error) throw error;
      const rows = ((data ?? []) as unknown as Array<{
        id: string; title: string; status: string | null; due_date: string | null; owner_id: string | null;
        completed_at: string | null; updated_at: string | null; meeting_id: string | null; issue: { title: string } | null;
      }>).filter(row => row.meeting_id !== meetingId);
      const ownerIds = Array.from(new Set(rows.map(r => r.owner_id).filter((id): id is string => !!id)));
      const names: Record<string, string> = {};
      if (ownerIds.length > 0) {
        const { data: people } = await supabase.from('users').select('user_uuid, first_name, last_name').in('user_uuid', ownerIds);
        for (const person of people ?? []) names[person.user_uuid] = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Unknown';
      }
      return rows.map(row => ({
        id: row.id,
        title: row.title,
        status: row.status,
        due_date: row.due_date,
        owner_id: row.owner_id,
        ownerName: row.owner_id ? names[row.owner_id] ?? null : null,
        closedAt: row.completed_at ?? row.updated_at,
        issueTitle: row.issue?.title ?? null,
      }));
    },
    enabled: !!profile && enabled && !!meetingId && !!tenantId,
  });
};
