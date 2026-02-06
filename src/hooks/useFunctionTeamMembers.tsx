import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import type { VivacityTeamUser } from './useVivacityTeamUsers';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

/**
 * Team member assigned to a Functional Lead
 */
export interface FunctionTeamMember {
  id: string;
  tenant_id: number;
  function_id: string;
  user_id: string;
  created_at: string;
  created_by: string | null;
  sort_order: number;
  user?: VivacityTeamUser | null;
}

/**
 * Hook to manage team members assigned to Functional Leads.
 * 
 * Team members are Vivacity Team users who report directly to a Functional Lead.
 * This is NOT about child functions/departments - it's about people assignments.
 */
export function useFunctionTeamMembers(functionId: string | undefined) {
  const queryClient = useQueryClient();
  const tenantId = VIVACITY_TENANT_ID;

  // Fetch team members for a specific function
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ['function-team-members', functionId],
    queryFn: async (): Promise<FunctionTeamMember[]> => {
      if (!functionId) return [];

      const { data, error } = await supabase
        .from('eos_function_team_members')
        .select(`
          id,
          tenant_id,
          function_id,
          user_id,
          created_at,
          created_by,
          sort_order
        `)
        .eq('function_id', functionId)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Fetch user details for each team member
      const userIds = data.map(tm => tm.user_id);
      if (userIds.length === 0) return [];

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, avatar_url, unicorn_role, job_title')
        .in('user_uuid', userIds);

      if (usersError) throw usersError;

      const userMap = new Map(users?.map(u => [u.user_uuid, u]) || []);

      return data.map(tm => ({
        ...tm,
        user: userMap.get(tm.user_id) || null,
      }));
    },
    enabled: !!functionId,
    staleTime: QUERY_STALE_TIMES.LIST,
  });

  // Add team member
  const addTeamMember = useMutation({
    mutationFn: async ({ functionId, userId, createdBy }: { 
      functionId: string; 
      userId: string; 
      createdBy: string;
    }) => {
      // Calculate next sort_order
      const nextSortOrder = teamMembers.length;

      const { data, error } = await supabase
        .from('eos_function_team_members')
        .insert({
          tenant_id: tenantId,
          function_id: functionId,
          user_id: userId,
          created_by: createdBy,
          sort_order: nextSortOrder,
        })
        .select()
        .single();

      if (error) {
        // Check for unique constraint violation
        if (error.code === '23505') {
          throw new Error('This team member is already assigned to this function');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['function-team-members'] });
      toast({ title: 'Team member added' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error adding team member', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Remove team member
  const removeTeamMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('eos_function_team_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['function-team-members'] });
      toast({ title: 'Team member removed' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error removing team member', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Reorder team members
  const reorderTeamMembers = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update sort_order for each member
      const updates = orderedIds.map((id, index) => 
        supabase
          .from('eos_function_team_members')
          .update({ sort_order: index })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['function-team-members'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error reordering team members', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return {
    teamMembers,
    isLoading,
    addTeamMember,
    removeTeamMember,
    reorderTeamMembers,
  };
}

/**
 * Hook to fetch all team members for all functions in one query
 * Used at the chart level to avoid N+1 queries
 */
export function useAllFunctionTeamMembers(functionIds: string[]) {
  return useQuery({
    queryKey: ['all-function-team-members', functionIds],
    queryFn: async (): Promise<Map<string, FunctionTeamMember[]>> => {
      if (functionIds.length === 0) return new Map();

      const { data, error } = await supabase
        .from('eos_function_team_members')
        .select('*')
        .in('function_id', functionIds)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Fetch all user details
      const userIds = [...new Set(data.map(tm => tm.user_id))];
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, avatar_url, unicorn_role, job_title')
        .in('user_uuid', userIds);

      if (usersError) throw usersError;

      const userMap = new Map(users?.map(u => [u.user_uuid, u]) || []);

      // Group by function_id
      const grouped = new Map<string, FunctionTeamMember[]>();
      for (const tm of data) {
        const existing = grouped.get(tm.function_id) || [];
        existing.push({
          ...tm,
          user: userMap.get(tm.user_id) || null,
        });
        grouped.set(tm.function_id, existing);
      }

      return grouped;
    },
    enabled: functionIds.length > 0,
    staleTime: QUERY_STALE_TIMES.LIST,
  });
}
