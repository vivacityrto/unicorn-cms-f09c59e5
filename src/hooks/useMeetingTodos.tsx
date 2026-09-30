import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { EosTodo } from '@/types/eos';

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
      let query = supabase.from('eos_todos').select('*');
      query = tenantId
        ? query.or(`meeting_id.eq.${meetingId},and(status.eq.Open,tenant_id.eq.${tenantId})`)
        : query.eq('meeting_id', meetingId!);

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as EosTodo[];
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
