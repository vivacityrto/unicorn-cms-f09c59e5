import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { EosTodo } from '@/types/eos';

export const useMeetingTodos = (meetingId?: string) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data: todos, isLoading } = useQuery({
    queryKey: ['meeting-todos', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_todos')
        .select('*')
        .eq('meeting_id', meetingId!)
        .order('created_at', { ascending: false });
      
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
          tenant_id: profile?.tenant_id!,
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
      const updateData: Record<string, any> = {};
      Object.keys(updates).forEach(key => {
        if (updates[key as keyof typeof updates] !== undefined) {
          updateData[key] = updates[key as keyof typeof updates];
        }
      });
      
      const { data, error } = await supabase
        .from('eos_todos')
        .update(updateData)
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
